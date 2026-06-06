import type {
  AddWorkspaceRootResult,
  GrokProjectManifest,
  OpenProjectResult,
  ProjectSessionSnapshot,
  ReadDirectoryResult,
  Root,
} from '../../main/project/manifest'
import type { GetAgentContextPreviewResult, GetChatSystemPromptResult } from '../../harness-support/context/context'
import type {
  GrokStreamCapabilitiesResult,
  GrokStreamEventPayload,
  GrokStreamStartPayload,
  GrokStreamStartResult,
} from '../../main/xai/types'
import type {
  AppendChatMessageResult,
  ClearChatThreadResult,
  LoadChatThreadResult,
  PersistedChatLineV1,
} from '../../main/chat/store'
import type { VoiceRealtimeServerEvent, VoiceSessionStartResult } from '../../main/voice/realtime'
import type { VoiceSessionStartPayload } from '../voice/session-contract'
import type { GitDiffSessionResult, GitStatusSummary } from '../../main/git/service'
import type {
  GetStoredPlanForMessageArgs,
  GetStoredPlanForMessageResult,
  MarkStoredPlansSupersededArgs,
  MarkStoredPlansSupersededResult,
  SetStoredPlanStatusArgs,
  SetStoredPlanStatusResult,
} from '../../harness-support/plan/contracts/plan-artifact'
import type {
  AgentChatCapabilitiesResult,
  AgentCommandApprovalRespondResult,
  AgentCommandApprovalResponse,
  AgentChatEventPayload,
  AgentChatStartPayload,
  AgentChatStartResult,
  RefreshProjectIntelligenceResult,
} from '../agent/chat-contract'
import type {
  AgentProposalReviewRequest,
  AgentProposalReviewResult,
} from '../agent/proposal-reviewer'
import type {
  ExportSanitizedAgentTurnTraceResult,
  GetLastAgentTurnTraceResult,
  ReplayAgentRetrievalPreviewResult,
} from '../agent/turn-trace-contract'
import type { AgentToolBatchPayload, AgentToolBatchResult, AgentUndoLastBatchResult } from '../../harness-support/tools/contracts/tool-contract'
import type {
  GetAgentWriteHistoryResult,
  RevertAgentWriteBatchResult,
} from '../agent/write-history-contract'
import type {
  GetProjectContextPinsResult,
  SetProjectContextPinsResult,
  AgentContextPin,
} from '../../harness-support/context/context-pins-contract'
import type { AppInfoPayload } from '../app/info-contract'
import type {
  DeleteProjectResult,
  OpenProjectByIdFailure,
  RecentProjectEntry,
  RemoveRecentProjectResult,
  UpdateRecentPickerNameResult,
} from '../projects/recent-projects-contract'
import type { SearchWorkspaceProgressPayload, SearchWorkspaceRequest, SearchWorkspaceResult } from '../workspace/search-contract'
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
} from '../terminal/session-contract'
import type { TtsReadAloudRequest, TtsReadAloudResult, TtsVerifyVoiceResult } from '../voice/tts-read-aloud-contract'
import type { WorkspaceFsMutateRequest, WorkspaceFsMutateResult } from '../workspace/fs-mutation-contract'
import type { WorkspaceFsChangedPayload } from '../workspace/fs-change-contract'
import type { ClearXaiApiKeyResult, SetXaiApiKeyResult, XaiKeyStatusPayload } from '../settings/xai-key-settings-contract'
import type { StageChatAttachmentPayload, StageChatAttachmentResult } from '../chat/attachment-contract'

export type Unsubscribe = () => void

