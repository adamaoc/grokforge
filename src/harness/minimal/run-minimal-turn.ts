/**
 * Main-process entry: one agent chat turn using the minimal harness.
 * Called from `agent-runner.ts` when {@link isMinimalHarnessEnabled} is true.
 */

import { join } from 'node:path'
import type { GrokProjectManifest } from '../../main/manifest'
import { projectDir } from '../../main/app-project-store'
import { hasConfiguredXaiApiKey } from '../../main/xai-key-store'
import type {
  AgentChatEventPayload,
  AgentChatStartPayload,
} from '../../shared/agent-chat-contract'
import { estimateVisibleContextChars } from './compaction'
import { isMinimalHarnessEnabled } from './config'
import { MinimalHarnessLogger, summarizeMessagesForLog } from './logger'
import { runMinimalTurn } from './loop'
import { resolveMinimalWorkspace } from './paths'
import { buildMinimalSystemPrompt, minimalTurnRouting } from './profile'
import { MinimalSession } from './session'

export { isMinimalHarnessEnabled }

export type MinimalTurnDeps = {
  emit: (payload: AgentChatEventPayload) => void
  emitActivity: (
    streamId: string,
    activity: Omit<AgentChatEventPayload & { phase: 'activity' }, 'streamId' | 'phase'>['activity'],
  ) => void
  newActivityId: () => string
  getE2eMockReply?: () => string | null
}

function minimalDirs(projectId: string) {
  const base = join(projectDir(projectId), 'minimal')
  return {
    logsDir: join(base, 'logs'),
    sessionsDir: join(base, 'sessions'),
  }
}

function streamFinalText(
  deps: MinimalTurnDeps,
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

export async function runMinimalAgentTurn(
  deps: MinimalTurnDeps,
  payload: AgentChatStartPayload,
  manifest: GrokProjectManifest,
  projectId: string,
  ac: AbortController,
): Promise<void> {
  const { streamId } = payload
  const routing = minimalTurnRouting(manifest)
  const workspace = resolveMinimalWorkspace(manifest, payload.activeContext.activeRootId)
  const systemPrompt = buildMinimalSystemPrompt(manifest, workspace.displayLabel)
  const { logsDir, sessionsDir } = minimalDirs(projectId)
  const logger = new MinimalHarnessLogger(logsDir, streamId)
  const session = new MinimalSession(streamId, sessionsDir)

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

  // v0: UI `threadSnapshot` is the source of truth each turn (avoids duplicate history vs disk).
  await session.addMessage('system', systemPrompt)
  await session.seedFromThread(payload.threadSnapshot)

  const approxContextChars = estimateVisibleContextChars(session)
  await logger.event('turn_start', {
    modelId: routing.modelId,
    workspaceRoot: workspace.workspaceRoot,
    rootId: workspace.root.id,
    messageCount: session.getHistory().length,
    approxContextChars,
  })

  await logger.event('context_snapshot', {
    systemPrompt,
    apiMessages: summarizeMessagesForLog(session.getHistory()),
    approxContextChars,
  })

  const toolActivityIds = new Map<string, string>()

  let result: { finalText: string; steps: number }
  try {
    result = await runMinimalTurn({
      session,
      workspaceRoot: workspace.workspaceRoot,
      modelId: routing.modelId,
      userInput: payload.userText,
      logger,
      signal: ac.signal,
      callbacks: {
        onToolStart(name) {
          const id = deps.newActivityId()
          toolActivityIds.set(name, id)
          deps.emitActivity(streamId, {
            id,
            ...(name === 'read_file' || name === 'edit'
              ? { tool: name as 'read_file' | 'edit' }
              : {}),
            title: name,
            status: 'running',
          })
        },
        onToolDone(name, ok) {
          const id = toolActivityIds.get(name) ?? deps.newActivityId()
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
    const message = e instanceof Error ? e.message : 'Minimal agent turn failed'
    deps.emit({ streamId, phase: 'error', error: message })
    await logger.event('turn_error', { error: message })
    throw e
  }

  await logger.event('turn_done', {
    finalChars: result.finalText.length,
    steps: result.steps,
    approxContextChars: estimateVisibleContextChars(session),
  })

  await streamFinalText(deps, streamId, result.finalText, ac.signal)
  deps.emit({ streamId, phase: 'activity_clear_running', reason: 'done' })
  deps.emit({ streamId, phase: 'done' })
}
