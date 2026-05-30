import { contextBridge, ipcRenderer } from 'electron'
import type {
  AddWorkspaceRootResult,
  GrokProjectManifest,
  OpenProjectResult,
  ProjectSessionSnapshot,
  ReadDirectoryResult,
  Root,
} from '../main/manifest'
import type { GetAgentContextPreviewResult, GetChatSystemPromptResult } from '../main/agent-context'
import type {
  GrokStreamCapabilitiesResult,
  GrokStreamEventPayload,
  GrokStreamStartPayload,
  GrokStreamStartResult,
} from '../main/grok-types'
import type {
  AgentChatCapabilitiesResult,
  AgentCommandApprovalRespondResult,
  AgentCommandApprovalResponse,
  AgentChatEventPayload,
  RefreshProjectIntelligenceResult,
  AgentChatStartPayload,
  AgentChatStartResult,
} from '../shared/agent-chat-contract'
import type {
  AgentProposalReviewRequest,
  AgentProposalReviewResult,
} from '../shared/agent-proposal-reviewer'
import type {
  ExportSanitizedAgentTurnTraceResult,
  GetLastAgentTurnTraceResult,
  ReplayAgentRetrievalPreviewResult,
} from '../shared/agent-turn-trace-contract'
import type {
  AppendChatMessageResult,
  ClearChatThreadResult,
  LoadChatThreadResult,
  PersistedChatLineV1,
} from '../main/chat-store'
import type {
  GetStoredPlanForMessageArgs,
  GetStoredPlanForMessageResult,
  MarkStoredPlansSupersededArgs,
  MarkStoredPlansSupersededResult,
  SetStoredPlanStatusArgs,
  SetStoredPlanStatusResult,
} from '../shared/agent-plan-artifact'
import type {
  GetProjectContextPinsResult,
  SetProjectContextPinsResult,
  AgentContextPin,
} from '../shared/agent-context-pins-contract'
import type { VoiceRealtimeServerEvent, VoiceSessionStartResult } from '../main/voice-realtime'
import type { VoiceSessionStartPayload } from '../shared/voice-session-contract'
import type { GitDiffSessionResult, GitStatusSummary } from '../main/git'
import type {
  SearchWorkspaceProgressPayload,
  SearchWorkspaceRequest,
  SearchWorkspaceResult,
} from '../shared/workspace-search-contract'
import type {
  TerminalSessionData,
  TerminalSessionError,
  TerminalSessionExit,
  TerminalSessionInputRequest,
  TerminalSessionKillRequest,
  TerminalSessionMutationResult,
  TerminalSessionResizeRequest,
  TerminalSessionStartRequest,
  TerminalSessionStartResult,
} from '../shared/terminal-session-contract'
import type {
  RecentProjectEntry,
  OpenProjectByIdFailure,
  DeleteProjectResult,
  RemoveRecentProjectResult,
  UpdateRecentPickerNameResult,
} from '../shared/recent-projects-contract'
import type {
  TtsReadAloudRequest,
  TtsReadAloudResult,
  TtsVerifyVoiceResult,
} from '../shared/tts-read-aloud-contract'
import type {
  ClearXaiApiKeyResult,
  SetXaiApiKeyResult,
  XaiKeyStatusPayload,
} from '../shared/xai-key-settings-contract'
import type { AgentToolBatchPayload, AgentToolBatchResult, AgentUndoLastBatchResult } from '../shared/agent-tool-contract'
import type {
  GetAgentWriteHistoryResult,
  RevertAgentWriteBatchResult,
} from '../shared/agent-write-history-contract'
import type { WorkspaceFsMutateRequest, WorkspaceFsMutateResult } from '../shared/workspace-fs-mutation-contract'
import type { WorkspaceFsChangedPayload } from '../shared/workspace-fs-change-contract'
import type { AppInfoPayload } from '../shared/app-info-contract'
import type { StageChatAttachmentPayload, StageChatAttachmentResult } from '../shared/chat-attachment-contract'
import type { ElectronAPI } from '../shared/preload-api-contract'

