import { ipcMain, type BrowserWindow } from 'electron'
import { resolve } from 'node:path'
import { z } from 'zod'
import type { GrokProjectManifest } from './manifest'
import { buildChatSystemPrompt, recordAgentRetrievalDebug, type AgentRetrievalDebugSnapshot } from './agent-context'
import {
  createHttpAgentChatModelTransport,
  type AgentChatModelTransport,
  type AgentModelToolCall,
} from './agent-chat-model-transport'
import type { AgentModelChatMessage } from '../shared/agent-model-message'
import { providerRequestFromSnapshot } from '../shared/agent-turn-snapshot'
import { buildTurnSnapshot } from './agent-turn-snapshot-builder'
import { getXaiApiKey } from './grok-stream'
import { hasConfiguredXaiApiKey } from './xai-key-store'
import { AGENT_TOOL_FENCE_INFO } from '../shared/agent-tool-contract'
import { AgentToolBatchPayloadSchema } from '../shared/agent-tool-schema'
import { GF_PLAN_FENCE } from '../shared/gf-plan-contract'
import { shouldIgnoreFsEntry } from './ignore-globs'
import { isPathWithinWorkspaceRoots } from './workspace-path-guard'
import { validateAgentEditProposal } from './agent-edit-proposals'
import { buildAgentToolExecutionContext } from './agent-tool-execution-context-builder'
import { executeAgentToolCall } from './agent-tool-executor'
import { pruneStaleAgentOffloads } from './agent-offload-store'
import { buildApprovedPlanSystemInjection } from '../shared/agent-plan-artifact'
import { loadPlanArtifact, planJsonPath } from './agent-plan-store'
import {
  beginTurnReceipt,
  clearTurnReceiptState,
  consumeTurnRecoveryHint,
  finalizeTurnReceipt,
  finalizeTurnReceiptIfPending,
  flushActiveAgentTurnReceiptsAsInterrupted,
  trackTurnReceiptActivity,
} from './agent-turn-receipt-lifecycle'
import { applyToolResultOffload } from './agent-tool-result-offload'
import { clearAgentTurnReads, getAgentTurnReadHashes, getAgentTurnReads } from './agent-turn-read-registry'
import {
  AGENT_TOOL_MAX_ITERATIONS,
  buildActiveContextBlock,
  buildAgentToolDefinitions,
  filterToolDefinitionsForProfile,
  buildLexicalRetrievalContext,
  isLikelySensitivePath,
} from './agent-workspace-tools'
import { sanitizeAttachmentsForTurn } from './chat-attachment-staging'
import {
  applyRetrievalToScratch,
  createTurnTraceScratch,
  finalizeTurnTrace,
  markLastProviderRoundCancelled,
  pushProviderRound,
  pushToolStep,
  setRetrievalContextBodyChars,
  setRetrievalDetailLines,
  type TurnTraceOutcome,
  type TurnTraceScratch,
} from './agent-turn-trace-builder'
import {
  writeAgentTurnTrace,
  getLastAgentTurnTraceForProject,
  exportSanitizedAgentTurnTraceJson,
  replayRetrievalPreviewFromLatestTrace,
} from './agent-turn-trace-store'
import type {
  AgentChatCapabilitiesResult,
  AgentChatEventPayload,
  AgentChatStartPayload,
  AgentChatStartResult,
  AgentChatToolName,
  AgentEditProposalPayload,
} from '../shared/agent-chat-contract'
import type { AgentToolExecutionContext } from '../shared/agent-tool-execution-context'
import {
  pathsAtSearchReplaceEscalationThreshold,
  POST_ESCALATION_MAX_TOOL_ROUNDS,
  SEARCH_REPLACE_MAX_FAILURES_PER_TURN_BEFORE_FORCE_FINAL,
  shouldInjectSearchReplaceEscalation,
  totalSearchReplaceFailures,
} from '../shared/agent-edit-cascade-guard'
import {
  buildEditIntentToolNudge,
  buildFinalAnswerContract,
  buildSearchReplaceEscalationNudge,
  isLikelyEditIntent,
} from '../shared/agent-final-answer-contract'
import type {
  ExportSanitizedAgentTurnTraceResult,
  GetLastAgentTurnTraceResult,
  ReplayAgentRetrievalPreviewResult,
} from '../shared/agent-turn-trace-contract'
import {
  AgentCommandApprovalRespondResult,
  AgentCommandApprovalResponse,
  AGENT_CHAT_MAX_MESSAGE_CHARS,
  AGENT_CHAT_MAX_ATTACHMENTS,
  AGENT_CHAT_SELECTION_MAX_CHARS,
  AGENT_CHAT_MAX_OPEN_TABS,
  AGENT_CHAT_MAX_STREAM_ID_LEN,
  AGENT_CHAT_MAX_THREAD_MESSAGES,
  AGENT_CHAT_MAX_USER_TEXT_CHARS,
} from '../shared/agent-chat-contract'
import {
  AGENT_CONTEXT_MAX_PINS_PER_PROJECT,
  AgentContextPinSchema,
} from '../shared/agent-context-pins-contract'
import { AGENT_CONTEXT_BUDGETS } from '../shared/agent-context-budget-contract'
import { formatThreadMemoryBlock } from '../shared/agent-thread-memory'
import { appendTraceToThreadMemory, loadThreadMemory } from './agent-thread-memory-store'
import { resolveAgentTurnRouting } from '../shared/agent-turn-routing'
import type { AgentProfileId } from '../shared/agent-profile'
import { getAgentProfile, type AgentProfile } from '../shared/agent-profile'
import type { HarnessProfileKey } from '../shared/agent-harness-profile-contract'
import {
  AGENT_TOOL_LOOP_SHARED,
  buildAgentToolLoopProfileSections,
  getHarnessProfile,
  type AgentHarnessProfile,
  type HarnessPromptTurnContext,
} from '../shared/agent-harness-profile'
import { loadWorkspaceIndex, type StoredWorkspaceIndex } from './agent-index-store'
import {
  isGreenfieldWorkspace,
  type GreenfieldIndexSnapshot,
} from '../shared/workspace-greenfield'
const AGENT_TURN_TIMEOUT_MS = 300_000
const MAX_MODEL_LEN = 128
const ABORT_USER = 'gf:agent-user-cancel'
const ABORT_TIMEOUT = 'gf:agent-timeout'
const ABORT_QUIT = 'gf:agent-quit'

