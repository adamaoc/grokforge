/**
 * Harness v2 adapters for workspace_index and search_workspace (harness-support implementations).
 */

import type { AgentChatActiveContext } from '../../shared/agent/chat-contract'
import type { AgentToolExecutionContext } from '../../harness-support/tools/contracts/execution-context'
import {
  executeSearchWorkspaceTool,
  executeWorkspaceIndexTool,
} from '../../harness-support/tools/workspace-tools'
import type { HarnessToolRunContext } from './tool-context'
import type { HarnessToolEnv } from '../workspace/paths'

function defaultActiveContext(): AgentChatActiveContext {
  return { openTabs: [], chatMode: 'fast' }
}

export function toWorkspaceToolExecutionContext(input: {
  env: HarnessToolEnv
  toolContext?: HarnessToolRunContext
  signal?: AbortSignal
}): AgentToolExecutionContext | { error: string } {
  const projectId = input.env.projectId?.trim()
  if (!projectId) {
    return { error: 'workspace_index and search_workspace require an active project context.' }
  }

  const toolContext = input.toolContext
  const signal = input.signal ?? toolContext?.signal ?? new AbortController().signal

  return {
    projectId,
    streamId: toolContext?.streamId ?? '',
    snapshotId: '',
    toolCallId: '',
    activityId: '',
    agentProfileId: 'default',
    harnessProfileKey: 'generic',
    sessionDepth: 'parent',
    abortSignal: signal,
    manifest: input.env.manifest,
    roots: input.env.manifest.roots,
    activeContext: toolContext?.activeContext ?? defaultActiveContext(),
    readPathsThisTurn: new Set(),
    readHashesThisTurn: new Map(),
    emitProgress: () => {},
    recordPathRead: () => {},
    askCommandApproval: async () => false,
  }
}

export function runHarnessWorkspaceIndexTool(
  env: HarnessToolEnv,
  rawArgs: unknown,
  options?: { toolContext?: HarnessToolRunContext; signal?: AbortSignal },
): { ok: boolean; text: string } {
  const ctx = toWorkspaceToolExecutionContext({ env, ...options })
  if ('error' in ctx) return { ok: false, text: ctx.error }
  const result = executeWorkspaceIndexTool(ctx, rawArgs)
  return { ok: result.ok, text: result.content }
}

export function runHarnessSearchWorkspaceTool(
  env: HarnessToolEnv,
  rawArgs: unknown,
  options?: { toolContext?: HarnessToolRunContext; signal?: AbortSignal },
): { ok: boolean; text: string } {
  const ctx = toWorkspaceToolExecutionContext({ env, ...options })
  if ('error' in ctx) return { ok: false, text: ctx.error }
  const result = executeSearchWorkspaceTool(ctx, rawArgs)
  return { ok: result.ok, text: result.content }
}