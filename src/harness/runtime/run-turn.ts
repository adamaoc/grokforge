/**
 * Main-process entry: one agent chat turn using the GrokForge harness.
 */

import { join } from 'node:path'
import type { GrokProjectManifest } from '../../main/project/manifest'
import { projectDir } from '../../main/project/store'
import { hasConfiguredXaiApiKey } from '../../main/xai/key-store'
import {
  normalizeGfPlanFencesInAssistantContent,
  parseGfPlanFromAssistantContent,
} from '../../harness-support/plan/contracts/gf-plan-contract'
import type {
  AgentChatEventPayload,
  AgentChatStartPayload,
} from '../../shared/agent/chat-contract'
import { buildPlanProjectSnapshot } from '../context/project-snapshot'
import { buildHarnessTurnSystemPrompt } from './build-turn-system-prompt'
import { estimateVisibleContextChars } from './compaction'
import { HarnessLogger, summarizeMessagesForLog } from '../logging/logger'
import { toHarnessModelError } from '../model/client'
import { runHarnessTurnLoop } from './loop'
import { resolveHarnessMaxToolIterations } from './config'
import { resolveHarnessWorkspace } from '../workspace/paths'
import {
  resolveHarnessProfile,
  resolveHarnessTurnMode,
  resolveHarnessTurnRouting,
} from '../profile/turn-routing'
import { HarnessSession } from '../session/session'
import type { HarnessCommandApprovalGate, HarnessToolRunContext } from '../tools/tool-context'

export type HarnessTurnDeps = {
  emit: (payload: AgentChatEventPayload) => void
  emitActivity: (
    streamId: string,
    activity: Omit<AgentChatEventPayload & { phase: 'activity' }, 'streamId' | 'phase'>['activity'],
  ) => void
  newActivityId: () => string
  getE2eMockReply?: () => string | null
  /** Main-process bridge: emit approval UI then block until user responds or turn aborts. */
  commandApproval: HarnessCommandApprovalGate
}

function harnessDirs(projectId: string) {
  const base = join(projectDir(projectId), 'minimal')
  return {
    logsDir: join(base, 'logs'),
    sessionsDir: join(base, 'sessions'),
  }
}

function streamFinalText(
  deps: HarnessTurnDeps,
  streamId: string,
  text: string,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let i = 0
    const tick = () => {
      if (signal.aborted) {
        reject(signal.reason ?? new Error('Aborted'))
        return
      }
      if (i >= text.length) {
        resolve()
        return
      }
      const chunk = text.slice(i, i + 80)
      i += 80
      deps.emit({ streamId, phase: 'final_chunk', delta: chunk })
      setTimeout(tick, 5)
    }
    tick()
  })
}

