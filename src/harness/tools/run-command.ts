/**
 * Harness v2 adapter for the legacy {@link executeRunCommandTool} implementation.
 * Keeps policy, spawn, scaffold checks, and workspace refresh in harness-support.
 */

import { randomUUID } from 'node:crypto'
import type { AgentToolExecutionContext } from '../../harness-support/tools/contracts/execution-context'
import { createThrottledProgress } from '../../harness-support/tools/contracts/execution-context'
import {
  executeRunCommandTool,
  parseRunCommandToolArgs,
} from '../../harness-support/tools/run-command-tool'
import { isMultiRootManifest } from '../workspace/paths'
import type { HarnessToolRunContext } from './tool-context'

function progressStatus(title: string | undefined):
  | 'running'
  | 'awaiting_approval'
  | 'rejected'
  | 'done'
  | 'error' {
  const t = (title ?? '').toLowerCase()
  if (t.includes('awaiting approval')) return 'awaiting_approval'
  if (t.includes('rejected')) return 'rejected'
  if (t.includes('failed') || t.includes('blocked')) return 'error'
  if (t.includes('finished')) return 'done'
  return 'running'
}

function buildAgentToolContext(
  harnessCtx: HarnessToolRunContext,
  toolCallId: string,
  activityId: string,
): AgentToolExecutionContext {
  const emitProgress = createThrottledProgress((update) => {
    harnessCtx.updateToolActivity({
      id: activityId,
      title: update.title ?? 'run_command',
      detail: update.detail,
      status: progressStatus(update.title),
    })
  })

  return {
    projectId: harnessCtx.projectId,
    streamId: harnessCtx.streamId,
    snapshotId: harnessCtx.streamId,
    toolCallId,
    activityId,
    toolName: 'run_command',
    agentProfileId: 'executor',
    harnessProfileKey: 'grok_code_fast',
    sessionDepth: 'parent',
    abortSignal: harnessCtx.signal,
    manifest: harnessCtx.manifest,
    roots: harnessCtx.manifest.roots,
    activeContext: harnessCtx.activeContext,
    readPathsThisTurn: new Set(),
    readHashesThisTurn: new Map(),
    emitProgress,
    recordPathRead: () => {},
    askCommandApproval: async ({ requestId, request }) => {
      harnessCtx.emit({
        streamId: harnessCtx.streamId,
        phase: 'command_approval_required',
        request: {
          requestId,
          streamId: harnessCtx.streamId,
          ...request,
        },
      })
      return harnessCtx.commandApproval.requestApproval({ requestId, request })
    },
  }
}

export async function executeRunCommandHarnessTool(
  harnessCtx: HarnessToolRunContext,
  argsJson: string,
  toolCallId: string,
  activityId: string,
): Promise<{ ok: boolean; text: string }> {
  let raw: unknown
  try {
    raw = JSON.parse(argsJson) as unknown
  } catch {
    return { ok: false, text: 'Invalid tool arguments JSON for run_command.' }
  }

  const rootIdFromArgs =
    raw &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    typeof (raw as { rootId?: unknown }).rootId === 'string'
      ? (raw as { rootId: string }).rootId.trim()
      : ''

  if (isMultiRootManifest(harnessCtx.manifest) && !rootIdFromArgs) {
    const options = harnessCtx.manifest.roots.map((r) => r.id).join(', ')
    return {
      ok: false,
      text: JSON.stringify({
        ok: false,
        error: `run_command requires rootId when the project has multiple workspace roots. Options: ${options}`,
      }),
    }
  }

  const withRoot =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? {
          ...(raw as Record<string, unknown>),
          rootId: rootIdFromArgs || harnessCtx.manifest.roots[0]?.id,
        }
      : raw

  const parsed = parseRunCommandToolArgs(withRoot)
  if (!parsed.success) {
    return {
      ok: false,
      text: JSON.stringify({
        ok: false,
        error: 'Invalid run_command arguments.',
        details: parsed.error.flatten(),
      }),
    }
  }

  const agentCtx = buildAgentToolContext(harnessCtx, toolCallId, activityId)
  const requestId = randomUUID()

  try {
    const outcome = await executeRunCommandTool(agentCtx, parsed.data, {
      requestId,
      manifest: harnessCtx.manifest,
    })

    const terminalStatus =
      outcome.ok
        ? 'done'
        : outcome.displayTitle === 'Command rejected'
          ? 'rejected'
          : 'error'

    harnessCtx.updateToolActivity({
      id: activityId,
      title: outcome.displayTitle ?? 'run_command',
      detail: outcome.displayDetail,
      status: terminalStatus,
    })

    return { ok: outcome.ok, text: outcome.content }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    harnessCtx.updateToolActivity({
      id: activityId,
      title: 'run_command',
      detail: message,
      status: 'error',
    })
    return {
      ok: false,
      text: JSON.stringify({ ok: false, error: message }),
    }
  }
}