export function flushActiveAgentTurnReceiptsAsInterruptedForApp(): void {
  flushActiveAgentTurnReceiptsAsInterrupted({
    emit,
    abortTurn: (streamId) => {
      activeTurns.get(streamId)?.abort(ABORT_QUIT)
    },
  })
}

const ActiveContextSchema = z.object({
  activeRootId: z.string().nullable().optional(),
  activeFilePath: z.string().nullable().optional(),
  selectedTreePath: z.string().nullable().optional(),
  openTabs: z
    .array(z.object({ path: z.string().min(1).max(4096), dirty: z.boolean() }))
    .max(AGENT_CHAT_MAX_OPEN_TABS),
  attachments: z
    .array(
      z.object({
        type: z.enum(['file', 'folder']),
        path: z.string().min(1).max(4096),
        source: z.enum(['workspace', 'upload']).optional(),
        displayName: z.string().max(512).optional(),
        mediaType: z.string().max(256).optional(),
        byteSize: z.number().int().nonnegative().max(20 * 1024 * 1024).optional(),
      }),
    )
    .max(AGENT_CHAT_MAX_ATTACHMENTS)
    .optional(),
  pinned: z.array(AgentContextPinSchema).max(AGENT_CONTEXT_MAX_PINS_PER_PROJECT).optional(),
  editorSelection: z
    .object({
      path: z.string().min(1).max(4096),
      startLine: z.number().int().positive(),
      endLine: z.number().int().positive(),
      text: z.string().max(AGENT_CHAT_SELECTION_MAX_CHARS).optional(),
      truncated: z.boolean(),
    })
    .nullable()
    .optional(),
  chatMode: z.enum(['fast', 'plan']),
})

const ThreadMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().max(AGENT_CHAT_MAX_MESSAGE_CHARS),
})

const StartPayloadSchema = z.object({
  streamId: z.string().min(1).max(AGENT_CHAT_MAX_STREAM_ID_LEN),
  model: z.string().min(1).max(MAX_MODEL_LEN),
  modelIntent: z.enum(['chat_default', 'planning', 'execution']).optional(),
  isApprovedPlanAutoRun: z.boolean().optional(),
  planWorkflowUsePlanningModel: z.boolean().optional(),
  approvedPlanId: z.string().uuid().optional(),
  approvedPlanMessageId: z.string().min(1).max(256).optional(),
  userText: z.string().min(1).max(AGENT_CHAT_MAX_USER_TEXT_CHARS),
  threadSnapshot: z.array(ThreadMessageSchema).max(AGENT_CHAT_MAX_THREAD_MESSAGES),
  activeContext: ActiveContextSchema,
})

export type CurrentProjectSnapshot = {
  projectId: string | null
  manifest: GrokProjectManifest | null
}

const activeTurns = new Map<string, AbortController>()
const pendingCommandApprovals = new Map<
  string,
  {
    streamId: string
    resolve: (approved: boolean) => void
  }
>()

let targetWindow: BrowserWindow | null = null
let getCurrentProject: () => CurrentProjectSnapshot = () => ({ projectId: null, manifest: null })

const httpAgentChatModelTransport = createHttpAgentChatModelTransport()
let activeAgentChatModelTransport: AgentChatModelTransport = httpAgentChatModelTransport

/**
 * @internal Vitest — swap the xAI HTTP transport; returned function restores the previous transport.
 */
export function setAgentChatModelTransportForTesting(transport: AgentChatModelTransport | null): () => void {
  const prev = activeAgentChatModelTransport
  activeAgentChatModelTransport = transport ?? httpAgentChatModelTransport
  return () => {
    activeAgentChatModelTransport = prev
  }
}

/**
 * @internal Vitest — override `getCurrentProject` used by the agent loop; restore with the returned function.
 */
export function setGetCurrentProjectForTesting(getter: () => CurrentProjectSnapshot): () => void {
  const prev = getCurrentProject
  getCurrentProject = getter
  return () => {
    getCurrentProject = prev
  }
}

/**
 * @internal Vitest — register `streamId` with an AbortController before calling {@link runAgentTurnJobForEvaluation}.
 */
export function primeActiveAgentTurn(streamId: string, ac: AbortController = new AbortController()): AbortController {
  activeTurns.set(streamId, ac)
  return ac
}

/**
 * @internal Vitest — run the same job as IPC `agent-chat-start` after {@link primeActiveAgentTurn}.
 */
export async function runAgentTurnJobForEvaluation(payload: AgentChatStartPayload): Promise<void> {
  await runTurnJob(payload)
}

function getE2eMockReply(): string | null {
  const raw = process.env['GROKFORGE_E2E_AGENT_REPLY']
  return raw && raw.trim() ? raw : null
}

function getE2eMockEditProposalJson(): string | null {
  const raw = process.env['GROKFORGE_E2E_EDIT_PROPOSAL_JSON']
  return raw && raw.trim() ? raw : null
}

