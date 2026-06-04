import type {
  AddWorkspaceRootResult,
  GrokProjectManifest,
  Root,
  OpenProjectResult,
  ProjectSessionSnapshot,
  DirectoryEntry,
  ReadDirectoryResult,
} from '../../main/manifest'
import type {
  AgentContextPreview,
  GetAgentContextPreviewResult,
  GetChatSystemPromptResult,
} from '../../harness/context/context'
import type {
  GrokApiMessage,
  GrokApiRole,
  GrokStreamCapabilitiesResult,
  GrokStreamEventPayload,
  GrokStreamStartPayload,
  GrokStreamStartResult,
} from '../../main/grok-types'
import type {
  AppendChatMessageResult,
  ChatTurnContextV1,
  ClearChatThreadResult,
  LoadChatThreadResult,
  PersistedChatLineV1,
} from '../../main/chat-store'
import { CHAT_STORE_SCHEMA_VERSION } from '../../shared/chat-thread-schema'
import type { GetModelForIntentOptions, ModelIntent } from '../../harness/routing/model-router'
import { getModelForIntent, DUAL_MODEL_FALLBACKS, MODEL_INTENT_MANIFEST_KEYS } from '../../harness/routing/model-router'
import type { VoiceRealtimeServerEvent, VoiceSessionStartResult } from '../../main/voice-realtime'
import type { GitDiffSessionResult, GitStatusSummary } from '../../main/git'
import {
  type SearchWorkspaceProgressPayload,
  type SearchWorkspaceRequest,
  type SearchWorkspaceResult,
  type SearchWorkspaceRow,
  SEARCH_MAX_FILE_BYTES,
  SEARCH_MAX_FILES_SCANNED,
  SEARCH_MAX_QUERY_LEN,
  SEARCH_MAX_RESULTS,
} from '../../shared/workspace-search-contract'
import type {
  TerminalSessionData,
  TerminalSessionError,
  TerminalSessionExit,
  TerminalSessionStartResult,
} from '../../shared/terminal-session-contract'
import {
  TERMINAL_SESSION_DEFAULT_COLS,
  TERMINAL_SESSION_DEFAULT_ROWS,
  TERMINAL_SESSION_MAX_COLS,
  TERMINAL_SESSION_MAX_ROWS,
  TERMINAL_SESSION_MIN_COLS,
  TERMINAL_SESSION_MIN_ROWS,
} from '../../shared/terminal-session-contract'
import {
  type RecentProjectEntry,
  type RecentProjectsChangedPayload,
  type OpenProjectByIdFailure,
  type DeleteProjectResult,
  type RemoveRecentProjectResult,
  type UpdateRecentPickerNameResult,
  RECENT_PROJECTS_MAX,
  RECENT_PROJECT_DISPLAY_NAME_MAX_LEN,
  RECENT_PROJECT_PRIMARY_ROOT_PATH_MAX_LEN,
  RECENT_ROOT_LABEL_MAX_CHARS,
} from '../../shared/recent-projects-contract'
import type {
  TtsReadAloudRequest,
  TtsReadAloudResult,
} from '../../shared/tts-read-aloud-contract'
import { TTS_READ_ALOUD_MAX_TEXT_CHARS } from '../../shared/tts-read-aloud-contract'
import { normalizeTtsVoiceId, ttsLanguageForVoiceId, TTS_VOICE_PRESETS } from '../../shared/tts-read-aloud-contract'
import type {
  ClearXaiApiKeyResult,
  SetXaiApiKeyResult,
  XaiKeySource,
  XaiKeyStatusPayload,
} from '../../shared/xai-key-settings-contract'
import type { AgentToolBatchResult, AgentUndoLastBatchResult } from '../../harness/tools/contracts/tool-contract'
import type {
  AgentWriteHistoryListEntry,
  GetAgentWriteHistoryResult,
  RevertAgentWriteBatchResult,
} from '../../shared/agent-write-history-contract'
import {
  DIFF_FILE_STATUS_LABELS,
  type DiffFileEntry,
  type DiffFileStatus,
  type DiffSession,
  type DiffSessionSource,
} from '../../shared/diff-session-contract'
import type {
  WorkspaceFsMutateRequest,
  WorkspaceFsMutateResult,
  WorkspaceFsMutationEvent,
} from '../../shared/workspace-fs-mutation-contract'
import { XAI_API_KEY_MAX_LEN } from '../../shared/xai-key-settings-contract'
import type { AppInfoPayload } from '../../shared/app-info-contract'
import type {
  AgentContextPin,
  GetProjectContextPinsResult,
  SetProjectContextPinsResult,
} from '../../harness/context/context-pins-contract'
import { AGENT_CONTEXT_MAX_PINS_PER_PROJECT } from '../../harness/context/context-pins-contract'
import type {
  AgentChatActiveContext,
  AgentChatAttachment,
  AgentChatActivityPayload,
  AgentChatCapabilitiesResult,
  AgentCommandApprovalRequest,
  AgentChatEditorSelection,
  AgentEditProposalRejectedFile,
  AgentChatEventPayload,
  AgentChatTextModelIntent,
  AgentChatTurnRouting,
  RefreshProjectIntelligenceResult,
  AgentChatStartPayload,
  AgentChatStartResult,
  AgentChatThreadMessage,
} from '../../shared/agent-chat-contract'
import type {
  AgentProposalReview,
  AgentProposalReviewRequest,
  AgentProposalReviewResult,
} from '../../shared/agent-proposal-reviewer'
export type { AgentSubagentEventPayload } from '../../harness/subagent/contracts/subagent-contract'
import type { HarnessProfileKey } from '../../harness/profiles/contracts/harness-profile-key'
import { resolveHarnessProfileKey } from '../../harness/profiles/contracts/harness-profile-key'
import { getHarnessProfile } from '../../harness/profiles/harness-profile'
import {
  AGENT_CHAT_SELECTION_MAX_CHARS,
  AGENT_CHAT_MAX_ATTACHMENTS,
  AGENT_CHAT_MAX_USER_TEXT_CHARS,
} from '../../shared/agent-chat-contract'
import type {
  AgentTurnTraceV1,
  ExportSanitizedAgentTurnTraceResult,
  GetLastAgentTurnTraceResult,
  ReplayAgentRetrievalPreviewResult,
} from '../../shared/agent-turn-trace-contract'
import { AGENT_TURN_TRACE_MAX_FILES, AGENT_TURN_TRACE_SCHEMA_VERSION } from '../../shared/agent-turn-trace-contract'
import type { GfPlanV1 } from '../../harness/plan/contracts/gf-plan-contract'
import { GF_PLAN_FENCE, GfPlanV1Schema } from '../../harness/plan/contracts/gf-plan-contract'
import type { AgentSubagentEventPayload } from '../../harness/subagent/contracts/subagent-contract'