export type ElectronAPI = {
  platform: NodeJS.Platform
  setWindowTitle(title: string): Promise<{ ok: true } | { ok: false; error: string }>
  openExternalUrl(url: string): Promise<{ ok: true } | { ok: false; error: string }>
  writeClipboardText(text: string): Promise<{ ok: true } | { ok: false; error: string }>
  getAppInfo(): Promise<AppInfoPayload>
  getXaiKeyStatus(): Promise<XaiKeyStatusPayload>
  setXaiApiKey(apiKey: string): Promise<SetXaiApiKeyResult>
  clearXaiApiKey(): Promise<ClearXaiApiKeyResult>
  openProject(): Promise<OpenProjectResult | null>
  getRecentProjects(): Promise<RecentProjectEntry[]>
  removeRecentProject(projectId: string): Promise<RemoveRecentProjectResult>
  deleteProject(projectId: string): Promise<DeleteProjectResult>
  updateRecentPickerName(projectId: string, displayName: string): Promise<UpdateRecentPickerNameResult>
  openProjectById(projectId: string): Promise<OpenProjectResult | OpenProjectByIdFailure>
  getProject(): Promise<ProjectSessionSnapshot>
  saveManifest(manifest: GrokProjectManifest): Promise<boolean>
  readDirectory(dirPath: string): Promise<ReadDirectoryResult>
  readFile(path: string): Promise<string | null>
  writeFile(path: string, content: string): Promise<boolean>
  workspaceFsMutate(payload: WorkspaceFsMutateRequest): Promise<WorkspaceFsMutateResult>
  agentToolBatch(payload: AgentToolBatchPayload): Promise<AgentToolBatchResult>
  agentUndoLastBatch(): Promise<AgentUndoLastBatchResult>
  getAgentWriteHistory(args: { projectId: string }): Promise<GetAgentWriteHistoryResult>
  revertAgentWriteBatch(args: {
    projectId: string
    batchId: string
  }): Promise<RevertAgentWriteBatchResult>
  listRoots(): Promise<Root[]>
  addWorkspaceRoot(): Promise<AddWorkspaceRootResult | null>
  voiceSessionStart(payload?: VoiceSessionStartPayload): Promise<VoiceSessionStartResult>
  voiceSessionStop(): Promise<{ ok: true }>
  voiceSendAudioChunk(base64: string): void
  onVoiceRealtimeEvent(handler: (payload: VoiceRealtimeServerEvent) => void): Unsubscribe
  getAgentContextPreview(): Promise<GetAgentContextPreviewResult>
  getChatSystemPrompt(): Promise<GetChatSystemPromptResult>
  grokStreamCapabilities(): Promise<GrokStreamCapabilitiesResult>
  grokStreamStart(payload: GrokStreamStartPayload): Promise<GrokStreamStartResult>
  grokStreamCancel(streamId: string): Promise<{ ok: boolean }>
  agentChatCapabilities(): Promise<AgentChatCapabilitiesResult>
  refreshProjectIntelligence(): Promise<RefreshProjectIntelligenceResult>
  agentChatStart(payload: AgentChatStartPayload): Promise<AgentChatStartResult>
  agentReviewProposal(payload: AgentProposalReviewRequest): Promise<AgentProposalReviewResult>
  computeAgentContentHash(content: string): Promise<string | null>
  agentChatCancel(streamId: string): Promise<{ ok: boolean }>
  agentCommandApprovalRespond(payload: AgentCommandApprovalResponse): Promise<AgentCommandApprovalRespondResult>
  getLastAgentTurnTrace(): Promise<GetLastAgentTurnTraceResult>
  exportSanitizedAgentTurnTrace(): Promise<ExportSanitizedAgentTurnTraceResult>
  replayAgentRetrievalPreview(): Promise<ReplayAgentRetrievalPreviewResult>
  onAgentChatEvent(handler: (payload: AgentChatEventPayload) => void): Unsubscribe
  onGrokStreamEvent(handler: (payload: GrokStreamEventPayload) => void): Unsubscribe
  loadChatThread(): Promise<LoadChatThreadResult>
  appendChatMessage(payload: PersistedChatLineV1): Promise<AppendChatMessageResult>
  appendChatMessageForProject(args: { projectId: string; payload: PersistedChatLineV1 }): Promise<AppendChatMessageResult>
  setStoredPlanStatus(args: SetStoredPlanStatusArgs): Promise<SetStoredPlanStatusResult>
  getStoredPlanForMessage(args: GetStoredPlanForMessageArgs): Promise<GetStoredPlanForMessageResult>
  markStoredPlansSuperseded(args: MarkStoredPlansSupersededArgs): Promise<MarkStoredPlansSupersededResult>
  clearChatThread(): Promise<ClearChatThreadResult>
  getProjectContextPins(args: { projectId: string }): Promise<GetProjectContextPinsResult>
  setProjectContextPins(args: {
    projectId: string
    pins: AgentContextPin[]
  }): Promise<SetProjectContextPinsResult>
  stageChatAttachment(payload: StageChatAttachmentPayload): Promise<StageChatAttachmentResult>
  gitStatus(payload: { rootId: string }): Promise<GitStatusSummary>
  gitDiffSession(payload: { rootId: string }): Promise<GitDiffSessionResult>
  searchWorkspace(payload: SearchWorkspaceRequest): Promise<SearchWorkspaceResult>
  searchWorkspaceCancel(): Promise<{ ok: true }>
  onSearchWorkspaceProgress(handler: (payload: SearchWorkspaceProgressPayload) => void): Unsubscribe
  terminalSessionStart(payload: TerminalSessionStartRequest): Promise<TerminalSessionStartResult>
  terminalSessionInput(payload: TerminalSessionInputRequest): Promise<TerminalSessionMutationResult>
  terminalSessionResize(payload: TerminalSessionResizeRequest): Promise<TerminalSessionMutationResult>
  terminalSessionKill(payload: TerminalSessionKillRequest): Promise<TerminalSessionMutationResult>
  readAloud(payload: TtsReadAloudRequest): Promise<TtsReadAloudResult>
  verifyTtsVoice(voiceId: string): Promise<TtsVerifyVoiceResult>
  onTerminalSessionData(handler: (payload: TerminalSessionData) => void): Unsubscribe
  onTerminalSessionExit(handler: (payload: TerminalSessionExit) => void): Unsubscribe
  onTerminalSessionError(handler: (payload: TerminalSessionError) => void): Unsubscribe
  onRecentProjectsChanged(handler: (payload: RecentProjectEntry[]) => void): Unsubscribe
  onWorkspaceFsChanged(handler: (payload: WorkspaceFsChangedPayload) => void): Unsubscribe
}