function emitE2eMockEditProposalIfConfigured(
  streamId: string,
  projectId: string,
  manifest: GrokProjectManifest,
  activeContext: AgentChatStartPayload['activeContext'],
): void {
  const raw = getE2eMockEditProposalJson()
  if (!raw) return
  let batch: z.infer<typeof AgentToolBatchPayloadSchema>
  try {
    batch = AgentToolBatchPayloadSchema.parse(JSON.parse(raw))
  } catch (err) {
    console.warn('[GrokForge agent-runner] E2E mock edit proposal JSON invalid', err)
    return
  }
  const sanitized = sanitizeActiveContext(manifest, projectId, activeContext)
  const batchCtx: AgentToolExecutionContext = {
    projectId,
    streamId,
    snapshotId: '00000000-0000-4000-8000-000000000000',
    toolCallId: 'e2e-mock-edit',
    activityId: 'e2e-mock-edit',
    agentProfileId: 'default',
    harnessProfileKey: 'grok_code_fast',
    sessionDepth: 'parent',
    abortSignal: new AbortController().signal,
    manifest,
    roots: manifest.roots,
    activeContext: sanitized,
    readPathsThisTurn: getAgentTurnReads(streamId),
    readHashesThisTurn: getAgentTurnReadHashes(streamId),
    emitProgress: () => {},
    recordPathRead: () => {},
    askCommandApproval: async () => false,
  }
  const result = validateAgentEditProposal(batch, batchCtx)
  if (result.ok) {
    clearAgentTurnReads(streamId)
    emit({ streamId, phase: 'edit_proposal', proposal: result.proposal })
  } else {
    console.warn('[GrokForge agent-runner] E2E mock edit proposal rejected', result.error)
  }
}

function isDevMode(): boolean {
  return process.env.NODE_ENV === 'development'
}

function logTurnRoutingIfDev(
  payload: AgentChatStartPayload,
  routing: ReturnType<typeof resolveAgentTurnRouting>,
  harnessProfile: Readonly<AgentHarnessProfile>,
  agentProfile: Readonly<AgentProfile>,
  allowedToolNames: readonly string[],
): void {
  if (!isDevMode()) return
  const rendererModel = payload.model.trim()
  const meta = {
    ...routing,
    harnessProfileDisplayName: harnessProfile.displayName,
    agentProfileDisplayName: agentProfile.displayName,
    reasoningTracePolicy: harnessProfile.reasoningTracePolicy,
    allowedTools: allowedToolNames,
  }
  if (rendererModel !== routing.modelId) {
    console.debug('[GrokForge agent-runner] renderer model hint differs from canonical API model', {
      rendererModel,
      canonicalModelId: routing.modelId,
      ...meta,
    })
  } else {
    console.debug('[GrokForge agent-runner] turn routing (canonical API model)', meta)
  }
}

export function setAgentChatTargetWindow(win: BrowserWindow | null): void {
  targetWindow = win
}

function emit(payload: AgentChatEventPayload): void {
  targetWindow?.webContents.send('agent-chat-event', payload)
}

function activityId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function emitActivity(
  streamId: string,
  activity: Omit<AgentChatEventPayload & { phase: 'activity' }, 'streamId' | 'phase'>['activity'],
): void {
  trackTurnReceiptActivity(streamId, activity.status)
  emit({ streamId, phase: 'activity', activity })
}

async function providerSampleFromSnapshot(
  snapshot: ReturnType<typeof buildTurnSnapshot>,
  signal: AbortSignal,
): Promise<{ content: string; toolCalls: AgentModelToolCall[] }> {
  return activeAgentChatModelTransport.sampleChatCompletion(providerRequestFromSnapshot(snapshot), signal)
}

async function providerStreamFromSnapshot(
  streamId: string,
  snapshot: ReturnType<typeof buildTurnSnapshot>,
  signal: AbortSignal,
  onFinalChunk?: (delta: string) => void,
): Promise<void> {
  await activeAgentChatModelTransport.streamFinalAnswer(
    providerRequestFromSnapshot(snapshot),
    signal,
    (delta) => {
      onFinalChunk?.(delta)
      emit({ streamId, phase: 'final_chunk', delta })
    },
  )
}

function toGreenfieldIndexSnapshot(index: StoredWorkspaceIndex): GreenfieldIndexSnapshot {
  return {
    intelligence: {
      stats: { fileCountScanned: index.intelligence.stats.fileCountScanned },
      files: index.intelligence.files.map((f) => ({
        relativePath: f.relativePath,
        basename: f.basename,
      })),
      packages: index.intelligence.packages.map((p) => ({
        path: p.path,
        name: p.name,
      })),
    },
  }
}