export type {
  AddWorkspaceRootResult,
  GrokProjectManifest,
  Root,
  OpenProjectResult,
  ProjectSessionSnapshot,
  DirectoryEntry,
  ReadDirectoryResult,
  AgentContextPreview,
  GetAgentContextPreviewResult,
  GetChatSystemPromptResult,
  GrokApiMessage,
  GrokApiRole,
  GrokStreamCapabilitiesResult,
  GrokStreamEventPayload,
  GrokStreamStartPayload,
  GrokStreamStartResult,
  AppendChatMessageResult,
  ClearChatThreadResult,
  LoadChatThreadResult,
  PersistedChatLineV1,
  VoiceRealtimeServerEvent,
  VoiceSessionStartResult,
  GitDiffSessionResult,
  GitStatusSummary,
  SearchWorkspaceProgressPayload,
  SearchWorkspaceRequest,
  SearchWorkspaceResult,
  SearchWorkspaceRow,
  TerminalSessionData,
  TerminalSessionError,
  TerminalSessionExit,
  TerminalSessionStartResult,
  RecentProjectEntry,
  RecentProjectsChangedPayload,
  OpenProjectByIdFailure,
  DeleteProjectResult,
  RemoveRecentProjectResult,
  UpdateRecentPickerNameResult,
  TtsReadAloudRequest,
  TtsReadAloudResult,
  ClearXaiApiKeyResult,
  SetXaiApiKeyResult,
  XaiKeySource,
  XaiKeyStatusPayload,
  AgentToolBatchResult,
  AgentUndoLastBatchResult,
  AgentWriteHistoryListEntry,
  GetAgentWriteHistoryResult,
  RevertAgentWriteBatchResult,
  DiffFileEntry,
  DiffFileStatus,
  DiffSession,
  DiffSessionSource,
  WorkspaceFsMutateRequest,
  WorkspaceFsMutateResult,
  WorkspaceFsMutationEvent,
  AppInfoPayload,
  AgentContextPin,
  GetProjectContextPinsResult,
  SetProjectContextPinsResult,
  AgentChatActiveContext,
  AgentChatAttachment,
  AgentChatActivityPayload,
  AgentChatCapabilitiesResult,
  AgentCommandApprovalRequest,
  AgentChatEditorSelection,
  AgentEditProposalRejectedFile,
  AgentChatEventPayload,
  AgentChatTextModelIntent,
  AgentChatTurnRouting,
  AgentProposalReview,
  AgentProposalReviewRequest,
  AgentProposalReviewResult,
  HarnessProfileKey,
  RefreshProjectIntelligenceResult,
  AgentChatStartPayload,
  AgentChatStartResult,
  AgentChatThreadMessage,
  AgentTurnTraceV1,
  ExportSanitizedAgentTurnTraceResult,
  GetLastAgentTurnTraceResult,
  ReplayAgentRetrievalPreviewResult,
  GfPlanV1,
}

