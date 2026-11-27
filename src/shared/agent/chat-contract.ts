import type { AgentToolBatchPayload } from '../../harness-support/tools/contracts/tool-contract'
import type { AgentContextPin } from '../../harness-support/context/context-pins-contract'
import type { AgentProfileId } from '../../harness-support/profiles/agent-profile'
import type { HarnessProfileKey } from '../../harness-support/profiles/contracts/harness-profile-key'
import type { ReasoningEffort } from '../../harness-support/profiles/reasoning-effort'
import type { ModelIntent } from '../../harness-support/routing/model-router'
import type { AgentSubagentEventPayload } from '../../harness-support/subagent/contracts/subagent-contract'
import type { AgentProposalReview } from './proposal-reviewer'
import type { AgentProviderId } from './provider-contract'

/**
 * Agent chat IPC contract (no Node imports). Main implementation: `src/main/agent/runner.ts`.
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
  /** Legacy renderer hint only. Harness tools do not scope reads/writes/edits to this root. */
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

/** Trust = manual apply; velocity = auto-apply valid proposals at turn end (GFAPP-017). */
export type HarnessTemperament = 'trust' | 'velocity'

export type AgentChatTurnRouting = {
  modelIntent: AgentChatTextModelIntent
  modelId: string
  harnessProfileKey: HarnessProfileKey
  agentProfileId: AgentProfileId
  /** Chat completions `reasoning_effort` when supported (story 121). */
  reasoningEffort?: ReasoningEffort
  /** Which coding agent ran the turn. Omitted for legacy turns (built-in Grok API harness). */
  provider?: { id: AgentProviderId; label: string }
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
  /** Renderer setting; logged on turn_start (velocity auto-apply stays renderer-side). */
  harnessTemperament?: HarnessTemperament
}

export type AgentChatStartResult =
  | { ok: true; streamId: string }
  | { ok: false; error: string }

export type AgentChatCapabilitiesResult = {
  /** xAI key present (only required by the built-in `grok-api` provider). */
  apiKeyConfigured: boolean
  providerId: AgentProviderId
  providerLabel: string
  /** True when the selected provider can start a turn (CLI found, or API key set). */
  providerReady: boolean
  /** Install / sign-in guidance when `providerReady` is false. */
  providerHint?: string
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

/** A proposed file change attached to an external-agent permission request. */
export type AgentPermissionDiff = {
  path: string
  /** `null` when the agent is creating a new file. */
  oldText: string | null
  newText: string
}

/**
 * What the approval card is asking about. `command` is the legacy harness `run_command`
 * gate; `edit` / `permission` come from external agents (ACP `session/request_permission`).
 */
export type AgentApprovalKind = 'command' | 'edit' | 'permission'

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
  /** Defaults to `command`. */
  kind?: AgentApprovalKind
  /** Agent that is asking (external providers only). */
  providerLabel?: string
  /** Proposed file changes to review before allowing (edit permissions). */
  diffs?: AgentPermissionDiff[]
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
  | {
      streamId: string
      phase: 'done'
      /** Set when the harness stopped early but the turn should still finalize (e.g. tool cap). */
      turnOutcome?: 'complete' | 'iteration_exhausted'
    }
  | { streamId: string; phase: 'error'; error: string }
  | { streamId: string; phase: 'cancelled' }