function buildInitialMessages(
  manifest: GrokProjectManifest,
  projectId: string,
  payload: AgentChatStartPayload,
  retrievedContext: string,
  harnessProfileKey: HarnessProfileKey,
  harnessCtx: HarnessPromptTurnContext,
): AgentModelChatMessage[] {
  const profile = getHarnessProfile(harnessProfileKey)
  const { systemPrompt } = buildChatSystemPrompt(manifest, {
    harnessProfileKey,
    harnessPromptTurnContext: harnessCtx,
  })
  const activeContext = buildActiveContextBlock(payload.activeContext, manifest, projectId)
  const threadMemory = formatThreadMemoryBlock(loadThreadMemory(projectId))
  const memoryBlock =
    threadMemory.trim().length > 0
      ? threadMemory.length <= AGENT_CONTEXT_BUDGETS.threadMemoryMaxChars
        ? threadMemory
        : `${threadMemory.slice(0, AGENT_CONTEXT_BUDGETS.threadMemoryMaxChars)}\n[...thread memory truncated...]`
      : ''
  const dynamicContext = [
    activeContext,
    memoryBlock,
    retrievedContext.trim() ? `## Relevant workspace context\n${retrievedContext}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
  const prior = payload.threadSnapshot
    .filter((m) => m.content.trim())
    .slice(-40)
    .map((m): AgentModelChatMessage => {
      if (m.role === 'system') {
        return { role: 'system', content: m.content }
      }
      return { role: m.role, content: m.content }
    })
  const planModeBlock =
    payload.activeContext.chatMode === 'plan'
      ? [
          '',
          '## Plan mode (structured plan output)',
          `The user enabled **Plan mode** for this turn. After any necessary read/search tool calls, your final answer must include **exactly one** fenced JSON block with the markdown language tag \`${GF_PLAN_FENCE}\` (not \`${AGENT_TOOL_FENCE_INFO}\`).`,
          'The fence body must be one JSON object with: `schemaVersion` 1, `summary` (string), `filesLikelyTouched` (string array), `risksUnknowns` (string array), `steps` (array of { `id`, `title` } with at least one step), `verification` (string).',
          'You may put readable prose before or after the fence. The JSON must parse as-is. Do not put file-write payloads inside this JSON; use `propose_file_edits` for edits after the user approves the plan.',
        ].join('\n')
      : ''
  const recoveryBlock = consumeTurnRecoveryHint(projectId) ?? ''
  let approvedPlanBlock = ''
  if (payload.isApprovedPlanAutoRun && payload.approvedPlanId) {
    const artifact = loadPlanArtifact(projectId, payload.approvedPlanId)
    if (artifact) {
      approvedPlanBlock = buildApprovedPlanSystemInjection(
        artifact,
        planJsonPath(projectId, payload.approvedPlanId),
      )
    }
  }
  return [
    {
      role: 'system',
      content: [
        systemPrompt,
        '',
        '## Agent tool loop',
        ...AGENT_TOOL_LOOP_SHARED,
        ...buildAgentToolLoopProfileSections(profile, harnessCtx),
        planModeBlock,
        approvedPlanBlock,
        recoveryBlock,
        dynamicContext,
      ]
        .filter(Boolean)
        .join('\n'),
    },
    ...prior,
    { role: 'user', content: payload.userText },
  ]
}

function finalAnswerContract(
  userText: string,
  editProposalCreated: boolean,
  editToolsFailed: boolean,
  chatMode: 'fast' | 'plan',
  harnessProfileKey: HarnessProfileKey,
  agentProfileId: AgentProfileId,
  harnessCtx: HarnessPromptTurnContext,
): AgentModelChatMessage {
  return {
    role: 'system',
    content: buildFinalAnswerContract({
      userText,
      editProposalCreated,
      editToolsFailed,
      chatMode,
      profileKey: harnessProfileKey,
      agentProfileId,
      executeFromApprovedPlan: harnessCtx.executeFromApprovedPlan,
      greenfieldWorkspace: harnessCtx.greenfieldWorkspace,
    }),
  }
}

function computeEditToolsFailed(
  userText: string,
  editProposalCreated: boolean,
  searchReplaceFailuresByPath: ReadonlyMap<string, number>,
): boolean {
  return (
    !editProposalCreated &&
    isLikelyEditIntent(userText) &&
    shouldInjectSearchReplaceEscalation(searchReplaceFailuresByPath)
  )
}

function buildMaxToolIterationsHint(input: {
  isPlanMode: boolean
  userText: string
  editProposalCreated: boolean
  searchReplaceFailuresByPath: ReadonlyMap<string, number>
}): string {
  if (
    !input.isPlanMode &&
    computeEditToolsFailed(input.userText, input.editProposalCreated, input.searchReplaceFailuresByPath)
  ) {
    return [
      'GrokForge reached the maximum tool iterations for this turn.',
      'Edit tools did not succeed (search_replace failed repeatedly and no reviewable edit proposal was created).',
      'Summarize what you attempted; do not claim any workspace file was updated, saved, or written on disk.',
      'Tell the user they can retry with propose_file_edits using the complete file from read_file rawContent, or edit manually.',
    ].join(' ')
  }
  if (input.isPlanMode) {
    return 'GrokForge reached the plan-mode tool step limit. Provide your final answer with exactly one ```gf-plan``` fenced JSON block from the context gathered so far.'
  }
  return 'GrokForge reached the maximum read/search tool iterations for this turn. Provide the best grounded answer you can from the gathered context, and say what you could not verify.'
}

function isAllowedToolName(name: string): name is AgentChatToolName {
  return (
    name === 'workspace_index' ||
    name === 'list_directory' ||
    name === 'read_file' ||
    name === 'search_workspace' ||
    name === 'search_replace' ||
    name === 'run_command' ||
    name === 'propose_file_edits' ||
    name === 'spawn_subagent'
  )
}


function sanitizeActiveContext(
  manifest: GrokProjectManifest,
  projectId: string,
  activeContext: AgentChatStartPayload['activeContext'],
): AgentChatStartPayload['activeContext'] {
  const selection = activeContext.editorSelection
  const selectionPath = selection ? resolve(selection.path) : null
  const safeSelection =
    selection && selectionPath &&
    isPathWithinWorkspaceRoots(selectionPath, manifest.roots) &&
    !shouldIgnoreFsEntry(selectionPath, manifest.roots, manifest.ignore ?? []) &&
    !isLikelySensitivePath(selectionPath)
      ? { ...selection, path: selectionPath }
      : null
  return {
    ...activeContext,
    editorSelection: safeSelection,
    attachments: sanitizeAttachmentsForTurn(manifest, projectId, activeContext.attachments),
  }
}