export async function runAgentHarnessTurn(
  deps: HarnessTurnDeps,
  payload: AgentChatStartPayload,
  manifest: GrokProjectManifest,
  projectId: string,
  ac: AbortController,
): Promise<void> {
  const { streamId } = payload
  const turnMode = resolveHarnessTurnMode(payload)
  const profile = resolveHarnessProfile(payload)
  const routing = resolveHarnessTurnRouting(manifest, payload)
  const workspace = resolveHarnessWorkspace(manifest, payload.activeContext.activeRootId)

  const snapshot =
    turnMode === 'plan'
      ? buildPlanProjectSnapshot(
          manifest,
          projectId,
          workspace.workspaceRoot,
          workspace.root.id,
        )
      : null

  const { systemPrompt, approvedPlanArtifact } = buildHarnessTurnSystemPrompt({
    turnMode,
    manifest,
    snapshot,
    profileKey: routing.harnessProfileKey,
    payload,
    projectId,
  })

  const { logsDir, sessionsDir } = harnessDirs(projectId)
  const logger = new HarnessLogger(logsDir, streamId)
  const session = new HarnessSession(streamId, sessionsDir)

  deps.emit({ streamId, phase: 'turn_started', routing })

  if (!hasConfiguredXaiApiKey()) {
    deps.emit({ streamId, phase: 'error', error: 'xAI API key not configured' })
    throw new Error('xAI API key not configured')
  }

  const mockReply = deps.getE2eMockReply?.()
  if (mockReply) {
    const id = deps.newActivityId()
    deps.emitActivity(streamId, {
      id,
      title: 'E2E mock agent reply',
      status: 'running',
    })
    deps.emitActivity(streamId, { id, title: 'E2E mock reply ready', status: 'done' })
    await streamFinalText(deps, streamId, mockReply, ac.signal)
    deps.emit({ streamId, phase: 'activity_clear_running', reason: 'done' })
    deps.emit({ streamId, phase: 'done' })
    return
  }

  // The renderer-provided thread snapshot is the source of truth for this turn.
  await session.addMessage('system', systemPrompt)
  await session.seedFromThread(payload.threadSnapshot)

  const approxContextChars = estimateVisibleContextChars(session)
  await logger.event('turn_start', {
    turnMode,
    harnessProfileId: profile.id,
    modelId: routing.modelId,
    modelIntent: routing.modelIntent,
    agentProfileId: routing.agentProfileId,
    workspaceRoot: workspace.workspaceRoot,
    rootId: workspace.root.id,
    rootCount: manifest.roots.length,
    messageCount: session.getHistory().length,
    approxContextChars,
    ...(turnMode === 'plan' && snapshot
      ? {
          greenfieldWorkspace: snapshot.greenfieldWorkspace,
          planDocPaths: snapshot.existingDocPaths,
        }
      : {}),
    ...(payload.isApprovedPlanAutoRun
      ? {
          isApprovedPlanAutoRun: true,
          approvedPlanId: payload.approvedPlanId,
          approvedPlanStepCount: approvedPlanArtifact?.plan.steps.length ?? 0,
          approvedPlanLoaded: Boolean(approvedPlanArtifact),
        }
      : {}),
  })

  await logger.event('context_snapshot', {
    systemPrompt,
    apiMessages: summarizeMessagesForLog(session.getHistory()),
    approxContextChars,
  })

  const toolActivityIds = new Map<string, string>()

  const toolContext: HarnessToolRunContext = {
    projectId,
    streamId,
    manifest,
    activeContext: payload.activeContext,
    activeRootId: workspace.root.id,
    signal: ac.signal,
    commandApproval: deps.commandApproval,
    emit: deps.emit,
    updateToolActivity(update) {
      deps.emitActivity(streamId, {
        id: update.id,
        tool: 'run_command',
        title: update.title ?? 'run_command',
        detail: update.detail,
        status: update.status ?? 'running',
      })
    },
  }

  let result: { finalText: string; steps: number }
  try {
    result = await runHarnessTurnLoop({
      session,
      toolEnv: { manifest, projectId },
      modelId: routing.modelId,
      maxToolIterations: resolveHarnessMaxToolIterations(turnMode),
      userInput: payload.userText,
      profile,
      logger,
      signal: ac.signal,
      toolContext: turnMode === 'work' ? toolContext : undefined,
      approvedPlanId: payload.isApprovedPlanAutoRun ? payload.approvedPlanId : undefined,
      callbacks: {
        onToolStart(name, toolCallId) {
          const id = deps.newActivityId()
          toolActivityIds.set(toolCallId, id)
          deps.emitActivity(streamId, {
            id,
            ...(name === 'read_file' || name === 'edit'
              ? { tool: name as 'read_file' | 'edit' }
              : name === 'run_command'
                ? { tool: 'run_command' as const }
                : {}),
            title: name,
            status: 'running',
          })
          return id
        },
        onToolDone(name, toolCallId, activityId, ok) {
          if (name === 'run_command') return
          const id = toolActivityIds.get(toolCallId) ?? activityId
          deps.emitActivity(streamId, {
            id,
            title: name,
            status: ok ? 'done' : 'error',
          })
        },
      },
    })
  } catch (e) {
    if (ac.signal.aborted) throw e
    const message = toHarnessModelError(e).message
    deps.emit({ streamId, phase: 'error', error: message })
    await logger.event('turn_error', { error: message })
    throw e
  }

  const finalTextForClient =
    turnMode === 'plan'
      ? normalizeGfPlanFencesInAssistantContent(result.finalText)
      : result.finalText

  const parsedPlan =
    turnMode === 'plan' ? parseGfPlanFromAssistantContent(finalTextForClient) : null

  await logger.event('turn_done', {
    finalChars: finalTextForClient.length,
    steps: result.steps,
    approxContextChars: estimateVisibleContextChars(session),
    ...(turnMode === 'plan'
      ? {
          hasValidGfPlan: Boolean(parsedPlan),
          gfPlanStepCount: parsedPlan?.steps.length ?? 0,
          normalizedPlanFence: finalTextForClient !== result.finalText,
        }
      : {}),
  })

  await streamFinalText(deps, streamId, finalTextForClient, ac.signal)
  deps.emit({ streamId, phase: 'activity_clear_running', reason: 'done' })
  deps.emit({ streamId, phase: 'done' })
}