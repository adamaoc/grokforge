import type { AgentProviderId } from './provider-contract'
import type { AgentTurnChanges } from './checkpoint-contract'

/**
 * Agent chat IPC contract (no Node imports). Main implementation: `src/main/agent/runner.ts`
 * → `src/main/acp/`. Turns run on an external coding agent over ACP.
 */

export const AGENT_CHAT_MAX_STREAM_ID_LEN = 128
export const AGENT_CHAT_MAX_USER_TEXT_CHARS = 100_000
export const AGENT_CHAT_MAX_THREAD_MESSAGES = 80
export const AGENT_CHAT_MAX_MESSAGE_CHARS = 100_000
export const AGENT_CHAT_MAX_OPEN_TABS = 24
export const AGENT_CHAT_MAX_ATTACHMENTS = 12
export const AGENT_CHAT_SELECTION_MAX_CHARS = 4_000

export type AgentChatAttachment = {
  type: 'file' | 'folder'
  path: string
  /** Workspace tree vs user upload (staged under app userData). */
  source?: 'workspace' | 'upload'
  /** Original filename for chips / UI when `path` is a staged copy. */
  displayName?: string
  mediaType?: string
  /** Known size in bytes (uploads); optional for workspace paths. */
  byteSize?: number
}

export type AgentChatEditorSelection = {
  path: string
  startLine: number
  endLine: number
  text?: string
  truncated: boolean
}

export type AgentChatMode = 'fast' | 'plan'

export type AgentChatActiveContext = {
  /** Root the agent session starts in (defaults to the first root). */
  activeRootId?: string | null
  activeFilePath?: string | null
  openTabs: Array<{ path: string; dirty: boolean }>
  attachments?: AgentChatAttachment[]
  editorSelection?: AgentChatEditorSelection | null
  chatMode: AgentChatMode
}

export type AgentChatThreadMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

/**
 * How edits are approved. `trust`: ask before each edit (diff review). `velocity`: the agent
 * applies edits without asking; commands still ask, and every turn can be undone.
 * (Stored values keep their original names for compatibility.)
 */
export type ReviewMode = 'trust' | 'velocity'

export type AgentTurnRouting = {
  provider: { id: AgentProviderId; label: string }
  /** Model the agent reports, when it does (e.g. "Opus 5.5", "grok-4.6"). */
  modelLabel?: string
}

export type AgentChatStartPayload = {
  streamId: string
  userText: string
  threadSnapshot: AgentChatThreadMessage[]
  activeContext: AgentChatActiveContext
  reviewMode?: ReviewMode
}

export type AgentChatStartResult =
  | { ok: true; streamId: string }
  | { ok: false; error: string }

export type AgentChatCapabilitiesResult = {
  providerId: AgentProviderId
  providerLabel: string
  /** True when the selected agent's CLI was found. */
  providerReady: boolean
  /** Install / sign-in guidance when `providerReady` is false. */
  providerHint?: string
}

/** A proposed file change attached to an agent permission request. */
export type AgentPermissionDiff = {
  path: string
  /** 1-based line in the file where `oldText` starts, when the agent sent a snippet. */
  startLine?: number
  /** `null` when the agent is creating a new file. */
  oldText: string | null
  newText: string
}

/** What an approval card asks about. */
export type AgentApprovalKind = 'edit' | 'command' | 'permission'

export type AgentApprovalRequest = {
  requestId: string
  streamId: string
  kind: AgentApprovalKind
  /** Deletes and other hard-to-review actions: red tone + acknowledgement checkbox. */
  destructive?: boolean
  providerLabel: string
  /** One-line explanation under the heading. */
  detail: string
  /** Command line, or the agent's request text for generic permissions. */
  body: string
  /** Short description the agent gave (commands). */
  purpose?: string
  rootId: string
  rootLabel: string
  rootPath: string
  /** Proposed file changes to review before allowing (edits). */
  diffs?: AgentPermissionDiff[]
}

export type AgentApprovalResponse = {
  streamId: string
  requestId: string
  approved: boolean
  /** `turn`: also allow later edits for the rest of this turn. */
  scope?: 'once' | 'turn'
}

export type AgentApprovalDecision = { approved: boolean; scope: 'once' | 'turn' }

export type AgentApprovalRespondResult = { ok: true } | { ok: false; error: string }

export type AgentChatActivityPayload = {
  id: string
  title: string
  detail?: string
  status: 'running' | 'done' | 'error' | 'interrupted' | 'awaiting_approval' | 'rejected'
  /** Workspace path the step touches (file focus, grouping). */
  subjectPath?: string
}

export type AgentChatEventPayload =
  | { streamId: string; phase: 'turn_started'; routing: AgentTurnRouting }
  | { streamId: string; phase: 'activity'; activity: AgentChatActivityPayload }
  | { streamId: string; phase: 'approval_required'; request: AgentApprovalRequest }
  | {
      streamId: string
      phase: 'activity_clear_running'
      reason: 'done' | 'cancelled' | 'error' | 'interrupted'
    }
  | { streamId: string; phase: 'final_chunk'; delta: string }
  /** Files changed during the turn, sent before `done` / `error` / `cancelled`. */
  | { streamId: string; phase: 'turn_changes'; changes: AgentTurnChanges }
  | {
      streamId: string
      phase: 'done'
      /** The agent stopped at a token or request limit rather than finishing. */
      turnOutcome?: 'complete' | 'limit_reached'
    }
  | { streamId: string; phase: 'error'; error: string }
  | { streamId: string; phase: 'cancelled' }
