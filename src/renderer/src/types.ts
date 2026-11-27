import type {
  AddWorkspaceRootResult,
  GrokProjectManifest,
  Root,
  OpenProjectResult,
  ProjectSessionSnapshot,
  DirectoryEntry,
  ReadDirectoryResult,
} from '../../main/project/manifest'
import type {
  AppendChatMessageResult,
  ChatTurnContextV1,
  ClearChatThreadResult,
  LoadChatThreadResult,
  PersistedChatLineV1,
} from '../../main/chat/store'
import { CHAT_STORE_SCHEMA_VERSION } from '../../shared/chat/thread-schema'
import type { VoiceRealtimeServerEvent, VoiceSessionStartResult } from '../../main/voice/realtime'
import type { GitDiffSessionResult, GitStatusSummary } from '../../main/git/service'
import {
  type SearchWorkspaceProgressPayload,
  type SearchWorkspaceRequest,
  type SearchWorkspaceResult,
  type SearchWorkspaceRow,
  SEARCH_MAX_FILE_BYTES,
  SEARCH_MAX_FILES_SCANNED,
  SEARCH_MAX_QUERY_LEN,
  SEARCH_MAX_RESULTS,
} from '../../shared/workspace/search-contract'
import type {
  TerminalSessionData,
  TerminalSessionError,
  TerminalSessionExit,
  TerminalSessionStartResult,
} from '../../shared/terminal/session-contract'
import {
  TERMINAL_SESSION_DEFAULT_COLS,
  TERMINAL_SESSION_DEFAULT_ROWS,
  TERMINAL_SESSION_MAX_COLS,
  TERMINAL_SESSION_MAX_ROWS,
  TERMINAL_SESSION_MIN_COLS,
  TERMINAL_SESSION_MIN_ROWS,
} from '../../shared/terminal/session-contract'
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
} from '../../shared/projects/recent-projects-contract'
import type { TtsReadAloudRequest, TtsReadAloudResult } from '../../shared/voice/tts-read-aloud-contract'
import {
  normalizeTtsVoiceId,
  ttsLanguageForVoiceId,
  TTS_READ_ALOUD_MAX_TEXT_CHARS,
  TTS_VOICE_PRESETS,
} from '../../shared/voice/tts-read-aloud-contract'
import type {
  ClearXaiApiKeyResult,
  SetXaiApiKeyResult,
  XaiKeySource,
  XaiKeyStatusPayload,
} from '../../shared/settings/xai-key-settings-contract'
import { XAI_API_KEY_MAX_LEN } from '../../shared/settings/xai-key-settings-contract'
import {
  DIFF_FILE_STATUS_LABELS,
  type DiffFileEntry,
  type DiffFileStatus,
  type DiffSession,
  type DiffSessionSource,
} from '../../shared/diff/session-contract'
import type {
  WorkspaceFsMutateRequest,
  WorkspaceFsMutateResult,
  WorkspaceFsMutationEvent,
} from '../../shared/workspace/fs-mutation-contract'
import type { AppInfoPayload } from '../../shared/app/info-contract'
import type {
  AgentApprovalRequest,
  AgentChatActiveContext,
  AgentChatActivityPayload,
  AgentChatAttachment,
  AgentChatCapabilitiesResult,
  AgentChatEditorSelection,
  AgentChatEventPayload,
  AgentChatStartPayload,
  AgentChatStartResult,
  AgentChatThreadMessage,
  AgentTurnRouting,
  ReviewMode,
} from '../../shared/agent/chat-contract'
import {
  AGENT_CHAT_MAX_ATTACHMENTS,
  AGENT_CHAT_MAX_USER_TEXT_CHARS,
  AGENT_CHAT_SELECTION_MAX_CHARS,
} from '../../shared/agent/chat-contract'
import type { AgentTurnChanges } from '../../shared/agent/checkpoint-contract'

export type {
  AddWorkspaceRootResult,
  GrokProjectManifest,
  Root,
  OpenProjectResult,
  ProjectSessionSnapshot,
  DirectoryEntry,
  ReadDirectoryResult,
  AppendChatMessageResult,
  ChatTurnContextV1,
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
  DiffFileEntry,
  DiffFileStatus,
  DiffSession,
  DiffSessionSource,
  WorkspaceFsMutateRequest,
  WorkspaceFsMutateResult,
  WorkspaceFsMutationEvent,
  AppInfoPayload,
  AgentApprovalRequest,
  AgentChatActiveContext,
  AgentChatActivityPayload,
  AgentChatAttachment,
  AgentChatCapabilitiesResult,
  AgentChatEditorSelection,
  AgentChatEventPayload,
  AgentChatStartPayload,
  AgentChatStartResult,
  AgentChatThreadMessage,
  AgentTurnChanges,
  AgentTurnRouting,
  ReviewMode,
}

export {
  TERMINAL_SESSION_DEFAULT_COLS,
  TERMINAL_SESSION_DEFAULT_ROWS,
  TERMINAL_SESSION_MAX_COLS,
  TERMINAL_SESSION_MAX_ROWS,
  TERMINAL_SESSION_MIN_COLS,
  TERMINAL_SESSION_MIN_ROWS,
  SEARCH_MAX_FILE_BYTES,
  SEARCH_MAX_FILES_SCANNED,
  SEARCH_MAX_QUERY_LEN,
  SEARCH_MAX_RESULTS,
  CHAT_STORE_SCHEMA_VERSION,
  AGENT_CHAT_SELECTION_MAX_CHARS,
  AGENT_CHAT_MAX_ATTACHMENTS,
  AGENT_CHAT_MAX_USER_TEXT_CHARS,
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
}

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
  /** Agent (and model) that produced or received this turn, e.g. "Claude Code · Opus 5.5". */
  model?: string
  /** Captured at send time for agent / voice turns. */
  turnContext?: ChatTurnContextV1
  /** Steps the agent took this turn (session-only, not persisted to thread.jsonl). */
  toolActivities?: AgentChatActivityPayload[]
  /** Files the agent changed this turn, reviewable / revertible against a checkpoint. */
  turnChanges?: AgentTurnChanges
}

export interface OpenFile {
  path: string
  rootId: string
  content: string
  isDirty: boolean
  language?: string
}