async function waitForCommandApproval(
  requestId: string,
  streamId: string,
  signal: AbortSignal,
): Promise<boolean> {
  if (signal.aborted) throw signal.reason
  return new Promise((resolvePromise, reject) => {
    const cleanup = () => {
      signal.removeEventListener('abort', onAbort)
      pendingCommandApprovals.delete(requestId)
    }
    const onAbort = () => {
      cleanup()
      reject(signal.reason)
    }
    pendingCommandApprovals.set(requestId, {
      streamId,
      resolve: (approved) => {
        cleanup()
        resolvePromise(approved)
      },
    })
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

async function runAgentTurn(
  payload: AgentChatStartPayload,
  ac: AbortController,
  scratch: TurnTraceScratch | null,
): Promise<void> {
  const snapshot = getCurrentProject()
  const manifest = snapshot.manifest
  const projectId = snapshot.projectId
  if (!manifest || !projectId) {
    emit({ streamId: payload.streamId, phase: 'error', error: 'No project loaded' })
    throw new Error('No project loaded')
  }

  const routing = resolveAgentTurnRouting(manifest, payload)
  const harnessProfile = getHarnessProfile(routing.harnessProfileKey)
  const agentProfile = getAgentProfile(routing.agentProfileId)
  const turnToolDefinitions = filterToolDefinitionsForProfile(
    buildAgentToolDefinitions(harnessProfile.toolDescriptionOverrides),
    agentProfile,
  )
  logTurnRoutingIfDev(
    payload,
    routing,
    harnessProfile,
    agentProfile,
    turnToolDefinitions.map((d) => d.function.name),
  )
  emit({ streamId: payload.streamId, phase: 'turn_started', routing })
  beginTurnReceipt(projectId, payload.streamId, routing)
  clearAgentTurnReads(payload.streamId)
  const safePayload: AgentChatStartPayload = {
    ...payload,
    activeContext: sanitizeActiveContext(manifest, projectId, payload.activeContext),
  }

  const mockReply = getE2eMockReply()
  if (mockReply) {
    if (scratch) {
      const retrievalSnapMock: AgentRetrievalDebugSnapshot = {
        generatedAt: new Date().toISOString(),
        userTextPreview: safePayload.userText.slice(0, 500),
        files: [],
        stale: false,
        skipped: { ignored: 0, generated: 0, binary: 0, sensitive: 0, large: 0 },
        warnings: ['E2E mock: lexical retrieval skipped'],
      }
      applyRetrievalToScratch(scratch, retrievalSnapMock)
      setRetrievalDetailLines(scratch, ['E2E mock — lexical retrieval skipped'])
      setRetrievalContextBodyChars(scratch, 0)
    }
    const id = activityId()
    emitActivity(payload.streamId, {
      id,
      tool: 'retrieval',
      title: 'Using E2E mock agent reply',
      status: 'running',
    })
    emitActivity(payload.streamId, {
      id,
      tool: 'retrieval',
      title: 'E2E mock agent reply ready',
      status: 'done',
    })
    for (let i = 0; i < mockReply.length; i += 80) {
      if (ac.signal.aborted) throw ac.signal.reason
      const chunk = mockReply.slice(i, i + 80)
      if (scratch) scratch.assistantStreamChars += chunk.length
      emit({ streamId: payload.streamId, phase: 'final_chunk', delta: chunk })
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    emitE2eMockEditProposalIfConfigured(
      payload.streamId,
      projectId,
      manifest,
      safePayload.activeContext,
    )
    emit({ streamId: payload.streamId, phase: 'activity_clear_running', reason: 'done' })
    finalizeTurnReceipt(payload.streamId, 'completed')
    emit({ streamId: payload.streamId, phase: 'done' })
    return
  }

  const retrievalActivityId = activityId()
  emitActivity(payload.streamId, {
    id: retrievalActivityId,
    tool: 'retrieval',
    title: 'Finding relevant workspace context',
    status: 'running',
  })
  const retrieval = buildLexicalRetrievalContext(
    { projectId, manifest, activeContext: safePayload.activeContext, abortSignal: ac.signal },
    safePayload.userText,
  )
  const retrievalSnap: AgentRetrievalDebugSnapshot = {
    generatedAt: new Date().toISOString(),
    userTextPreview: safePayload.userText.slice(0, 500),
    files: retrieval.retrieved,
    stale: retrieval.stale,
    staleReason: retrieval.staleReason,
    skipped: retrieval.skipped,
    warnings: [
      retrieval.stale ? `Stale index: ${retrieval.staleReason ?? 'refresh recommended'}` : '',
      retrieval.skipped.sensitive > 0 ? `${retrieval.skipped.sensitive} sensitive file(s) excluded` : '',
    ].filter(Boolean),
  }
  recordAgentRetrievalDebug(retrievalSnap)
  if (scratch) {
    applyRetrievalToScratch(scratch, retrievalSnap)
    setRetrievalDetailLines(scratch, retrieval.details)
    setRetrievalContextBodyChars(scratch, retrieval.context.length)
  }
  emitActivity(payload.streamId, {
    id: retrievalActivityId,
    tool: 'retrieval',
    title: 'Found relevant workspace context',
    detail: [
      `${retrieval.count} file${retrieval.count === 1 ? '' : 's'}`,
      ...retrieval.details.slice(0, 4),
      retrieval.stale ? `Warning: stale index (${retrieval.staleReason ?? 'refresh recommended'})` : '',
      retrieval.skipped.sensitive > 0 ? `${retrieval.skipped.sensitive} sensitive file(s) excluded` : '',
    ]
      .filter(Boolean)
      .join(' · '),
    status: 'done',
  })

  const storedIndex = loadWorkspaceIndex(projectId)
  const greenfield = isGreenfieldWorkspace({
    index: storedIndex ? toGreenfieldIndexSnapshot(storedIndex) : null,
    retrievalMatchCount: retrieval.retrieved.length,
  })
  const harnessCtx: HarnessPromptTurnContext = {
    greenfieldWorkspace: safePayload.activeContext.chatMode === 'plan' && greenfield,
    executeFromApprovedPlan: safePayload.isApprovedPlanAutoRun === true,
  }

  const messages = buildInitialMessages(
    manifest,
    projectId,
    safePayload,
    retrieval.context,
    routing.harnessProfileKey,
    harnessCtx,
  )
  pruneStaleAgentOffloads(projectId)

  let totalToolChars = 0
  let editProposalCreated = false
  let turnProposalAccum: AgentEditProposalPayload | null = null
  const searchReplaceFailuresByPath = new Map<string, number>()

  const onFinalChunk = scratch
    ? (delta: string) => {
        scratch.assistantStreamChars += delta.length
      }
    : undefined

  const isPlanMode = safePayload.activeContext.chatMode === 'plan'
  const maxToolIterations =
    agentProfile.maxToolRounds !== undefined
      ? Math.min(AGENT_TOOL_MAX_ITERATIONS, agentProfile.maxToolRounds)
      : AGENT_TOOL_MAX_ITERATIONS
  let toolRoundCount = 0
  let providerRoundIndex = 0
  let editIntentToolNudgeIssued = false
  let searchReplaceEscalationNudgeIssued = false
  let postEscalationToolRounds = 0

  const snapshotForProviderRound = (roundKind: 'tool_sample' | 'final_stream') => {
    const snapshot = buildTurnSnapshot({
      roundIndex: providerRoundIndex,
      roundKind,
      streamId: payload.streamId,
      traceId: scratch?.traceId,
      routing,
      chatMode: safePayload.activeContext.chatMode,
      messages,
      toolDefinitions: turnToolDefinitions,
      activeContext: safePayload.activeContext,
    })
    providerRoundIndex += 1
    if (scratch) pushProviderRound(scratch, snapshot, 'completed')
    return snapshot
  }

  const completeTurnWithFinalStream = async (extraUserHint?: string): Promise<void> => {
    if (isPlanMode) {
      emitActivity(payload.streamId, {
        id: activityId(),
        title: 'Writing structured plan',
        status: 'running',
      })
    }
    if (extraUserHint) {
      messages.push({ role: 'user', content: extraUserHint })
    }
    messages.push(
      finalAnswerContract(
        safePayload.userText,
        editProposalCreated,
        computeEditToolsFailed(
          safePayload.userText,
          editProposalCreated,
          searchReplaceFailuresByPath,
        ),
        safePayload.activeContext.chatMode,
        routing.harnessProfileKey,
        routing.agentProfileId,
        harnessCtx,
      ),
    )
    messages.push({
      role: 'user',
      content:
        'Now provide the final answer to the user from the gathered context. Stream the final answer; do not request more tools.',
    })
    const finalSnapshot = snapshotForProviderRound('final_stream')
    await providerStreamFromSnapshot(payload.streamId, finalSnapshot, ac.signal, onFinalChunk)
    emit({ streamId: payload.streamId, phase: 'activity_clear_running', reason: 'done' })
    finalizeTurnReceipt(payload.streamId, 'completed')
    emit({ streamId: payload.streamId, phase: 'done' })
  }

  for (let i = 0; i < maxToolIterations; i += 1) {
    if (ac.signal.aborted) throw ac.signal.reason
    const sampleSnapshot = snapshotForProviderRound('tool_sample')
    const sampled = await providerSampleFromSnapshot(sampleSnapshot, ac.signal)
    if (sampled.toolCalls.length === 0) {
      const shouldNudgeForEditIntent =
        !isPlanMode &&
        !editProposalCreated &&
        agentProfile.canProposeEdits &&
        isLikelyEditIntent(safePayload.userText) &&
        !editIntentToolNudgeIssued
      if (shouldNudgeForEditIntent) {
        editIntentToolNudgeIssued = true
        messages.push({ role: 'user', content: buildEditIntentToolNudge() })
        continue
      }
      await completeTurnWithFinalStream()
      return
    }

    toolRoundCount += 1

    messages.push({
      role: 'assistant',
      content: sampled.content || null,
      tool_calls: sampled.toolCalls,
    })

    for (const call of sampled.toolCalls) {
      const name = call.function.name
      const id = activityId()
      const toolName = isAllowedToolName(name) ? name : undefined
      emitActivity(payload.streamId, {
        id,
        tool: toolName,
        title: toolName ? `Using ${toolName}` : `Unknown tool: ${name}`,
        status: 'running',
      })

      const toolCtx = buildAgentToolExecutionContext({
        projectId,
        streamId: payload.streamId,
        snapshotId: sampleSnapshot.snapshotId,
        toolCallId: call.id,
        activityId: id,
        toolName,
        routing,
        activeContext: safePayload.activeContext,
        manifest,
        sessionDepth: 'parent',
        abortSignal: ac.signal,
        emit,
        waitForCommandApproval,
      })

      const outcome = await executeAgentToolCall(
        toolCtx,
        call,
        {
          totalToolChars,
          editProposalCreated,
          turnProposalAccum,
          agentProfile,
          manifest,
          searchReplaceFailuresByPath,
          userMessageHint: safePayload.userText,
        },
        { emit, approvalRequestId: activityId(), waitForCommandApproval },
      )

      const { doneTitle, detail, ok } = outcome
      if (outcome.editProposalCreated !== undefined) editProposalCreated = outcome.editProposalCreated
      if (outcome.turnProposalAccum !== undefined) turnProposalAccum = outcome.turnProposalAccum

      const offload = applyToolResultOffload({
        projectId,
        streamId: payload.streamId,
        toolCallId: call.id,
        toolContent: outcome.toolContent,
      })
      const providerToolContent = offload.providerContent
      totalToolChars += offload.providerChars

      const truncatedInLoop =
        providerToolContent.includes('[...total tool result budget reached...]') ||
        providerToolContent.includes('[...truncated...]')
      if (scratch) {
        pushToolStep(scratch, {
          iteration: i,
          toolCallId: call.id,
          name,
          ok,
          resultChars: offload.providerChars,
          truncatedInLoop,
          displayTitle: doneTitle,
          errorSnippet: ok ? undefined : (detail?.slice(0, 500) ?? providerToolContent.slice(0, 500)),
          ...(offload.offloaded
            ? {
                offloaded: true,
                originalResultChars: offload.originalChars,
                offloadRelPath: offload.offloadRelPath,
              }
            : {}),
        })
      }
      emitActivity(payload.streamId, {
        id,
        tool: isAllowedToolName(name) ? name : undefined,
        title: doneTitle,
        detail: offload.offloaded
          ? [detail, `Context offloaded (${offload.originalChars.toLocaleString()} chars → pointer)`]
              .filter(Boolean)
              .join(' · ')
          : detail,
        status: ok ? 'done' : 'error',
      })
      messages.push({ role: 'tool', tool_call_id: call.id, content: providerToolContent })
    }
    if (scratch) {
      scratch.editProposalCreated = editProposalCreated
      scratch.totalToolCharsAccumulated = totalToolChars
    }

    if (searchReplaceEscalationNudgeIssued) {
      postEscalationToolRounds += 1
    }

    const shouldForceFinalForEditFailures =
      !isPlanMode &&
      !editProposalCreated &&
      agentProfile.canProposeEdits &&
      isLikelyEditIntent(safePayload.userText) &&
      (totalSearchReplaceFailures(searchReplaceFailuresByPath) >=
        SEARCH_REPLACE_MAX_FAILURES_PER_TURN_BEFORE_FORCE_FINAL ||
        (searchReplaceEscalationNudgeIssued &&
          postEscalationToolRounds >= POST_ESCALATION_MAX_TOOL_ROUNDS))

    if (shouldForceFinalForEditFailures) {
      emitActivity(payload.streamId, {
        id: activityId(),
        title: 'Finishing turn (edit tools did not succeed)',
        status: 'done',
        detail:
          'Stopping further tool rounds after repeated search_replace failures. Provide an honest summary — no proposal was created.',
      })
      await completeTurnWithFinalStream(
        buildMaxToolIterationsHint({
          isPlanMode,
          userText: safePayload.userText,
          editProposalCreated,
          searchReplaceFailuresByPath,
        }),
      )
      return
    }

    const shouldEscalateSearchReplace =
      !isPlanMode &&
      !editProposalCreated &&
      agentProfile.canProposeEdits &&
      !searchReplaceEscalationNudgeIssued &&
      shouldInjectSearchReplaceEscalation(searchReplaceFailuresByPath)
    if (shouldEscalateSearchReplace) {
      searchReplaceEscalationNudgeIssued = true
      postEscalationToolRounds = 0
      emitActivity(payload.streamId, {
        id: activityId(),
        title: 'Harness: switch to propose_file_edits',
        status: 'done',
        detail:
          'search_replace failed repeatedly. Re-read rawContent and use a full-file propose_file_edits for localized changes.',
      })
      messages.push({
        role: 'user',
        content: buildSearchReplaceEscalationNudge(
          pathsAtSearchReplaceEscalationThreshold(searchReplaceFailuresByPath),
        ),
      })
      continue
    }

    if (isPlanMode && toolRoundCount >= 1) {
      await completeTurnWithFinalStream(
        'You have enough workspace context from discovery tools. Provide your final answer now with exactly one ```gf-plan``` fenced JSON block. Do not request more tools.',
      )
      return
    }
  }

  if (scratch) scratch.maxToolIterationsHit = true
  const maxHint = buildMaxToolIterationsHint({
    isPlanMode,
    userText: safePayload.userText,
    editProposalCreated,
    searchReplaceFailuresByPath,
  })
  await completeTurnWithFinalStream(maxHint)
}

async function runTurnJob(payload: AgentChatStartPayload): Promise<void> {
  const ac = activeTurns.get(payload.streamId)
  if (!ac) return

  const snap = getCurrentProject()
  let scratch: TurnTraceScratch | null = null
  let turnRouting: ReturnType<typeof resolveAgentTurnRouting> | null = null
  if (snap.projectId && snap.manifest) {
    try {
      turnRouting = resolveAgentTurnRouting(snap.manifest, payload)
      const { systemPrompt } = buildChatSystemPrompt(snap.manifest)
      scratch = createTurnTraceScratch(snap.projectId, payload, systemPrompt.length, turnRouting)
    } catch {
      scratch = null
    }
  }

  let traceOutcome: TurnTraceOutcome = 'completed'
  let traceError: string | undefined

  const timeout = setTimeout(() => ac.abort(ABORT_TIMEOUT), AGENT_TURN_TIMEOUT_MS)
  try {
    await runAgentTurn(payload, ac, scratch)
  } catch (e) {
    if (ac.signal.aborted) {
      if (ac.signal.reason === ABORT_USER) {
        traceOutcome = 'cancelled'
      } else if (ac.signal.reason === ABORT_TIMEOUT) {
        traceOutcome = 'timeout'
        traceError = 'Agent turn timed out'
      } else {
        traceOutcome = 'error'
        traceError =
          typeof ac.signal.reason === 'string' && ac.signal.reason.trim()
            ? ac.signal.reason
            : 'Agent turn aborted'
      }
    } else {
      traceOutcome = 'error'
      traceError = e instanceof Error ? e.message : 'Agent turn failed'
    }

    if (ac.signal.aborted || e === ABORT_USER || e === ABORT_TIMEOUT) {
      if (ac.signal.reason === ABORT_QUIT) {
        return
      }
      if (ac.signal.reason === ABORT_USER) {
        finalizeTurnReceipt(payload.streamId, 'cancelled')
      } else {
        finalizeTurnReceipt(payload.streamId, 'error')
      }
      emit({
        streamId: payload.streamId,
        phase: 'activity_clear_running',
        reason: ac.signal.reason === ABORT_USER ? 'cancelled' : 'error',
      })
      emit({
        streamId: payload.streamId,
        phase: ac.signal.reason === ABORT_USER ? 'cancelled' : 'error',
        ...(ac.signal.reason === ABORT_USER ? {} : { error: traceError ?? 'Agent turn timed out' }),
      } as AgentChatEventPayload)
      return
    }
    const msg = traceError ?? (e instanceof Error ? e.message : 'Agent turn failed')
    finalizeTurnReceipt(payload.streamId, 'error')
    emit({ streamId: payload.streamId, phase: 'activity_clear_running', reason: 'error' })
    emit({ streamId: payload.streamId, phase: 'error', error: msg })
  } finally {
    clearTimeout(timeout)
    if (traceOutcome === 'completed') {
      finalizeTurnReceiptIfPending(payload.streamId, 'completed')
    }
    activeTurns.delete(payload.streamId)
    clearTurnReceiptState(payload.streamId)
    setImmediate(() => clearAgentTurnReads(payload.streamId))
    if (scratch) {
      try {
        if (traceOutcome === 'cancelled') {
          markLastProviderRoundCancelled(scratch)
        }
        if (isDevMode() && scratch.lastSnapshotId && traceOutcome !== 'completed') {
          console.info(`[GrokForge] agent turn ${traceOutcome}; lastSnapshotId=${scratch.lastSnapshotId}`)
        }
        const finalizedTrace = finalizeTurnTrace(scratch, traceOutcome, { errorMessage: traceError })
        writeAgentTurnTrace(scratch.projectId, finalizedTrace)
        appendTraceToThreadMemory(scratch.projectId, finalizedTrace)
      } catch {
        /* ignore trace persistence failures */
      }
    }
  }
}

export function registerAgentChatIpc(options: { getCurrentProject: () => CurrentProjectSnapshot }): void {
  getCurrentProject = options.getCurrentProject

  ipcMain.handle('agent-chat-capabilities', (): AgentChatCapabilitiesResult => ({
    apiKeyConfigured: Boolean(hasConfiguredXaiApiKey() || getE2eMockReply()),
  }))

  ipcMain.handle('agent-chat-start', async (_, raw: unknown): Promise<AgentChatStartResult> => {
    const parsed = StartPayloadSchema.safeParse(raw)
    if (!parsed.success) return { ok: false, error: parsed.error.message }
    if (!getXaiApiKey() && !getE2eMockReply()) {
      return {
        ok: false,
        error: 'Missing XAI API key. Add it in Settings or set XAI_API_KEY / GROKFORGE_XAI_API_KEY.',
      }
    }
    const payload = parsed.data
    if (activeTurns.has(payload.streamId)) return { ok: false, error: 'streamId already in use' }
    const ac = new AbortController()
    activeTurns.set(payload.streamId, ac)
    void runTurnJob(payload)
    return { ok: true, streamId: payload.streamId }
  })

  ipcMain.handle('agent-chat-cancel', async (_, streamId: unknown): Promise<{ ok: boolean }> => {
    if (typeof streamId !== 'string' || !streamId.trim()) return { ok: false }
    const ac = activeTurns.get(streamId)
    if (!ac) return { ok: true }
    ac.abort(ABORT_USER)
    return { ok: true }
  })

  ipcMain.handle('agent-command-approval-respond', async (_, raw: unknown): Promise<AgentCommandApprovalRespondResult> => {
    const parsed = z
      .object({
        streamId: z.string().min(1).max(AGENT_CHAT_MAX_STREAM_ID_LEN),
        requestId: z.string().min(1).max(128),
        approved: z.boolean(),
      })
      .safeParse(raw)
    if (!parsed.success) return { ok: false, error: parsed.error.message }
    const payload: AgentCommandApprovalResponse = parsed.data
    const pending = pendingCommandApprovals.get(payload.requestId)
    if (!pending || pending.streamId !== payload.streamId) {
      return { ok: false, error: 'Approval request is no longer active.' }
    }
    pending.resolve(payload.approved)
    return { ok: true }
  })

  ipcMain.handle('get-last-agent-turn-trace', (): GetLastAgentTurnTraceResult => {
    const { projectId } = getCurrentProject()
    if (!projectId) return { ok: false, error: 'No project loaded.' }
    return getLastAgentTurnTraceForProject(projectId)
  })

  ipcMain.handle('export-sanitized-agent-turn-trace', (): ExportSanitizedAgentTurnTraceResult => {
    const { projectId } = getCurrentProject()
    if (!projectId) return { ok: false, error: 'No project loaded.' }
    return exportSanitizedAgentTurnTraceJson(projectId)
  })

  ipcMain.handle('replay-agent-retrieval-preview', (): ReplayAgentRetrievalPreviewResult => {
    const snap = getCurrentProject()
    if (!snap.projectId || !snap.manifest) return { ok: false, error: 'No project loaded.' }
    return replayRetrievalPreviewFromLatestTrace(snap.projectId, snap.manifest)
  })

}