export {
  TERMINAL_SESSION_DEFAULT_COLS,
  TERMINAL_SESSION_DEFAULT_ROWS,
  TERMINAL_SESSION_MAX_COLS,
  TERMINAL_SESSION_MAX_ROWS,
  TERMINAL_SESSION_MIN_COLS,
  TERMINAL_SESSION_MIN_ROWS,
}

export {
  SEARCH_MAX_FILE_BYTES,
  SEARCH_MAX_FILES_SCANNED,
  SEARCH_MAX_QUERY_LEN,
  SEARCH_MAX_RESULTS,
}

export {
  CHAT_STORE_SCHEMA_VERSION,
  AGENT_CHAT_SELECTION_MAX_CHARS,
  AGENT_CHAT_MAX_ATTACHMENTS,
  AGENT_CHAT_MAX_USER_TEXT_CHARS,
  AGENT_CONTEXT_MAX_PINS_PER_PROJECT,
  getModelForIntent,
  getHarnessProfile,
  resolveHarnessProfileKey,
  DUAL_MODEL_FALLBACKS,
  MODEL_INTENT_MANIFEST_KEYS,
  RECENT_PROJECTS_MAX,
  RECENT_PROJECT_DISPLAY_NAME_MAX_LEN,
  RECENT_PROJECT_PRIMARY_ROOT_PATH_MAX_LEN,
  RECENT_ROOT_LABEL_MAX_CHARS,
  TTS_READ_ALOUD_MAX_TEXT_CHARS,
  TTS_VOICE_PRESETS,
  XAI_API_KEY_MAX_LEN,
  DIFF_FILE_STATUS_LABELS,
  normalizeTtsVoiceId,
  ttsLanguageForVoiceId,
  AGENT_TURN_TRACE_MAX_FILES,
  AGENT_TURN_TRACE_SCHEMA_VERSION,
  GF_PLAN_FENCE,
  GfPlanV1Schema,
}
export type { GetModelForIntentOptions, ModelIntent }
export type { ChatTurnContextV1 } from '../../main/chat-store'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  attachments?: Array<{
    type: 'file' | 'folder' | 'root' | 'diff'
    path?: string
    rootId?: string
  }>
  model?: string
  /** Captured at send time for agent / voice turns (story 065). */
  turnContext?: ChatTurnContextV1
  /** Tool steps for this assistant turn (story 093; session-only, not persisted to thread.jsonl). */
  toolActivities?: AgentChatActivityPayload[]
  /** Child subagent exploration block (story 112; session-only). */
  subagentActivity?: AgentSubagentEventPayload
}

export interface OpenFile {
  path: string
  rootId: string
  content: string
  isDirty: boolean
  language?: string
}