export const electronAPI = {
  /** Host OS — renderer uses for macOS title-bar inset (`hiddenInset`). */
  platform: process.platform as NodeJS.Platform,
  setWindowTitle: (
    title: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> => ipcRenderer.invoke('window-set-title', title),
  openExternalUrl: (url: string): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('open-external-url', url),
  writeClipboardText: (text: string): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('clipboard-write-text', text),
  getAppInfo: (): Promise<AppInfoPayload> => ipcRenderer.invoke('get-app-info'),
  getXaiKeyStatus: (): Promise<XaiKeyStatusPayload> => ipcRenderer.invoke('get-xai-key-status'),
  setXaiApiKey: (apiKey: string): Promise<SetXaiApiKeyResult> =>
    ipcRenderer.invoke('set-xai-api-key', { apiKey }),
  clearXaiApiKey: (): Promise<ClearXaiApiKeyResult> => ipcRenderer.invoke('clear-xai-api-key'),
  openProject: (): Promise<OpenProjectResult | null> => ipcRenderer.invoke('open-project'),
  getRecentProjects: (): Promise<RecentProjectEntry[]> => ipcRenderer.invoke('get-recent-projects'),
  removeRecentProject: (projectId: string): Promise<RemoveRecentProjectResult> =>
    ipcRenderer.invoke('remove-recent-project', { projectId }),
  deleteProject: (projectId: string): Promise<DeleteProjectResult> =>
    ipcRenderer.invoke('delete-project', { projectId }),
  updateRecentPickerName: (
    projectId: string,
    displayName: string,
  ): Promise<UpdateRecentPickerNameResult> =>
    ipcRenderer.invoke('update-recent-picker-name', { projectId, displayName }),
  openProjectById: (projectId: string): Promise<OpenProjectResult | OpenProjectByIdFailure> =>
    ipcRenderer.invoke('open-project-by-id', projectId),
  getProject: (): Promise<ProjectSessionSnapshot> => ipcRenderer.invoke('get-project'),
  saveManifest: (manifest: GrokProjectManifest): Promise<boolean> =>
    ipcRenderer.invoke('save-manifest', manifest),
  readDirectory: (dirPath: string): Promise<ReadDirectoryResult> =>
    ipcRenderer.invoke('read-directory', dirPath),
  readFile: (path: string): Promise<string | null> => ipcRenderer.invoke('read-file', path),
  writeFile: (path: string, content: string): Promise<boolean> => ipcRenderer.invoke('write-file', path, content),
  workspaceFsMutate: (payload: WorkspaceFsMutateRequest): Promise<WorkspaceFsMutateResult> =>
    ipcRenderer.invoke('workspace-fs-mutate', payload),
  agentToolBatch: (payload: AgentToolBatchPayload): Promise<AgentToolBatchResult> =>
    ipcRenderer.invoke('agent-tool-batch', payload),
  agentUndoLastBatch: (): Promise<AgentUndoLastBatchResult> =>
    ipcRenderer.invoke('agent-undo-last-batch'),
  getAgentWriteHistory: (args: { projectId: string }): Promise<GetAgentWriteHistoryResult> =>
    ipcRenderer.invoke('get-agent-write-history', args),
  revertAgentWriteBatch: (args: {
    projectId: string
    batchId: string
  }): Promise<RevertAgentWriteBatchResult> =>
    ipcRenderer.invoke('revert-agent-write-batch', args),
  listRoots: (): Promise<Root[]> => ipcRenderer.invoke('list-roots'),
  addWorkspaceRoot: (): Promise<AddWorkspaceRootResult | null> =>
    ipcRenderer.invoke('add-workspace-root'),
  voiceSessionStart: (payload?: VoiceSessionStartPayload): Promise<VoiceSessionStartResult> =>
    ipcRenderer.invoke('voice-session-start', payload ?? {}),
  voiceSessionStop: (): Promise<{ ok: true }> => ipcRenderer.invoke('voice-session-stop'),
  voiceSendAudioChunk: (base64: string) => {
    ipcRenderer.send('voice-audio-chunk', base64)
  },
  onVoiceRealtimeEvent: (handler: (payload: VoiceRealtimeServerEvent) => void) => {
    const listener = (_event: unknown, payload: VoiceRealtimeServerEvent) => handler(payload)
    ipcRenderer.on('voice-realtime-event', listener)
    return () => {
      ipcRenderer.removeListener('voice-realtime-event', listener)
    }
  },
  getAgentContextPreview: (): Promise<GetAgentContextPreviewResult> =>
    ipcRenderer.invoke('get-agent-context-preview'),
  getChatSystemPrompt: (): Promise<GetChatSystemPromptResult> => ipcRenderer.invoke('get-chat-system-prompt'),
  grokStreamCapabilities: (): Promise<GrokStreamCapabilitiesResult> =>
    ipcRenderer.invoke('grok-stream-capabilities'),
  grokStreamStart: (payload: GrokStreamStartPayload): Promise<GrokStreamStartResult> =>
    ipcRenderer.invoke('grok-stream-start', payload),
  grokStreamCancel: (streamId: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('grok-stream-cancel', streamId),
  agentChatCapabilities: (): Promise<AgentChatCapabilitiesResult> =>
    ipcRenderer.invoke('agent-chat-capabilities'),
  refreshProjectIntelligence: (): Promise<RefreshProjectIntelligenceResult> =>
    ipcRenderer.invoke('refresh-project-intelligence'),
  agentChatStart: (payload: AgentChatStartPayload): Promise<AgentChatStartResult> =>
    ipcRenderer.invoke('agent-chat-start', payload),
  agentReviewProposal: (payload: AgentProposalReviewRequest): Promise<AgentProposalReviewResult> =>
    ipcRenderer.invoke('agent-review-proposal', payload),
  computeAgentContentHash: (content: string): Promise<string | null> =>
    ipcRenderer.invoke('compute-agent-content-hash', content),
  agentChatCancel: (streamId: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('agent-chat-cancel', streamId),
  agentCommandApprovalRespond: (
    payload: AgentCommandApprovalResponse,
  ): Promise<AgentCommandApprovalRespondResult> =>
    ipcRenderer.invoke('agent-command-approval-respond', payload),
  getLastAgentTurnTrace: (): Promise<GetLastAgentTurnTraceResult> =>
    ipcRenderer.invoke('get-last-agent-turn-trace'),
  exportSanitizedAgentTurnTrace: (): Promise<ExportSanitizedAgentTurnTraceResult> =>
    ipcRenderer.invoke('export-sanitized-agent-turn-trace'),
  replayAgentRetrievalPreview: (): Promise<ReplayAgentRetrievalPreviewResult> =>
    ipcRenderer.invoke('replay-agent-retrieval-preview'),
  onAgentChatEvent: (handler: (payload: AgentChatEventPayload) => void) => {
    const listener = (_event: unknown, payload: AgentChatEventPayload) => handler(payload)
    ipcRenderer.on('agent-chat-event', listener)
    return () => {
      ipcRenderer.removeListener('agent-chat-event', listener)
    }
  },
  onGrokStreamEvent: (handler: (payload: GrokStreamEventPayload) => void) => {
    const listener = (_event: unknown, payload: GrokStreamEventPayload) => handler(payload)
    ipcRenderer.on('grok-stream-event', listener)
    return () => {
      ipcRenderer.removeListener('grok-stream-event', listener)
    }
  },
  loadChatThread: (): Promise<LoadChatThreadResult> => ipcRenderer.invoke('load-chat-thread'),
  appendChatMessage: (payload: PersistedChatLineV1): Promise<AppendChatMessageResult> =>
    ipcRenderer.invoke('append-chat-message', payload),
  appendChatMessageForProject: (args: {
    projectId: string
    payload: PersistedChatLineV1
  }): Promise<AppendChatMessageResult> => ipcRenderer.invoke('append-chat-message-for-project', args),
  setStoredPlanStatus: (args: SetStoredPlanStatusArgs): Promise<SetStoredPlanStatusResult> =>
    ipcRenderer.invoke('set-stored-plan-status', args),
  getStoredPlanForMessage: (args: GetStoredPlanForMessageArgs): Promise<GetStoredPlanForMessageResult> =>
    ipcRenderer.invoke('get-stored-plan-for-message', args),
  markStoredPlansSuperseded: (
    args: MarkStoredPlansSupersededArgs,
  ): Promise<MarkStoredPlansSupersededResult> =>
    ipcRenderer.invoke('mark-stored-plans-superseded', args),
  clearChatThread: (): Promise<ClearChatThreadResult> => ipcRenderer.invoke('clear-chat-thread'),
  getProjectContextPins: (args: { projectId: string }): Promise<GetProjectContextPinsResult> =>
    ipcRenderer.invoke('get-project-context-pins', args),
  setProjectContextPins: (args: {
    projectId: string
    pins: AgentContextPin[]
  }): Promise<SetProjectContextPinsResult> => ipcRenderer.invoke('set-project-context-pins', args),
  stageChatAttachment: (payload: StageChatAttachmentPayload): Promise<StageChatAttachmentResult> =>
    ipcRenderer.invoke('stage-chat-attachment', payload),
  gitStatus: (payload: { rootId: string }): Promise<GitStatusSummary> =>
    ipcRenderer.invoke('git-status', payload),
  gitDiffSession: (payload: { rootId: string }): Promise<GitDiffSessionResult> =>
    ipcRenderer.invoke('git-diff-session', payload),
  searchWorkspace: (payload: SearchWorkspaceRequest): Promise<SearchWorkspaceResult> =>
    ipcRenderer.invoke('search-workspace', payload),
  searchWorkspaceCancel: (): Promise<{ ok: true }> => ipcRenderer.invoke('search-workspace-cancel'),
  onSearchWorkspaceProgress: (handler: (payload: SearchWorkspaceProgressPayload) => void) => {
    const listener = (_event: unknown, payload: SearchWorkspaceProgressPayload) => handler(payload)
    ipcRenderer.on('search-workspace-progress', listener)
    return () => {
      ipcRenderer.removeListener('search-workspace-progress', listener)
    }
  },
  terminalSessionStart: (payload: TerminalSessionStartRequest): Promise<TerminalSessionStartResult> =>
    ipcRenderer.invoke('terminal-session-start', payload),
  terminalSessionInput: (payload: TerminalSessionInputRequest): Promise<TerminalSessionMutationResult> =>
    ipcRenderer.invoke('terminal-session-input', payload),
  terminalSessionResize: (payload: TerminalSessionResizeRequest): Promise<TerminalSessionMutationResult> =>
    ipcRenderer.invoke('terminal-session-resize', payload),
  terminalSessionKill: (payload: TerminalSessionKillRequest): Promise<TerminalSessionMutationResult> =>
    ipcRenderer.invoke('terminal-session-kill', payload),
  readAloud: (payload: TtsReadAloudRequest): Promise<TtsReadAloudResult> =>
    ipcRenderer.invoke('tts-read-aloud', payload),
  verifyTtsVoice: (voiceId: string): Promise<TtsVerifyVoiceResult> =>
    ipcRenderer.invoke('tts-verify-voice', voiceId),
  onTerminalSessionData: (handler: (payload: TerminalSessionData) => void) => {
    const listener = (_event: unknown, payload: TerminalSessionData) => handler(payload)
    ipcRenderer.on('terminal-session-data', listener)
    return () => ipcRenderer.removeListener('terminal-session-data', listener)
  },
  onTerminalSessionExit: (handler: (payload: TerminalSessionExit) => void) => {
    const listener = (_event: unknown, payload: TerminalSessionExit) => handler(payload)
    ipcRenderer.on('terminal-session-exit', listener)
    return () => ipcRenderer.removeListener('terminal-session-exit', listener)
  },
  onTerminalSessionError: (handler: (payload: TerminalSessionError) => void) => {
    const listener = (_event: unknown, payload: TerminalSessionError) => handler(payload)
    ipcRenderer.on('terminal-session-error', listener)
    return () => ipcRenderer.removeListener('terminal-session-error', listener)
  },
  onRecentProjectsChanged: (handler: (payload: RecentProjectEntry[]) => void) => {
    const listener = (_event: unknown, payload: RecentProjectEntry[]) => handler(payload)
    ipcRenderer.on('recent-projects-changed', listener)
    return () => ipcRenderer.removeListener('recent-projects-changed', listener)
  },
  onWorkspaceFsChanged: (handler: (payload: WorkspaceFsChangedPayload) => void) => {
    const listener = (_event: unknown, payload: WorkspaceFsChangedPayload) => handler(payload)
    ipcRenderer.on('workspace-fs-changed', listener)
    return () => ipcRenderer.removeListener('workspace-fs-changed', listener)
  },
} satisfies ElectronAPI

contextBridge.exposeInMainWorld('electron', electronAPI)

declare global {
  interface Window {
    electron: ElectronAPI
  }
}
