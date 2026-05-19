import type {
  AgentChatActiveContext,
  AgentChatToolName,
  AgentCommandApprovalRequest,
} from './agent-chat-contract'
import type { AgentProfileId } from './agent-profile'
import type { HarnessProfileKey } from './agent-harness-profile-contract'
import type { GrokProjectManifest } from '../main/manifest'

export type AgentToolProgressUpdate = {
  title?: string
  detail?: string
}

export type AgentSessionDepth = 'parent' | 'child'

export type AgentToolExecutionContext = {
  projectId: string
  streamId: string
  snapshotId: string
  toolCallId: string
  activityId: string
  toolName?: AgentChatToolName
  agentProfileId: AgentProfileId
  harnessProfileKey: HarnessProfileKey
  sessionDepth: AgentSessionDepth
  /** When set, read-before-write registry keys off this id instead of streamId. */
  childSessionId?: string
  abortSignal: AbortSignal
  manifest: GrokProjectManifest
  roots: GrokProjectManifest['roots']
  activeContext: AgentChatActiveContext
  readPathsThisTurn: ReadonlySet<string>
  readHashesThisTurn: ReadonlyMap<string, string>
  emitProgress: (update: AgentToolProgressUpdate) => void
  recordPathRead: (resolvedAbsolutePath: string, contentHash: string) => void
  askCommandApproval: (input: {
    requestId: string
    request: Omit<AgentCommandApprovalRequest, 'streamId' | 'requestId'>
  }) => Promise<boolean>
}

const DEFAULT_PROGRESS_THROTTLE_MS = 500

/**
 * Throttles progress callbacks (leading + trailing) for long workspace tools.
 */
export function createThrottledProgress(
  emit: (update: AgentToolProgressUpdate) => void,
  intervalMs: number = DEFAULT_PROGRESS_THROTTLE_MS,
): (update: AgentToolProgressUpdate) => void {
  let lastEmitMs = 0
  let pending: AgentToolProgressUpdate | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  const flush = () => {
    if (!pending) return
    const update = pending
    pending = null
    lastEmitMs = Date.now()
    emit(update)
  }

  return (update: AgentToolProgressUpdate) => {
    const now = Date.now()
    if (now - lastEmitMs >= intervalMs) {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      pending = null
      lastEmitMs = now
      emit(update)
      return
    }
    pending = { ...pending, ...update }
    if (timer) return
    timer = setTimeout(() => {
      timer = null
      flush()
    }, intervalMs - (now - lastEmitMs))
  }
}
