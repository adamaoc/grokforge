import type { AgentToolBatchPayload } from './agent-tool-contract'
import type { AgentContextPin } from './agent-context-pins-contract'

/**
 * Agent chat IPC contract (no Node imports). Main implementation: `src/main/agent-runner.ts`.
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

export type AgentChatActiveContext = {
  activeRootId?: string | null
  activeFilePath?: string | null
  selectedTreePath?: string | null
  openTabs: Array<{ path: string; dirty: boolean }>
  attachments?: AgentChatAttachment[]
  /** Persisted per-project pins (also in app storage); biases retrieval and active context. */
  pinned?: AgentContextPin[]
  editorSelection?: AgentChatEditorSelection | null
  chatMode: 'fast' | 'plan'
}

export type AgentChatThreadMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export type AgentChatStartPayload = {
  streamId: string
  model: string
  userText: string
  threadSnapshot: AgentChatThreadMessage[]
  activeContext: AgentChatActiveContext
}

export type AgentChatStartResult =
  | { ok: true; streamId: string }
  | { ok: false; error: string }

export type AgentChatCapabilitiesResult = {
  apiKeyConfigured: boolean
}

export type RefreshProjectIntelligenceResult =
  | { ok: true; updatedAt: string; fileCountScanned: number; sensitiveSkipped: number }
  | { ok: false; error: string }

export type AgentChatToolName =
  | 'workspace_index'
  | 'list_directory'
  | 'read_file'
  | 'search_workspace'
  | 'search_replace'
  | 'run_command'
  | 'propose_file_edits'

export type AgentCommandApprovalRisk = 'safe' | 'soft_risk' | 'network_or_install'

export type AgentCommandApprovalRequest = {
  requestId: string
  streamId: string
  rootId: string
  rootLabel: string
  rootPath: string
  command: string
  timeoutMs: number
  purpose: string
  risk: AgentCommandApprovalRisk
  policyReason: string
}

export type AgentCommandApprovalResponse = {
  streamId: string
  requestId: string
  approved: boolean
}

export type AgentCommandApprovalRespondResult =
  | { ok: true }
  | { ok: false; error: string }

export type AgentChatActivityPayload = {
  id: string
  tool?: AgentChatToolName | 'retrieval'
  title: string
  detail?: string
  status: 'running' | 'done' | 'error'
}

export type AgentEditProposalRejectedFile = {
  path: string
  reason: string
}

export type AgentEditProposalPayload = {
  batch: AgentToolBatchPayload
  rejected: AgentEditProposalRejectedFile[]
}

export type ValidateAgentEditBatchPayload = {
  streamId: string
  batch: AgentToolBatchPayload
  activeContext: AgentChatActiveContext
}

export type ValidateAgentEditBatchResult =
  | { ok: true; proposal: AgentEditProposalPayload }
  | { ok: false; error: string; proposal?: AgentEditProposalPayload }

export type AgentChatEventPayload =
  | { streamId: string; phase: 'turn_started' }
  | { streamId: string; phase: 'activity'; activity: AgentChatActivityPayload }
  | { streamId: string; phase: 'command_approval_required'; request: AgentCommandApprovalRequest }
  | { streamId: string; phase: 'edit_proposal'; proposal: AgentEditProposalPayload }
  | { streamId: string; phase: 'activity_clear_running'; reason: 'done' | 'cancelled' | 'error' }
  | { streamId: string; phase: 'final_chunk'; delta: string }
  | { streamId: string; phase: 'done' }
  | { streamId: string; phase: 'error'; error: string }
  | { streamId: string; phase: 'cancelled' }
