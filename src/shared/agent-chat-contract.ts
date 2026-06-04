import type { AgentToolBatchPayload } from '../harness/tools/contracts/tool-contract'
import type { AgentContextPin } from '../harness/context/context-pins-contract'
import type { AgentProfileId } from '../harness/profiles/agent-profile'
import type { HarnessProfileKey } from '../harness/profiles/contracts/harness-profile-key'
import type { ReasoningEffort } from '../harness/profiles/reasoning-effort'
import type { ModelIntent } from '../harness/routing/model-router'
import type { AgentSubagentEventPayload } from '../harness/subagent/contracts/subagent-contract'
import type { AgentProposalReview } from './agent-proposal-reviewer'

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

/** Text agent-chat intents (subset of {@link ModelIntent}). */
export type AgentChatTextModelIntent = Extract<ModelIntent, 'chat_default' | 'planning' | 'execution'>

export type AgentChatTurnRouting = {
  modelIntent: AgentChatTextModelIntent
  modelId: string
  harnessProfileKey: HarnessProfileKey
  agentProfileId: AgentProfileId
  /** Chat completions `reasoning_effort` when supported (story 121). */
  reasoningEffort?: ReasoningEffort
}

export type AgentChatStartPayload = {
  streamId: string
  /** Renderer hint only; main uses {@link AgentChatTurnRouting.modelId} for xAI (story 097). */
  model: string
  /** Composer chip override; main resolves canonical intent when omitted. */
  modelIntent?: AgentChatTextModelIntent
  /** Story 069 approve-and-run; main forces executor profile + models.execution. */
  isApprovedPlanAutoRun?: boolean
  /** Story 109 — durable plan artifact id for execute handoff. */
  approvedPlanId?: string
  /** Story 109 — assistant message id that produced the plan. */
  approvedPlanMessageId?: string
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
  | { ok: true; updatedAt: string; fileCountScanned: number; sensitiveSkipped: number; isGreenfield: boolean }
  | { ok: false; error: string }

export type AgentChatToolName =
  | 'workspace_index'
  | 'list_directory'
  | 'read_file'
  | 'search_workspace'
  | 'search_replace'
  | 'edit'              // New preferred structured edit tool (Pi-style)
  | 'run_command'
  | 'propose_file_edits'
  | 'spawn_subagent'

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
  /** Optional harness warning (e.g. non-empty scaffold target). Does not block approval. */
  warning?: string
}

export type AgentCommandApprovalResponse = {
  streamId: string
  requestId: string
  approved: boolean
}

export type AgentCommandApprovalRespondResult =
  | { ok: true }
  | { ok: false; error: string }

/** Harness mid-turn nudge row semantics (story 134). */
export type HarnessInterventionKind = 'correction' | 'blocked' | 'info'

export type AgentChatActivityPayload = {
  id: string
  tool?: AgentChatToolName | 'retrieval'
  title: string
  detail?: string
  status: 'running' | 'done' | 'error' | 'interrupted' | 'awaiting_approval' | 'rejected' | 'timeout'
  /** Resolved workspace path for edit tools — groups activity compaction (story 119). */
  subjectPath?: string
  /** Story 112 — nest activity under a child subagent session. */
  childSessionId?: string
  /** Story 134 — correction vs failure framing for harness intervention rows. */
  harnessKind?: HarnessInterventionKind
}

export type AgentEditProposalRejectedFile = {
  path: string
  reason: string
}

export type AgentEditProposalPayload = {
  batch: AgentToolBatchPayload
  rejected: AgentEditProposalRejectedFile[]
  /** Optional non-blocking reviewer feedback attached before the proposal reaches the UI. */
  review?: AgentProposalReview
}

export type AgentChatEventPayload =
  | { streamId: string; phase: 'turn_started'; routing: AgentChatTurnRouting }
  | { streamId: string; phase: 'activity'; activity: AgentChatActivityPayload }
  | { streamId: string; phase: 'command_approval_required'; request: AgentCommandApprovalRequest }
  | { streamId: string; phase: 'edit_proposal'; proposal: AgentEditProposalPayload }
  | {
      streamId: string
      phase: 'activity_clear_running'
      reason: 'done' | 'cancelled' | 'error' | 'interrupted'
    }
  | { streamId: string; phase: 'subagent'; subagent: AgentSubagentEventPayload }
  | { streamId: string; phase: 'final_chunk'; delta: string }
  | { streamId: string; phase: 'done' }
  | { streamId: string; phase: 'error'; error: string }
  | { streamId: string; phase: 'cancelled' }
