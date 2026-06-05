import { ipcMain, type BrowserWindow } from "electron";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import type { GrokProjectManifest } from "./manifest";
import {
  buildChatSystemPrompt,
  recordAgentRetrievalDebug,
  type AgentRetrievalDebugSnapshot,
} from "../harness/context/context";
import {
  createHttpAgentChatModelTransport,
  type AgentChatModelTransport,
  type AgentModelToolCall,
} from "../harness/agent/chat-model-transport";
import type { AgentModelChatMessage } from "../shared/agent-model-message";
import { providerRequestFromSnapshot } from "../harness/compaction/turn-snapshot";
import { buildTurnSnapshot } from "../harness/compaction/turn-snapshot-builder";
import { getXaiApiKey } from "./grok-stream";
import { hasConfiguredXaiApiKey } from "./xai-key-store";
import { AGENT_TOOL_FENCE_INFO } from "../harness/tools/contracts/tool-contract";
import { AgentToolBatchPayloadSchema } from "../harness/tools/contracts/tool-schema";
import {
  buildGfPlanToolLoopBlock,
  GF_PLAN_FENCE_NUDGE_PHRASE,
} from "../harness/plan/contracts/gf-plan-contract";
import {
  impliesCommandExecution,
  commandLikelyMutatesWorkspace,
} from "../harness/routing/command-intent";
import {
  planNeedsVerificationCommand,
  resolveVerificationHint,
  shouldInjectPlanVerifyCommandNudge,
  suggestVerificationCommands,
  verificationHasCommandLikeToken,
} from "../harness/plan/verification/plan-verification";
import { shouldIgnoreFsEntry } from "./ignore-globs";
import { isPathWithinWorkspaceRoots } from "./workspace-path-guard";
import { validateAgentEditProposal } from "../harness/diff/edit-proposals";
import { buildAgentToolExecutionContext } from "../harness/tools/execution-context-builder";
import { executeAgentToolCall } from "../harness/tools/tool-executor";
import { AgentTurn } from "./agent-turn";
import { pruneStaleAgentOffloads } from "../harness/compaction/offload-store";
import { buildApprovedPlanSystemInjection } from "../harness/plan/contracts/plan-artifact";
import {
  findLatestCompletedPlanArtifact,
  loadPlanArtifact,
  planJsonPath,
} from "../harness/plan/store/plan-store";
import {
  beginTurnReceipt,
  clearTurnReceiptState,
  consumeTurnRecoveryHint,
  finalizeTurnReceipt,
  finalizeTurnReceiptIfPending,
  flushActiveAgentTurnReceiptsAsInterrupted,
  trackTurnReceiptActivity,
} from "./agent-turn-receipt-lifecycle";
import { applyToolResultOffload } from "../harness/compaction/tool-result-offload";
import {
  clearAgentTurnReads,
  getAgentTurnReadHashes,
  getAgentTurnReads,
} from "../harness/context/turn-read-registry";
import {
  AGENT_TOOL_MAX_ITERATIONS,
  APPROVED_PLAN_EXECUTE_MAX_TOOL_ROUNDS,
  buildActiveContextBlock,
  buildToolDefinitionsForTurn,
  buildLexicalRetrievalContext,
  isLikelySensitivePath,
  resolveAgentWorkspacePath,
} from "../harness/tools/workspace-tools";
import { sanitizeAttachmentsForTurn } from "./chat-attachment-staging";
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
} from "../harness/logger/turn-trace-builder";
import {
  writeAgentTurnTrace,
  getLastAgentTurnTraceForProject,
  exportSanitizedAgentTurnTraceJson,
  replayRetrievalPreviewFromLatestTrace,
} from "../harness/logger/turn-trace-store";
import type {
  AgentChatActivityPayload,
  AgentChatCapabilitiesResult,
  AgentChatEventPayload,
  AgentChatStartPayload,
  AgentChatStartResult,
  AgentChatToolName,
  AgentEditProposalPayload,
} from "../shared/agent-chat-contract";
import type { AgentToolExecutionContext } from "../harness/tools/contracts/execution-context";
import {
  isMinimalHarnessEnabled,
  runMinimalAgentTurn,
} from "../harness/minimal/run-minimal-turn";
import {
  pathsAtSearchReplaceEscalationThreshold,
  ITERATIVE_SEARCH_REPLACE_BLOCKED_BEFORE_FORCE_FINAL,
  resolvePostEscalationMaxToolRounds,
  resolveSearchReplaceMaxFailuresPerTurn,
  shouldInjectSearchReplaceEscalation,
  totalSearchReplaceFailures,
} from "../harness/policy/edit/cascade-guard";
import {
  INCOMPLETE_HTML_MAX_FAILURES_PER_TURN_BEFORE_FORCE_FINAL,
  isIncompleteHtmlProposalError,
  pathsAtIncompleteHtmlNudgeThreshold,
  isCrushedJavaScriptProposalError,
  pathsAtCrushedJavaScriptNudgeThreshold,
  pathsAtCreationIncrementalRecoveryThreshold,
  recordCrushedJavaScriptProposalFailure,
  recordCreationIntegrityProposalFailure,
  recordIncompleteHtmlProposalFailure,
  shouldInjectCreationIncrementalRecoveryNudge,
  shouldInjectCrushedJavaScriptProposalNudge,
  shouldInjectIncompleteHtmlProposalNudge,
  totalIncompleteHtmlFailures,
} from "../harness/diff/edit-corrupt-content";
import {
  extractPathsFromEditToolArguments,
  pathsAtProposalRejectionForceFinalThreshold,
  recordProposalRejection,
  shouldForceFinalForRepeatedProposalRejections,
} from "../shared/agent-proposal-rejection-loop";
import {
  creationRecoveryUnmetPathLabels,
  recordCreationRecoveryEnforced,
} from "../harness/policy/edit/creation-recovery";
import { userRequestsSingleFileHtml } from "../harness/policy/edit/single-file-html-intent";
import {
  buildDiscoverySaturationNudge,
  buildEditIntentToolNudge,
  buildFinalAnswerContract,
  resolveEditFinalAnswerHonestyContext,
  buildCrushedJavaScriptProposalNudge,
  buildCreationIncrementalRecoveryNudge,
  buildIncompleteHtmlProposalNudge,
  buildPartialBatchProposalNudge,
  buildPlanVerifyCommandNudge,
  buildPostScaffoldVerificationNudge,
  buildProposalRejectionForceFinalHint,
  buildSearchReplaceEscalationNudge,
  isLikelyEditIntent,
  shouldInjectPartialBatchProposalNudge,
} from "../harness/policy/final-answer/final-answer-contract";
import type {
  ExportSanitizedAgentTurnTraceResult,
  GetLastAgentTurnTraceResult,
  ReplayAgentRetrievalPreviewResult,
} from "../shared/agent-turn-trace-contract";
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
} from "../shared/agent-chat-contract";
import {
  AGENT_CONTEXT_MAX_PINS_PER_PROJECT,
  AgentContextPinSchema,
} from "../harness/context/context-pins-contract";
import { AGENT_CONTEXT_BUDGETS } from "../harness/compaction/context-budget-contract";
import { formatThreadMemoryBlock } from "../harness/compaction/thread-memory";
import {
  appendTraceToThreadMemory,
  loadThreadMemory,
} from "../harness/compaction/thread-memory-store";
import {
  isExplicitComposerModelIntent,
  resolveAgentTurnRouting,
} from "../harness/routing/turn-routing";
import type { AgentProfileId } from "../harness/profiles/agent-profile";
import {
  getAgentProfile,
  type AgentProfile,
} from "../harness/profiles/agent-profile";
import type { HarnessProfileKey } from "../harness/profiles/contracts/harness-profile-key";
import {
  buildAgentToolLoopSharedSections,
  buildAgentToolLoopProfileSections,
  getHarnessProfile,
  type AgentHarnessProfile,
  type HarnessPromptTurnContext,
} from "../harness/profiles/harness-profile";
import {
  loadWorkspaceIndex,
  type StoredWorkspaceIndex,
} from "../harness/context/index-store";
import {
  isSingleFilePrimaryWorkspace,
  primaryNonTrivialFile,
  shouldRoutePostPlanIncremental,
} from "../harness/plan/routing/post-plan-incremental";
import type { StoredPlanArtifact } from "../harness/plan/contracts/plan-artifact";
import {
  editToolBudgetExhaustedActivityCopy,
  harnessInterventionActivityCopy,
  type HarnessInterventionKey,
} from "../shared/agent-activity-display";
import {
  detectScaffoldConflict,
  isScaffoldSampleCompliant,
  resolveScaffoldStrategy,
  type ScaffoldConflictKind,
  type ScaffoldStrategy,
  shouldInjectScaffoldStrategyNudge,
} from "../harness/routing/scaffold-strategy";
import { buildScaffoldStrategyNudge } from "../harness/policy/final-answer/final-answer-contract";
import {
  assessPostScaffoldVerification,
  inferViteTemplateFromPlan,
  inferViteTemplateFromText,
  type ViteTemplateId,
} from "../harness/tools/helpers/scaffold-command";
import {
  agentToolRoundActivityDetail,
  agentToolRoundActivityTitle,
  formatRetrievalActivityCopy,
} from "../shared/agent-activity-display";
import {
  buildIncrementalEditMidTurnNudge,
  incrementalEditMidTurnNudgeActivityDetail,
  INCREMENTAL_EDIT_POLICY,
  pickIncrementalEditMidTurnNudge,
  resolveIncrementalMaxToolIterations,
  type IncrementalEditMidTurnNudgeKind,
} from "../harness/policy/incremental/work-edit-policy";
import { shouldRouteIterativeWorkExecutor } from "../harness/routing/iterative-work-edit";
import {
  resolveIterativeEditScope,
  type IterativeEditScope,
} from "../harness/routing/iterative-edit-scope";
import {
  classifySearchReplaceFailureReason,
  createHarnessMetricsScratch,
  HARNESS_NUDGE_CREATION_INCREMENTAL_RECOVERY,
  HARNESS_NUDGE_DISCOVERY_SATURATION,
  HARNESS_NUDGE_SEARCH_REPLACE_ESCALATION,
  incrementalEditMidTurnKindToHarnessNudgeId,
  logHarnessMetricsIfDev,
  recordEditProposalAtRound,
  recordHarnessNudge,
  recordSearchReplaceFailureReason,
  resolveMaxIterationsReason,
  syncSearchReplaceCountsToScratch,
  syncSearchReplaceFailuresToScratch,
  syncProposalRejectionsToScratch,
  topSearchReplaceFailurePathBasename,
  type MaxIterationsReason,
} from "../shared/agent-harness-metrics";
import { isPopulatedWorkspace } from "../harness/routing/populated-workspace-edit";
import {
  isGreenfieldWorkspace,
  planImpliesMultiFileBootstrap,
  type GreenfieldIndexSnapshot,
} from "../harness/context/workspace-greenfield";
import { reviewAgentEditProposal } from "./agent-proposal-reviewer";
import {
  AgentProposalReviewRequestSchema,
  shouldAutoReviewProposal,
  resolveAgentReviewerConfig,
  type AgentProposalReviewResult,
} from "../shared/agent-proposal-reviewer";
const AGENT_TURN_TIMEOUT_BASE_MS = 120_000;
const AGENT_TURN_TIMEOUT_PER_ROUND_MS = 45_000;
const AGENT_TURN_TIMEOUT_MAX_MS = 600_000;
const READ_ONLY_DISCOVERY_TOOLS = new Set([
  "workspace_index",
  "list_directory",
  "read_file",
  "search_workspace",
]);
const MAX_MODEL_LEN = 128;
const ABORT_USER = "gf:agent-user-cancel";
const ABORT_TIMEOUT = "gf:agent-timeout";
const ABORT_QUIT = "gf:agent-quit";

export function flushActiveAgentTurnReceiptsAsInterruptedForApp(): void {
  flushActiveAgentTurnReceiptsAsInterrupted({
    emit,
    abortTurn: (streamId) => {
      activeTurns.get(streamId)?.abort(ABORT_QUIT);
    },
  });
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
        type: z.enum(["file", "folder"]),
        path: z.string().min(1).max(4096),
        source: z.enum(["workspace", "upload"]).optional(),
        displayName: z.string().max(512).optional(),
        mediaType: z.string().max(256).optional(),
        byteSize: z
          .number()
          .int()
          .nonnegative()
          .max(20 * 1024 * 1024)
          .optional(),
      }),
    )
    .max(AGENT_CHAT_MAX_ATTACHMENTS)
    .optional(),
  pinned: z
    .array(AgentContextPinSchema)
    .max(AGENT_CONTEXT_MAX_PINS_PER_PROJECT)
    .optional(),
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
  chatMode: z.enum(["fast", "plan"]),
});

const ThreadMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().max(AGENT_CHAT_MAX_MESSAGE_CHARS),
});

const StartPayloadSchema = z.object({
  streamId: z.string().min(1).max(AGENT_CHAT_MAX_STREAM_ID_LEN),
  model: z.string().min(1).max(MAX_MODEL_LEN),
  modelIntent: z.enum(["chat_default", "planning", "execution"]).optional(),
  isApprovedPlanAutoRun: z.boolean().optional(),
  approvedPlanId: z.string().uuid().optional(),
  approvedPlanMessageId: z.string().min(1).max(256).optional(),
  userText: z.string().min(1).max(AGENT_CHAT_MAX_USER_TEXT_CHARS),
  threadSnapshot: z
    .array(ThreadMessageSchema)
    .max(AGENT_CHAT_MAX_THREAD_MESSAGES),
  activeContext: ActiveContextSchema,
});

export type CurrentProjectSnapshot = {
  projectId: string | null;
  manifest: GrokProjectManifest | null;
};

const activeTurns = new Map<string, AbortController>();
const pendingCommandApprovals = new Map<
  string,
  {
    streamId: string;
    resolve: (approved: boolean) => void;
  }
>();

let targetWindow: BrowserWindow | null = null;
let getCurrentProject: () => CurrentProjectSnapshot = () => ({
  projectId: null,
  manifest: null,
});

const httpAgentChatModelTransport = createHttpAgentChatModelTransport();
let activeAgentChatModelTransport: AgentChatModelTransport =
  httpAgentChatModelTransport;

/**
 * @internal Vitest — swap the xAI HTTP transport; returned function restores the previous transport.
 */
export function setAgentChatModelTransportForTesting(
  transport: AgentChatModelTransport | null,
): () => void {
  const prev = activeAgentChatModelTransport;
  activeAgentChatModelTransport = transport ?? httpAgentChatModelTransport;
  return () => {
    activeAgentChatModelTransport = prev;
  };
}

/**
 * @internal Vitest — override `getCurrentProject` used by the agent loop; restore with the returned function.
 */
export function setGetCurrentProjectForTesting(
  getter: () => CurrentProjectSnapshot,
): () => void {
  const prev = getCurrentProject;
  getCurrentProject = getter;
  return () => {
    getCurrentProject = prev;
  };
}

/**
 * @internal Vitest — register `streamId` with an AbortController before calling {@link runAgentTurnJobForEvaluation}.
 */
export function primeActiveAgentTurn(
  streamId: string,
  ac: AbortController = new AbortController(),
): AbortController {
  activeTurns.set(streamId, ac);
  return ac;
}

/**
 * @internal Vitest — run the same job as IPC `agent-chat-start` after {@link primeActiveAgentTurn}.
 */
export async function runAgentTurnJobForEvaluation(
  payload: AgentChatStartPayload,
): Promise<void> {
  await runTurnJob(payload);
}

function getE2eMockReply(): string | null {
  const raw = process.env["GROKFORGE_E2E_AGENT_REPLY"];
  return raw && raw.trim() ? raw : null;
}

function getE2eMockEditProposalJson(): string | null {
  const raw = process.env["GROKFORGE_E2E_EDIT_PROPOSAL_JSON"];
  return raw && raw.trim() ? raw : null;
}

function emitE2eMockEditProposalIfConfigured(
  streamId: string,
  projectId: string,
  manifest: GrokProjectManifest,
  activeContext: AgentChatStartPayload["activeContext"],
): void {
  const raw = getE2eMockEditProposalJson();
  if (!raw) return;
  let batch: z.infer<typeof AgentToolBatchPayloadSchema>;
  try {
    batch = AgentToolBatchPayloadSchema.parse(JSON.parse(raw));
  } catch (err) {
    console.warn(
      "[GrokForge agent-runner] E2E mock edit proposal JSON invalid",
      err,
    );
    return;
  }
  const sanitized = sanitizeActiveContext(manifest, projectId, activeContext);
  const batchCtx: AgentToolExecutionContext = {
    projectId,
    streamId,
    snapshotId: "00000000-0000-4000-8000-000000000000",
    toolCallId: "e2e-mock-edit",
    activityId: "e2e-mock-edit",
    agentProfileId: "default",
    harnessProfileKey: "grok_code_fast",
    sessionDepth: "parent",
    abortSignal: new AbortController().signal,
    manifest,
    roots: manifest.roots,
    activeContext: sanitized,
    readPathsThisTurn: getAgentTurnReads(streamId),
    readHashesThisTurn: getAgentTurnReadHashes(streamId),
    emitProgress: () => {},
    recordPathRead: () => {},
    askCommandApproval: async () => false,
  };
  const result = validateAgentEditProposal(batch, batchCtx);
  if (result.ok) {
    clearAgentTurnReads(streamId);
    emit({ streamId, phase: "edit_proposal", proposal: result.proposal });
  } else {
    console.warn(
      "[GrokForge agent-runner] E2E mock edit proposal rejected",
      result.error,
    );
  }
}

function isDevMode(): boolean {
  return process.env.NODE_ENV === "development";
}

function logTurnRoutingIfDev(
  payload: AgentChatStartPayload,
  routing: ReturnType<typeof resolveAgentTurnRouting>,
  harnessProfile: Readonly<AgentHarnessProfile>,
  agentProfile: Readonly<AgentProfile>,
  allowedToolNames: readonly string[],
): void {
  if (!isDevMode()) return;
  const rendererModel = payload.model.trim();
  const meta = {
    ...routing,
    harnessProfileDisplayName: harnessProfile.displayName,
    agentProfileDisplayName: agentProfile.displayName,
    reasoningTracePolicy: harnessProfile.reasoningTracePolicy,
    allowedTools: allowedToolNames,
  };
  if (rendererModel !== routing.modelId) {
    console.debug(
      "[GrokForge agent-runner] renderer model hint differs from canonical API model",
      {
        rendererModel,
        canonicalModelId: routing.modelId,
        ...meta,
      },
    );
  } else {
    console.debug(
      "[GrokForge agent-runner] turn routing (canonical API model)",
      meta,
    );
  }
}

export function setAgentChatTargetWindow(win: BrowserWindow | null): void {
  targetWindow = win;
}

function emit(payload: AgentChatEventPayload): void {
  targetWindow?.webContents.send("agent-chat-event", payload);
}

function activityId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function emitActivity(
  streamId: string,
  activity: Omit<
    AgentChatEventPayload & { phase: "activity" },
    "streamId" | "phase"
  >["activity"],
): void {
  const receiptStatus =
    activity.status === "awaiting_approval"
      ? "running"
      : activity.status === "rejected" || activity.status === "timeout"
        ? "error"
        : activity.status;
  trackTurnReceiptActivity(streamId, receiptStatus);
  emit({ streamId, phase: "activity", activity });
}

function summarizePlanForReview(
  plan: StoredPlanArtifact | null,
): string | undefined {
  if (!plan) return undefined;
  const steps = plan.plan.steps
    .map((step) => `- ${step.id}: ${step.title}`)
    .join("\n");
  return [
    `Plan summary: ${plan.plan.summary}`,
    plan.plan.filesLikelyTouched.length > 0
      ? `Files likely touched: ${plan.plan.filesLikelyTouched.join(", ")}`
      : "",
    steps ? `Steps:\n${steps}` : "",
    plan.plan.verification ? `Verification: ${plan.plan.verification}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function emitHarnessInterventionActivity(
  streamId: string,
  id: string,
  key: HarnessInterventionKey,
  options?: { conflict?: ScaffoldConflictKind | null; recovered?: boolean },
): void {
  const copy = harnessInterventionActivityCopy({
    key,
    conflict: options?.conflict,
    recovered: options?.recovered,
  });
  emitActivity(streamId, {
    id,
    title: copy.title,
    detail: copy.detail,
    status: "done",
    harnessKind: copy.kind,
  });
}

function emitEditToolBudgetExhaustedActivity(
  streamId: string,
  searchReplaceFailuresByPath: ReadonlyMap<string, number>,
  options: { escalationIssued?: boolean; postEscalationStall?: boolean },
): void {
  const totalFailures = totalSearchReplaceFailures(searchReplaceFailuresByPath);
  if (totalFailures === 0) return;
  const copy = editToolBudgetExhaustedActivityCopy({
    totalFailures,
    topFailurePathBasename: topSearchReplaceFailurePathBasename(
      searchReplaceFailuresByPath,
    ),
    escalationIssued: options.escalationIssued,
    postEscalationStall: options.postEscalationStall,
  });
  emitActivity(streamId, {
    id: activityId(),
    title: copy.title,
    detail: copy.detail,
    status: "done",
    harnessKind: copy.kind,
  });
}

function setMaxIterationsReasonOnScratch(
  scratch: TurnTraceScratch | null | undefined,
  input: Omit<
    Parameters<typeof resolveMaxIterationsReason>[0],
    "blockedBeforeForceFinalThreshold"
  > & {
    blockedBeforeForceFinalThreshold?: number;
  },
): MaxIterationsReason | undefined {
  const reason = resolveMaxIterationsReason({
    blockedBeforeForceFinalThreshold:
      ITERATIVE_SEARCH_REPLACE_BLOCKED_BEFORE_FORCE_FINAL,
    ...input,
  });
  if (reason && scratch?.harnessMetricsScratch) {
    scratch.harnessMetricsScratch.maxIterationsReason = reason;
  }
  return reason;
}

async function providerSampleFromSnapshot(
  snapshot: ReturnType<typeof buildTurnSnapshot>,
  signal: AbortSignal,
): Promise<{ content: string; toolCalls: AgentModelToolCall[] }> {
  return activeAgentChatModelTransport.sampleChatCompletion(
    providerRequestFromSnapshot(snapshot),
    signal,
  );
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
      onFinalChunk?.(delta);
      emit({ streamId, phase: "final_chunk", delta });
    },
  );
}

function toGreenfieldIndexSnapshot(
  index: StoredWorkspaceIndex,
): GreenfieldIndexSnapshot {
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
  };
}

function buildInitialMessages(
  manifest: GrokProjectManifest,
  projectId: string,
  payload: AgentChatStartPayload,
  retrievedContext: string,
  harnessProfileKey: HarnessProfileKey,
  harnessCtx: HarnessPromptTurnContext,
  postPlanArtifact: StoredPlanArtifact | null = null,
  options?: { threadSnapshotLimit?: number; threadFocusNote?: boolean },
): AgentModelChatMessage[] {
  const profile = getHarnessProfile(harnessProfileKey);
  const { systemPrompt } = buildChatSystemPrompt(manifest, {
    harnessProfileKey,
    harnessPromptTurnContext: harnessCtx,
  });
  const activeContext = buildActiveContextBlock(
    payload.activeContext,
    manifest,
    projectId,
  );
  const threadMemory = formatThreadMemoryBlock(loadThreadMemory(projectId));
  const memoryBlock =
    threadMemory.trim().length > 0
      ? threadMemory.length <= AGENT_CONTEXT_BUDGETS.threadMemoryMaxChars
        ? threadMemory
        : `${threadMemory.slice(0, AGENT_CONTEXT_BUDGETS.threadMemoryMaxChars)}\n[...thread memory truncated...]`
      : "";
  const dynamicContext = [
    activeContext,
    memoryBlock,
    retrievedContext.trim()
      ? `## Relevant workspace context\n${retrievedContext}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const threadLimit = options?.threadSnapshotLimit ?? 40;
  const prior = payload.threadSnapshot
    .filter((m) => m.content.trim())
    .slice(-threadLimit)
    .map((m): AgentModelChatMessage => {
      if (m.role === "system") {
        return { role: "system", content: m.content };
      }
      return { role: m.role, content: m.content };
    });
  const planModeBlock =
    payload.activeContext.chatMode === "plan"
      ? `\n${buildGfPlanToolLoopBlock({ forbiddenLegacyFenceTag: AGENT_TOOL_FENCE_INFO })}`
      : "";
  const recoveryBlock = consumeTurnRecoveryHint(projectId) ?? "";
  const threadFocusNote = options?.threadFocusNote
    ? "Older thread turns were omitted for focus on this edit — use tools for current file state on disk."
    : "";
  let approvedPlanBlock = "";
  if (payload.isApprovedPlanAutoRun && payload.approvedPlanId) {
    const artifact = loadPlanArtifact(projectId, payload.approvedPlanId);
    if (artifact) {
      approvedPlanBlock = buildApprovedPlanSystemInjection(
        artifact,
        planJsonPath(projectId, payload.approvedPlanId),
      );
    }
  } else if (harnessCtx.postPlanIncremental && postPlanArtifact) {
    approvedPlanBlock = buildApprovedPlanSystemInjection(
      postPlanArtifact,
      planJsonPath(projectId, postPlanArtifact.planId),
    );
  }
  return [
    {
      role: "system",
      content: [
        systemPrompt,
        "",
        "## Agent tool loop",
        ...buildAgentToolLoopSharedSections(harnessCtx),
        ...buildAgentToolLoopProfileSections(profile, harnessCtx),
        planModeBlock,
        approvedPlanBlock,
        recoveryBlock,
        threadFocusNote,
        dynamicContext,
      ]
        .filter(Boolean)
        .join("\n"),
    },
    ...prior,
    { role: "user", content: payload.userText },
  ];
}

function finalAnswerContract(
  userText: string,
  editProposalCreated: boolean,
  editProposalComposedInTurn: boolean,
  chatMode: "fast" | "plan",
  harnessProfileKey: HarnessProfileKey,
  agentProfileId: AgentProfileId,
  harnessCtx: HarnessPromptTurnContext,
  turnProposalAccum: AgentEditProposalPayload | null,
  commandToolsFailed: boolean,
  scaffoldStrategyConflictIssued: boolean,
  scaffoldStrategyRecovered: boolean,
  scaffoldStrategy: ScaffoldStrategy | null,
  searchReplaceEscalationRecovered: boolean,
  postScaffoldVerificationIncomplete: boolean,
  postScaffoldMissingPaths: readonly string[],
  searchReplaceFailuresByPath: ReadonlyMap<string, number>,
  incompleteHtmlFailuresByPath: ReadonlyMap<string, number>,
  proposalRejectionsByPath: ReadonlyMap<string, number>,
  creationIncrementalRecoveryIssued: boolean,
  creationRecoveryEnforcedPaths: ReadonlySet<string>,
  creationScaffoldAcceptedPaths: ReadonlySet<string>,
): AgentModelChatMessage {
  const scaffoldRecoveredForContract =
    scaffoldStrategyRecovered &&
    editProposalCreated &&
    (scaffoldStrategy === "file_bootstrap" || !commandToolsFailed);
  const srEscalationRecoveredForContract =
    searchReplaceEscalationRecovered && editProposalCreated;
  const editHonesty = resolveEditFinalAnswerHonestyContext({
    userText,
    editProposalCreated,
    executeFromApprovedPlan: harnessCtx.executeFromApprovedPlan,
    searchReplaceFailuresByPath,
    incompleteHtmlFailuresByPath,
    proposalRejectionsByPath,
  });

  return {
    role: "system",
    content: buildFinalAnswerContract({
      userText,
      editProposalCreated,
      editAttemptOutcome: editHonesty.editAttemptOutcome,
      failedEditPaths: editHonesty.failedEditPaths,
      editToolsFailed: editHonesty.editToolsFailed,
      editProposalComposedInTurn,
      chatMode,
      profileKey: harnessProfileKey,
      agentProfileId,
      executeFromApprovedPlan: harnessCtx.executeFromApprovedPlan,
      postPlanIncremental: harnessCtx.postPlanIncremental,
      iterativeWorkEdit: harnessCtx.iterativeWorkEdit,
      greenfieldWorkspace: harnessCtx.greenfieldWorkspace,
      partialBatchRejections: turnProposalAccum?.rejected,
      commandToolsFailed,
      scaffoldStrategyConflictIssued,
      scaffoldStrategyRecovered: scaffoldRecoveredForContract,
      scaffoldStrategy,
      searchReplaceEscalationRecovered: srEscalationRecoveredForContract,
      postScaffoldVerificationIncomplete,
      postScaffoldMissingPaths,
      creationIncrementalRecoveryIssued,
      creationRecoveryUnmetPaths: creationRecoveryUnmetPathLabels({
        creationRecoveryEnforcedPaths,
        creationScaffoldAcceptedPaths,
      }),
    }),
  };
}

function resolveCommandIntentText(
  userText: string,
  executeFromApprovedPlan: boolean,
  approvedPlanId: string | undefined,
  projectId: string,
  options?: {
    greenfieldWorkspace?: boolean;
    scaffoldStrategy?: ScaffoldStrategy | null;
    singleFileHtmlIntent?: boolean;
  },
): {
  commandIntent: boolean;
  verificationHint?: string;
  suggestedCommands: readonly string[];
} {
  const parts: string[] = [];
  const skipUserTextCommandIntent =
    options?.singleFileHtmlIntent === true &&
    !verificationHasCommandLikeToken(userText) &&
    !impliesCommandExecution(userText);
  if (!skipUserTextCommandIntent && impliesCommandExecution(userText))
    parts.push(userText);

  let suggestedCommands: readonly string[] = [];
  if (executeFromApprovedPlan && approvedPlanId) {
    const artifact = loadPlanArtifact(projectId, approvedPlanId);
    const plan = artifact?.plan ?? null;
    if (plan?.verification && impliesCommandExecution(plan.verification)) {
      parts.push(plan.verification);
    }
    for (const step of plan?.steps ?? []) {
      if (impliesCommandExecution(step.title)) parts.push(step.title);
    }
    if (plan && options?.greenfieldWorkspace) {
      const strategy = options.scaffoldStrategy ?? null;
      const suggestions = suggestVerificationCommands(plan, strategy);
      suggestedCommands = suggestions.map((s) => s.command);
      if (planNeedsVerificationCommand(plan, strategy)) {
        const hint = resolveVerificationHint(plan, suggestions);
        if (hint && !parts.includes(hint)) parts.push(hint);
      }
    }
  }

  return {
    commandIntent: parts.length > 0,
    verificationHint: parts[0],
    suggestedCommands,
  };
}

function computeCommandToolsFailed(input: {
  commandIntent: boolean;
  commandToolSucceeded: boolean;
  commandToolFailed: boolean;
  planVerifyCommandNudgeIssued: boolean;
}): boolean {
  if (!input.commandIntent || input.commandToolSucceeded) return false;
  return input.commandToolFailed || input.planVerifyCommandNudgeIssued;
}

function resolvePostPlanRoutingInput(
  projectId: string,
  payload: AgentChatStartPayload,
): { postPlanIncremental: boolean; completedPlan: StoredPlanArtifact | null } {
  const completedPlan = findLatestCompletedPlanArtifact(projectId);
  const postPlanIncremental =
    !isExplicitComposerModelIntent(payload.modelIntent) &&
    shouldRoutePostPlanIncremental({
      chatMode: payload.activeContext.chatMode,
      isApprovedPlanAutoRun: payload.isApprovedPlanAutoRun,
      hasCompletedPlan: completedPlan != null,
      userText: payload.userText,
    });
  return { postPlanIncremental, completedPlan };
}

function resolveMaxToolIterationsForTurn(
  payload: AgentChatStartPayload,
  agentProfile: AgentProfile,
): number {
  if (payload.isApprovedPlanAutoRun === true) {
    return Math.min(
      AGENT_TOOL_MAX_ITERATIONS,
      APPROVED_PLAN_EXECUTE_MAX_TOOL_ROUNDS,
    );
  }
  if (agentProfile.maxToolRounds !== undefined) {
    return Math.min(AGENT_TOOL_MAX_ITERATIONS, agentProfile.maxToolRounds);
  }
  return AGENT_TOOL_MAX_ITERATIONS;
}

/** Adaptive turn budget — room for multi-round tool_sample without always hitting 5m (story 129). */
export function resolveAgentTurnTimeoutMs(maxToolIterations: number): number {
  return Math.min(
    AGENT_TURN_TIMEOUT_MAX_MS,
    AGENT_TURN_TIMEOUT_BASE_MS +
      maxToolIterations * AGENT_TURN_TIMEOUT_PER_ROUND_MS,
  );
}

type AgentTurnProgress = {
  editProposalCreated: boolean;
};

function isRegularFileOnDisk(resolvedPath: string): boolean {
  try {
    return existsSync(resolvedPath) && statSync(resolvedPath).isFile();
  } catch {
    return false;
  }
}

function parseEditToolArguments(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function recordProposalRejectionsFromEditToolFailure(
  proposalRejectionsByPath: Map<string, number>,
  resolveProposalPath: (path: string) => string | null,
  rejected: readonly { path?: string }[],
  rawToolArgs: unknown,
  detail?: string,
  agentTurn?: AgentTurn,
): void {
  let recorded = false;
  for (const r of rejected) {
    if (!r.path) continue;
    const resolved = resolveProposalPath(r.path);
    if (!resolved) continue;
    recordProposalRejection(proposalRejectionsByPath, resolved);
    agentTurn?.recordProposalRejection(resolved);
    recorded = true;
  }
  if (recorded) return;
  if (typeof detail === "string") {
    const pathMatch = detail.match(/^([^:]+):/);
    if (pathMatch?.[1]) {
      const resolved = resolveProposalPath(pathMatch[1].trim());
      if (resolved) {
        recordProposalRejection(proposalRejectionsByPath, resolved);
        agentTurn?.recordProposalRejection(resolved);
        return;
      }
    }
  }
  for (const path of extractPathsFromEditToolArguments(rawToolArgs)) {
    const resolved = resolveProposalPath(path);
    if (!resolved) continue;
    recordProposalRejection(proposalRejectionsByPath, resolved);
    agentTurn?.recordProposalRejection(resolved);
  }
}

function shouldForceFinalForRepeatedProposalRejectionsOnTurn(input: {
  isPlanMode: boolean;
  editProposalCreated: boolean;
  canProposeEdits: boolean;
  userText: string;
  executeFromApprovedPlan: boolean;
  proposalRejectionsByPath: ReadonlyMap<string, number>;
}): boolean {
  if (input.isPlanMode || input.editProposalCreated || !input.canProposeEdits)
    return false;
  const editIntent =
    input.executeFromApprovedPlan || isLikelyEditIntent(input.userText);
  if (!editIntent) return false;
  return shouldForceFinalForRepeatedProposalRejections({
    editProposalCreated: input.editProposalCreated,
    rejectionsByPath: input.proposalRejectionsByPath,
  });
}

function shouldForceFinalForRepeatedEditFailures(input: {
  isPlanMode: boolean;
  editProposalCreated: boolean;
  canProposeEdits: boolean;
  userText: string;
  executeFromApprovedPlan: boolean;
  searchReplaceFailuresByPath: ReadonlyMap<string, number>;
  incompleteHtmlFailuresByPath: ReadonlyMap<string, number>;
  searchReplaceEscalationNudgeIssued: boolean;
  incompleteHtmlNudgeIssued: boolean;
  postEscalationToolRounds: number;
  iterativeWorkEdit?: boolean;
  searchReplaceBlockedAfterEscalationCount?: number;
}): boolean {
  if (input.isPlanMode || input.editProposalCreated || !input.canProposeEdits)
    return false;
  const editIntent =
    input.executeFromApprovedPlan || isLikelyEditIntent(input.userText);
  if (!editIntent) return false;
  const srOpts = { iterativeWorkEdit: input.iterativeWorkEdit === true };
  const maxSrFailures = resolveSearchReplaceMaxFailuresPerTurn(srOpts);
  const maxPostEscalationRounds = resolvePostEscalationMaxToolRounds(srOpts);
  if (
    input.iterativeWorkEdit === true &&
    (input.searchReplaceBlockedAfterEscalationCount ?? 0) >=
      ITERATIVE_SEARCH_REPLACE_BLOCKED_BEFORE_FORCE_FINAL
  ) {
    return true;
  }
  return (
    totalSearchReplaceFailures(input.searchReplaceFailuresByPath) >=
      maxSrFailures ||
    totalIncompleteHtmlFailures(input.incompleteHtmlFailuresByPath) >=
      INCOMPLETE_HTML_MAX_FAILURES_PER_TURN_BEFORE_FORCE_FINAL ||
    ((input.searchReplaceEscalationNudgeIssued ||
      input.incompleteHtmlNudgeIssued) &&
      input.postEscalationToolRounds >= maxPostEscalationRounds)
  );
}

function buildMaxToolIterationsHint(input: {
  isPlanMode: boolean;
  userText: string;
  editProposalCreated: boolean;
  searchReplaceFailuresByPath: ReadonlyMap<string, number>;
  incompleteHtmlFailuresByPath: ReadonlyMap<string, number>;
  proposalRejectionsByPath: ReadonlyMap<string, number>;
  executeFromApprovedPlan: boolean;
  iterativeWorkEdit?: boolean;
}): string {
  const editHonesty = !input.isPlanMode
    ? resolveEditFinalAnswerHonestyContext({
        userText: input.userText,
        editProposalCreated: input.editProposalCreated,
        executeFromApprovedPlan: input.executeFromApprovedPlan,
        searchReplaceFailuresByPath: input.searchReplaceFailuresByPath,
        incompleteHtmlFailuresByPath: input.incompleteHtmlFailuresByPath,
        proposalRejectionsByPath: input.proposalRejectionsByPath,
      })
    : null;
  if (editHonesty?.editToolsFailed) {
    const htmlFailures = totalIncompleteHtmlFailures(
      input.incompleteHtmlFailuresByPath,
    );
    const htmlNote =
      htmlFailures > 0
        ? " Incomplete HTML proposals were rejected — emit one full document with closing tags in a single propose_file_edits call."
        : "";
    return [
      "GrokForge reached the maximum tool iterations for this turn.",
      `Edit tools did not succeed (no reviewable edit proposal was created).${htmlNote}`,
      "Summarize what you attempted in a **short** honest message; do not claim any workspace file was updated, saved, or written on disk.",
      "Do **not** paste a full replacement file in the final answer.",
      "Tell the user what failed and that they can retry with clean `propose_file_edits` from `read_file` rawContent or edit manually in a new turn.",
    ].join(" ");
  }
  if (input.isPlanMode) {
    return `GrokForge reached the plan-mode tool step limit. Provide your final answer with ${GF_PLAN_FENCE_NUDGE_PHRASE} from the context gathered so far.`;
  }
  return "GrokForge reached the maximum read/search tool iterations for this turn. Provide the best grounded answer you can from the gathered context, and say what you could not verify.";
}

function isAllowedToolName(name: string): name is AgentChatToolName {
  return (
    name === "workspace_index" ||
    name === "list_directory" ||
    name === "read_file" ||
    name === "search_workspace" ||
    name === "search_replace" ||
    name === "edit" ||
    name === "run_command" ||
    name === "propose_file_edits" ||
    name === "spawn_subagent"
  );
}

function sanitizeActiveContext(
  manifest: GrokProjectManifest,
  projectId: string,
  activeContext: AgentChatStartPayload["activeContext"],
): AgentChatStartPayload["activeContext"] {
  const selection = activeContext.editorSelection;
  const selectionPath = selection ? resolve(selection.path) : null;
  const safeSelection =
    selection &&
    selectionPath &&
    isPathWithinWorkspaceRoots(selectionPath, manifest.roots) &&
    !shouldIgnoreFsEntry(
      selectionPath,
      manifest.roots,
      manifest.ignore ?? [],
    ) &&
    !isLikelySensitivePath(selectionPath)
      ? { ...selection, path: selectionPath }
      : null;
  return {
    ...activeContext,
    editorSelection: safeSelection,
    attachments: sanitizeAttachmentsForTurn(
      manifest,
      projectId,
      activeContext.attachments,
    ),
  };
}

let commandApprovalAutoResponder: ((requestId: string) => boolean) | null =
  null;

/**
 * @internal Vitest — auto-approve/reject model commands without IPC (story 126 eval).
 */
export function setCommandApprovalAutoResponderForTesting(
  responder: ((requestId: string) => boolean) | null,
): () => void {
  const prev = commandApprovalAutoResponder;
  commandApprovalAutoResponder = responder;
  return () => {
    commandApprovalAutoResponder = prev;
  };
}

async function waitForCommandApproval(
  requestId: string,
  streamId: string,
  signal: AbortSignal,
): Promise<boolean> {
  if (signal.aborted) throw signal.reason;
  if (commandApprovalAutoResponder) {
    return commandApprovalAutoResponder(requestId);
  }
  return new Promise((resolvePromise, reject) => {
    const cleanup = () => {
      signal.removeEventListener("abort", onAbort);
      pendingCommandApprovals.delete(requestId);
    };
    const onAbort = () => {
      cleanup();
      reject(signal.reason);
    };
    pendingCommandApprovals.set(requestId, {
      streamId,
      resolve: (approved) => {
        cleanup();
        resolvePromise(approved);
      },
    });
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function runAgentTurn(
  payload: AgentChatStartPayload,
  ac: AbortController,
  scratch: TurnTraceScratch | null,
  turnProgress: AgentTurnProgress,
): Promise<void> {
  const snapshot = getCurrentProject();
  const manifest = snapshot.manifest;
  const projectId = snapshot.projectId;
  if (!manifest || !projectId) {
    emit({
      streamId: payload.streamId,
      phase: "error",
      error: "No project loaded",
    });
    throw new Error("No project loaded");
  }

  if (isMinimalHarnessEnabled()) {
    await runMinimalAgentTurn(
      {
        emit,
        emitActivity,
        newActivityId: activityId,
        getE2eMockReply,
      },
      payload,
      manifest,
      projectId,
      ac,
    );
    return;
  }

  const { postPlanIncremental, completedPlan } = resolvePostPlanRoutingInput(
    projectId,
    payload,
  );
  const storedIndexForRouting = loadWorkspaceIndex(projectId);
  const greenfieldIndexForRouting = storedIndexForRouting
    ? toGreenfieldIndexSnapshot(storedIndexForRouting)
    : null;
  const iterativeWorkEdit =
    !isExplicitComposerModelIntent(payload.modelIntent) &&
    shouldRouteIterativeWorkExecutor({
      chatMode: payload.activeContext.chatMode,
      isApprovedPlanAutoRun: payload.isApprovedPlanAutoRun,
      postPlanIncremental,
      userText: payload.userText,
      index: greenfieldIndexForRouting,
    });
  const routing = resolveAgentTurnRouting(manifest, {
    modelIntent: payload.modelIntent,
    activeContext: payload.activeContext,
    isApprovedPlanAutoRun: payload.isApprovedPlanAutoRun,
    postPlanIncremental,
    iterativeWorkEdit,
  });
  const harnessProfile = getHarnessProfile(routing.harnessProfileKey);
  const agentProfile = getAgentProfile(routing.agentProfileId);
  const incrementalEditEnforcement = iterativeWorkEdit || postPlanIncremental;
  const turnToolDefinitions = buildToolDefinitionsForTurn({
    agentProfileId: routing.agentProfileId,
    toolDescriptionOverrides: harnessProfile.toolDescriptionOverrides,
  });
  logTurnRoutingIfDev(
    payload,
    routing,
    harnessProfile,
    agentProfile,
    turnToolDefinitions.map((d) => d.function.name),
  );
  emit({ streamId: payload.streamId, phase: "turn_started", routing });
  beginTurnReceipt(projectId, payload.streamId, routing);
  clearAgentTurnReads(payload.streamId);
  const safePayload: AgentChatStartPayload = {
    ...payload,
    activeContext: sanitizeActiveContext(
      manifest,
      projectId,
      payload.activeContext,
    ),
  };

  const mockReply = getE2eMockReply();
  if (mockReply) {
    if (scratch) {
      const retrievalSnapMock: AgentRetrievalDebugSnapshot = {
        generatedAt: new Date().toISOString(),
        userTextPreview: safePayload.userText.slice(0, 500),
        files: [],
        stale: false,
        skipped: {
          ignored: 0,
          generated: 0,
          binary: 0,
          sensitive: 0,
          large: 0,
        },
        warnings: ["E2E mock: lexical retrieval skipped"],
      };
      applyRetrievalToScratch(scratch, retrievalSnapMock);
      setRetrievalDetailLines(scratch, [
        "E2E mock — lexical retrieval skipped",
      ]);
      setRetrievalContextBodyChars(scratch, 0);
    }
    const id = activityId();
    emitActivity(payload.streamId, {
      id,
      tool: "retrieval",
      title: "Using E2E mock agent reply",
      status: "running",
    });
    emitActivity(payload.streamId, {
      id,
      tool: "retrieval",
      title: "E2E mock agent reply ready",
      status: "done",
    });
    for (let i = 0; i < mockReply.length; i += 80) {
      if (ac.signal.aborted) throw ac.signal.reason;
      const chunk = mockReply.slice(i, i + 80);
      if (scratch) scratch.assistantStreamChars += chunk.length;
      emit({ streamId: payload.streamId, phase: "final_chunk", delta: chunk });
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    emitE2eMockEditProposalIfConfigured(
      payload.streamId,
      projectId,
      manifest,
      safePayload.activeContext,
    );
    emit({
      streamId: payload.streamId,
      phase: "activity_clear_running",
      reason: "done",
    });
    finalizeTurnReceipt(payload.streamId, "completed");
    emit({ streamId: payload.streamId, phase: "done" });
    return;
  }

  const retrievalActivityId = activityId();
  emitActivity(payload.streamId, {
    id: retrievalActivityId,
    tool: "retrieval",
    title: "Finding relevant workspace context",
    status: "running",
  });
  const retrieval = buildLexicalRetrievalContext(
    {
      projectId,
      manifest,
      activeContext: safePayload.activeContext,
      abortSignal: ac.signal,
    },
    safePayload.userText,
  );
  const retrievalSnap: AgentRetrievalDebugSnapshot = {
    generatedAt: new Date().toISOString(),
    userTextPreview: safePayload.userText.slice(0, 500),
    files: retrieval.retrieved,
    stale: retrieval.stale,
    staleReason: retrieval.staleReason,
    skipped: retrieval.skipped,
    warnings: [
      retrieval.stale
        ? `Stale index: ${retrieval.staleReason ?? "refresh recommended"}`
        : "",
      retrieval.skipped.sensitive > 0
        ? `${retrieval.skipped.sensitive} sensitive file(s) excluded`
        : "",
    ].filter(Boolean),
  };
  recordAgentRetrievalDebug(retrievalSnap);
  if (scratch) {
    applyRetrievalToScratch(scratch, retrievalSnap);
    setRetrievalDetailLines(scratch, retrieval.details);
    setRetrievalContextBodyChars(scratch, retrieval.context.length);
  }
  const storedIndex = loadWorkspaceIndex(projectId);
  const greenfieldIndex = storedIndex
    ? toGreenfieldIndexSnapshot(storedIndex)
    : null;
  const greenfield = isGreenfieldWorkspace({
    index: greenfieldIndex,
    retrievalMatchCount: retrieval.retrieved.length,
  });
  const retrievalActivityCopy = formatRetrievalActivityCopy({
    count: retrieval.count,
    greenfieldWorkspace: greenfield,
    details: retrieval.details,
    stale: retrieval.stale,
    staleReason: retrieval.staleReason,
    sensitiveSkipped: retrieval.skipped.sensitive,
  });
  emitActivity(payload.streamId, {
    id: retrievalActivityId,
    tool: "retrieval",
    title: retrievalActivityCopy.title,
    detail: retrievalActivityCopy.detail,
    status: "done",
  });
  const singleFilePrimaryRaw = isSingleFilePrimaryWorkspace(greenfieldIndex);
  const primaryFile = primaryNonTrivialFile(greenfieldIndex);
  let singleFilePrimary = singleFilePrimaryRaw;
  let resolvedScaffoldStrategy: ScaffoldStrategy | null = null;
  let scaffoldExpectedTemplate: ViteTemplateId | null = null;
  let approvedPlanForScaffold: StoredPlanArtifact | null = null;
  if (
    greenfield &&
    safePayload.isApprovedPlanAutoRun === true &&
    safePayload.approvedPlanId &&
    !postPlanIncremental
  ) {
    approvedPlanForScaffold = loadPlanArtifact(
      projectId,
      safePayload.approvedPlanId,
    );
    if (
      approvedPlanForScaffold &&
      planImpliesMultiFileBootstrap(approvedPlanForScaffold.plan)
    ) {
      singleFilePrimary = false;
    }
    resolvedScaffoldStrategy = resolveScaffoldStrategy({
      greenfieldWorkspace: greenfield,
      executeFromApprovedPlan: true,
      postPlanIncremental,
      plan: approvedPlanForScaffold?.plan ?? null,
      userText: safePayload.userText,
    });
    scaffoldExpectedTemplate =
      inferViteTemplateFromPlan(approvedPlanForScaffold?.plan ?? null) ??
      inferViteTemplateFromText(safePayload.userText);
  } else if (
    greenfield &&
    safePayload.isApprovedPlanAutoRun === true &&
    safePayload.approvedPlanId
  ) {
    approvedPlanForScaffold = loadPlanArtifact(
      projectId,
      safePayload.approvedPlanId,
    );
    if (
      approvedPlanForScaffold &&
      planImpliesMultiFileBootstrap(approvedPlanForScaffold.plan)
    ) {
      singleFilePrimary = false;
    }
  } else if (
    greenfield &&
    !postPlanIncremental &&
    safePayload.activeContext.chatMode === "fast" &&
    safePayload.isApprovedPlanAutoRun !== true &&
    isLikelyEditIntent(safePayload.userText)
  ) {
    resolvedScaffoldStrategy = resolveScaffoldStrategy({
      greenfieldWorkspace: greenfield,
      executeFromApprovedPlan: false,
      postPlanIncremental,
      userText: safePayload.userText,
    });
  }
  const singleFileHtmlIntent = userRequestsSingleFileHtml({
    userText: safePayload.userText,
    plan: approvedPlanForScaffold?.plan ?? null,
  });
  const isPlanMode = safePayload.activeContext.chatMode === "plan";
  const executeFromApprovedPlan = safePayload.isApprovedPlanAutoRun === true;

  const greenfieldWorkBootstrap =
    greenfield &&
    safePayload.activeContext.chatMode === "fast" &&
    !executeFromApprovedPlan &&
    !postPlanIncremental &&
    isLikelyEditIntent(safePayload.userText);

  const iterativeEditScope: IterativeEditScope | undefined =
    incrementalEditEnforcement && !executeFromApprovedPlan
      ? resolveIterativeEditScope({
          userText: safePayload.userText,
          activeFilePath: safePayload.activeContext.activeFilePath ?? null,
        })
      : undefined;

  const harnessCtx: HarnessPromptTurnContext = {
    greenfieldWorkspace: greenfield,
    executeFromApprovedPlan: safePayload.isApprovedPlanAutoRun === true,
    postPlanIncremental,
    iterativeWorkEdit,
    populatedWorkspace: isPopulatedWorkspace(greenfieldIndexForRouting),
    activeFilePath: safePayload.activeContext.activeFilePath ?? null,
    iterativeEditScope,
    singleFilePrimary,
    singleFilePrimaryBasename: primaryFile?.basename,
    scaffoldStrategy: resolvedScaffoldStrategy,
    viteTemplateHint: scaffoldExpectedTemplate,
    greenfieldWorkBootstrap,
  };

  if (scratch) {
    scratch.harnessMetricsScratch = createHarnessMetricsScratch({
      iterativeWorkEdit: harnessCtx.iterativeWorkEdit === true,
      postPlanIncremental,
      resolvedEditScope: iterativeEditScope?.kind,
    });
  }

  const {
    commandIntent,
    verificationHint,
    suggestedCommands: verificationSuggestedCommands,
  } = resolveCommandIntentText(
    safePayload.userText,
    executeFromApprovedPlan,
    safePayload.approvedPlanId,
    projectId,
    {
      greenfieldWorkspace: greenfield,
      scaffoldStrategy: resolvedScaffoldStrategy,
      singleFileHtmlIntent,
    },
  );

  const threadTrimForIterativeEdit =
    incrementalEditEnforcement &&
    safePayload.activeContext.chatMode === "fast" &&
    isLikelyEditIntent(safePayload.userText);

  const messages = buildInitialMessages(
    manifest,
    projectId,
    safePayload,
    retrieval.context,
    routing.harnessProfileKey,
    harnessCtx,
    postPlanIncremental ? completedPlan : null,
    threadTrimForIterativeEdit
      ? { threadSnapshotLimit: 24, threadFocusNote: true }
      : undefined,
  );
  pruneStaleAgentOffloads(projectId);

  const reviewerConfig = resolveAgentReviewerConfig(manifest.reviewer);
  const reviewPlanArtifact = safePayload.approvedPlanId
    ? loadPlanArtifact(projectId, safePayload.approvedPlanId)
    : completedPlan;
  const reviewPlanSummary = summarizePlanForReview(reviewPlanArtifact);
  const reviewProposalForTurn = async (
    proposal: AgentEditProposalPayload,
  ): Promise<AgentEditProposalPayload> => {
    if (
      !shouldAutoReviewProposal({
        config: reviewerConfig,
        proposal,
        chatMode: safePayload.activeContext.chatMode,
      })
    ) {
      return proposal;
    }
    const id = activityId();
    emitActivity(payload.streamId, {
      id,
      title: "Reviewing edit proposal",
      detail: `Reviewer model: ${reviewerConfig.model}`,
      status: "running",
    });
    const result = await reviewAgentEditProposal({
      manifest,
      proposal,
      transport: activeAgentChatModelTransport,
      abortSignal: ac.signal,
      userText: safePayload.userText,
      planSummary: reviewPlanSummary,
      modelOverride: reviewerConfig.model,
    });
    if (!result.ok) {
      emitActivity(payload.streamId, {
        id,
        title: "Reviewer unavailable",
        detail: result.error,
        status: "error",
      });
      return proposal;
    }
    emitActivity(payload.streamId, {
      id,
      title:
        result.review.overallVerdict === "pass"
          ? "Reviewer passed proposal"
          : "Reviewer flagged proposal",
      detail: `${result.review.overallVerdict.replace("_", " ")} · ${result.review.summary}`,
      status: result.review.overallVerdict === "pass" ? "done" : "rejected",
      harnessKind:
        result.review.overallVerdict === "pass" ? "info" : "correction",
    });
    return { ...proposal, review: result.review };
  };
  const reviewEditProposalForTurn = reviewerConfig.autoReviewEdits
    ? reviewProposalForTurn
    : undefined;

  let totalToolChars = 0;
  let editProposalCreated = false;
  let editProposalComposedInTurn = false;
  let turnProposalAccum: AgentEditProposalPayload | null = null;
  const searchReplaceFailuresByPath = new Map<string, number>();
  const incompleteHtmlFailuresByPath = new Map<string, number>();
  const crushedJavaScriptFailuresByPath = new Map<string, number>();
  const creationIntegrityFailuresByPath = new Map<string, number>();
  const proposalRejectionsByPath = new Map<string, number>();
  let creationIncrementalRecoveryIssued = false;
  const creationRecoveryEnforcedPaths = new Set<string>();
  const creationScaffoldAcceptedPaths = new Set<string>();

  // New: explicit per-turn state holder (step toward Pi-style lifecycle clarity)
  const agentTurn = new AgentTurn();

  const onFinalChunk = scratch
    ? (delta: string) => {
        scratch.assistantStreamChars += delta.length;
      }
    : undefined;

  const maxToolIterations = resolveIncrementalMaxToolIterations(
    resolveMaxToolIterationsForTurn(safePayload, agentProfile),
    incrementalEditEnforcement,
  );
  const toolRoundChatMode = safePayload.activeContext.chatMode;
  let toolRoundCount = 0;
  let discoverySaturationNudgeIssued = false;
  let lastRoundWasReadOnlyOnly = false;
  let providerRoundIndex = 0;
  let editIntentToolNudgeIssued = false;
  let planVerifyCommandNudgeIssued = false;
  let searchReplaceEscalationNudgeIssued = false;
  let searchReplaceBlockedAfterEscalationCount = 0;
  let incompleteHtmlNudgeIssued = false;
  let partialBatchNudgeCount = 0;
  let crushedJavaScriptNudgeIssued = false;
  let scaffoldStrategyNudgeIssued = false;
  let scaffoldStrategyNudgeActivityId: string | null = null;
  let scaffoldStrategyNudgeConflict: ScaffoldConflictKind | null = null;
  let scaffoldStrategyRecovered = false;
  let searchReplaceEscalationActivityId: string | null = null;
  let searchReplaceEscalationRecovered = false;
  let postScaffoldVerificationNudgeIssued = false;
  let scaffoldMutatingCommandSucceeded = false;
  let postEscalationToolRounds = 0;
  let commandToolSucceeded = false;
  let commandToolFailed = false;
  let commandToolSampledThisTurn = false;
  const searchReplaceCountByPath = new Map<string, number>();
  const pathsEditedThisTurn = new Set<string>();
  const incrementalEditMidTurnNudgesIssued =
    new Set<IncrementalEditMidTurnNudgeKind>();
  let editToolsAttemptedThisTurn = false;
  let proposeFileEditsAttempted = false;
  let readOnlyRoundsAfterFirstEdit = 0;
  let rereadLoopDetected = false;
  const pathsReadThisTurn = new Set<string>();
  let lastRoundSearchReplaceOnScopedPath = false;

  const syncHarnessMetricsScratch = (): void => {
    if (!scratch?.harnessMetricsScratch) return;
    const hm = scratch.harnessMetricsScratch;
    hm.toolRoundCount = toolRoundCount;
    hm.rereadLoopDetected = rereadLoopDetected;
    syncSearchReplaceCountsToScratch(hm, searchReplaceCountByPath);
    syncSearchReplaceFailuresToScratch(hm, searchReplaceFailuresByPath);
    syncProposalRejectionsToScratch(hm, proposalRejectionsByPath);
    hm.searchReplaceBlockedAfterEscalationCount =
      searchReplaceBlockedAfterEscalationCount;
  };

  const snapshotForProviderRound = (
    roundKind: "tool_sample" | "final_stream",
  ) => {
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
    });
    providerRoundIndex += 1;
    if (scratch) pushProviderRound(scratch, snapshot, "completed");
    return snapshot;
  };

  const completeTurnWithFinalStream = async (
    extraUserHint?: string,
  ): Promise<void> => {
    syncHarnessMetricsScratch();
    if (isPlanMode) {
      emitActivity(payload.streamId, {
        id: activityId(),
        title: "Writing structured plan",
        status: "running",
      });
    }
    if (extraUserHint) {
      messages.push({ role: "user", content: extraUserHint });
    }
    let postScaffoldVerificationIncomplete = false;
    let postScaffoldMissingPaths: string[] = [];
    if (scaffoldMutatingCommandSucceeded) {
      const verificationReport = assessPostScaffoldVerification({
        readPaths: Array.from(getAgentTurnReads(payload.streamId)),
        template: scaffoldExpectedTemplate,
      });
      postScaffoldVerificationIncomplete = !verificationReport.complete;
      postScaffoldMissingPaths = [...verificationReport.missingPaths];
    }
    messages.push(
      finalAnswerContract(
        safePayload.userText,
        editProposalCreated,
        editProposalComposedInTurn,
        safePayload.activeContext.chatMode,
        routing.harnessProfileKey,
        routing.agentProfileId,
        harnessCtx,
        turnProposalAccum,
        computeCommandToolsFailed({
          commandIntent,
          commandToolSucceeded,
          commandToolFailed,
          planVerifyCommandNudgeIssued,
        }),
        scaffoldStrategyNudgeIssued,
        scaffoldStrategyRecovered,
        resolvedScaffoldStrategy,
        searchReplaceEscalationRecovered,
        postScaffoldVerificationIncomplete,
        postScaffoldMissingPaths,
        searchReplaceFailuresByPath,
        incompleteHtmlFailuresByPath,
        proposalRejectionsByPath,
        creationIncrementalRecoveryIssued,
        creationRecoveryEnforcedPaths,
        creationScaffoldAcceptedPaths,
      ),
    );
    messages.push({
      role: "user",
      content:
        "Now provide the final answer to the user from the gathered context. Stream the final answer; do not request more tools.",
    });
    const finalSnapshot = snapshotForProviderRound("final_stream");
    await providerStreamFromSnapshot(
      payload.streamId,
      finalSnapshot,
      ac.signal,
      onFinalChunk,
    );
    emit({
      streamId: payload.streamId,
      phase: "activity_clear_running",
      reason: "done",
    });
    finalizeTurnReceipt(payload.streamId, "completed");
    emit({ streamId: payload.streamId, phase: "done" });
  };

  for (let i = 0; i < maxToolIterations; i += 1) {
    if (ac.signal.aborted) throw ac.signal.reason;
    const toolRoundActivityId = activityId();
    const toolRoundTitle = agentToolRoundActivityTitle(
      toolRoundChatMode,
      executeFromApprovedPlan,
      i + 1,
      maxToolIterations,
    );
    const toolRoundDetail = agentToolRoundActivityDetail(
      i + 1,
      maxToolIterations,
      executeFromApprovedPlan,
    );
    const markToolRoundDone = (
      status: AgentChatActivityPayload["status"] = "done",
    ) => {
      emitActivity(payload.streamId, {
        id: toolRoundActivityId,
        title: toolRoundTitle,
        status,
        detail: toolRoundDetail,
      });
    };
    emitActivity(payload.streamId, {
      id: toolRoundActivityId,
      title: toolRoundTitle,
      status: "running",
      detail: toolRoundDetail,
    });
    const sampleSnapshot = snapshotForProviderRound("tool_sample");
    const sampled = await providerSampleFromSnapshot(sampleSnapshot, ac.signal);
    if (sampled.toolCalls.length === 0) {
      markToolRoundDone();
      const shouldNudgeForEditIntent =
        !isPlanMode &&
        !editProposalCreated &&
        agentProfile.canProposeEdits &&
        isLikelyEditIntent(safePayload.userText) &&
        !editIntentToolNudgeIssued &&
        !commandIntent &&
        !incrementalEditEnforcement;
      if (shouldNudgeForEditIntent) {
        editIntentToolNudgeIssued = true;
        messages.push({
          role: "user",
          content: buildEditIntentToolNudge({
            singleFilePrimary: harnessCtx.singleFilePrimary,
          }),
        });
        continue;
      }
      const shouldNudgeForPlanVerify =
        !isPlanMode &&
        agentProfile.canProposeEdits &&
        !commandToolSampledThisTurn &&
        !planVerifyCommandNudgeIssued &&
        shouldInjectPlanVerifyCommandNudge({
          commandIntent,
          singleFileHtmlIntent,
          scaffoldStrategy: harnessCtx.scaffoldStrategy,
          plan: approvedPlanForScaffold?.plan ?? null,
        });
      if (shouldNudgeForPlanVerify) {
        planVerifyCommandNudgeIssued = true;
        messages.push({
          role: "user",
          content: buildPlanVerifyCommandNudge({
            verificationHint,
            scaffoldStrategy: harnessCtx.scaffoldStrategy,
            suggestedCommands: verificationSuggestedCommands,
          }),
        });
        continue;
      }
      await completeTurnWithFinalStream();
      return;
    }

    toolRoundCount += 1;
    const roundToolNames = sampled.toolCalls.map((c) => c.function.name);
    lastRoundWasReadOnlyOnly =
      roundToolNames.length > 0 &&
      roundToolNames.every((name) => READ_ONLY_DISCOVERY_TOOLS.has(name));
    lastRoundSearchReplaceOnScopedPath = false;

    messages.push({
      role: "assistant",
      content: sampled.content || null,
      tool_calls: sampled.toolCalls,
    });

    for (const call of sampled.toolCalls) {
      const name = call.function.name;
      const id = activityId();
      const toolName = isAllowedToolName(name) ? name : undefined;
      emitActivity(payload.streamId, {
        id,
        tool: toolName,
        title: toolName ? `Using ${toolName}` : `Unknown tool: ${name}`,
        status: "running",
      });

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
        sessionDepth: "parent",
        abortSignal: ac.signal,
        emit,
        waitForCommandApproval,
      });

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
          scaffoldExpectedTemplate,
          iterativeWorkEdit: incrementalEditEnforcement,
          searchReplaceEscalationNudgeIssued,
          creationRecoveryEnforcedPaths,
          creationScaffoldAcceptedPaths,
          singleFileHtmlIntent,
          // Pass the new explicit turn lifecycle holder (future: more state will move here)
          agentTurn,
        },
        {
          emit,
          approvalRequestId: activityId(),
          waitForCommandApproval,
          reviewEditProposal: reviewEditProposalForTurn,
        },
      );

      if (outcome.searchReplaceBlockedAfterEscalation) {
        searchReplaceBlockedAfterEscalationCount += 1;
      }

      const { doneTitle, detail, ok } = outcome;
      if (name === "search_replace" && !ok && scratch?.harnessMetricsScratch) {
        recordSearchReplaceFailureReason(
          scratch.harnessMetricsScratch,
          classifySearchReplaceFailureReason(detail),
        );
      }
      if (outcome.editProposalCreated !== undefined) {
        editProposalCreated = outcome.editProposalCreated;
        if (editProposalCreated) {
          turnProgress.editProposalCreated = true;
          if (scratch?.harnessMetricsScratch) {
            recordEditProposalAtRound(
              scratch.harnessMetricsScratch,
              toolRoundCount,
            );
          }
        }
      }
      if (outcome.editProposalComposedInTurn) editProposalComposedInTurn = true;
      if (outcome.turnProposalAccum !== undefined)
        turnProposalAccum = outcome.turnProposalAccum;

      if (incrementalEditEnforcement) {
        if (name === "search_replace" || name === "propose_file_edits") {
          editToolsAttemptedThisTurn = true;
        }
        if (name === "propose_file_edits") {
          proposeFileEditsAttempted = true;
        }
        if (name === "search_replace" && outcome.activitySubjectPath) {
          const srPath = outcome.activitySubjectPath;
          searchReplaceCountByPath.set(
            srPath,
            (searchReplaceCountByPath.get(srPath) ?? 0) + 1,
          );
          if (ok) pathsEditedThisTurn.add(srPath);
          if (
            iterativeEditScope &&
            !lastRoundSearchReplaceOnScopedPath &&
            iterativeEditScope.likelyPaths.some(
              (hint) =>
                srPath.endsWith(hint) || srPath.split(/[\\/]/).pop() === hint,
            )
          ) {
            lastRoundSearchReplaceOnScopedPath = true;
          }
        }
        if (name === "propose_file_edits" && ok && outcome.turnProposalAccum) {
          for (const op of outcome.turnProposalAccum.batch.operations) {
            pathsEditedThisTurn.add(op.path);
          }
        }
        if (name === "read_file") {
          try {
            const args = JSON.parse(call.function.arguments) as {
              path?: string;
            };
            if (typeof args.path === "string") {
              const resolved = resolveAgentWorkspacePath(args.path, {
                manifest,
                projectId,
                activeContext: safePayload.activeContext,
              });
              if (resolved) {
                if (ok) pathsReadThisTurn.add(resolved);
                if (resolved && pathsEditedThisTurn.has(resolved)) {
                  rereadLoopDetected = true;
                }
              }
            }
          } catch {
            /* ignore malformed tool args */
          }
        }
      }

      if (name === "run_command") {
        commandToolSampledThisTurn = true;
        if (ok) {
          commandToolSucceeded = true;
          try {
            const parsed = JSON.parse(outcome.toolContent) as {
              command?: string;
            };
            if (
              typeof parsed.command === "string" &&
              commandLikelyMutatesWorkspace(parsed.command)
            ) {
              scaffoldMutatingCommandSucceeded = true;
            }
          } catch {
            /* ignore */
          }
        } else commandToolFailed = true;
      }

      if (
        !ok &&
        (name === "propose_file_edits" || name === "search_replace") &&
        isAllowedToolName(name)
      ) {
        try {
          const parsed = JSON.parse(outcome.toolContent) as {
            error?: string;
            rejected?: { path?: string; reason?: string }[];
          };
          const rejected = parsed.rejected ?? [];
          if (
            isIncompleteHtmlProposalError(parsed.error) ||
            rejected.some((r) => isIncompleteHtmlProposalError(r.reason))
          ) {
            for (const r of rejected) {
              if (r.path && isIncompleteHtmlProposalError(r.reason)) {
                recordIncompleteHtmlProposalFailure(
                  incompleteHtmlFailuresByPath,
                  r.path,
                );
              }
            }
            if (
              rejected.length === 0 &&
              isIncompleteHtmlProposalError(parsed.error) &&
              typeof detail === "string"
            ) {
              const pathMatch = detail.match(/^([^:]+):/);
              if (pathMatch?.[1]) {
                recordIncompleteHtmlProposalFailure(
                  incompleteHtmlFailuresByPath,
                  pathMatch[1].trim(),
                );
              }
            }
          }
          for (const r of rejected) {
            if (r.path && isCrushedJavaScriptProposalError(r.reason)) {
              recordCrushedJavaScriptProposalFailure(
                crushedJavaScriptFailuresByPath,
                r.path,
              );
            }
          }
          const resolveProposalPath = (path: string): string | null =>
            resolveAgentWorkspacePath(path, {
              manifest,
              projectId,
              activeContext: safePayload.activeContext,
            });
          for (const r of rejected) {
            if (!r.path) continue;
            const resolved = resolveProposalPath(r.path);
            if (!resolved) continue;
            recordCreationIntegrityProposalFailure(
              creationIntegrityFailuresByPath,
              resolved,
              r.reason ?? parsed.error,
              isRegularFileOnDisk(resolved),
            );
          }
          if (
            rejected.length === 0 &&
            typeof parsed.error === "string" &&
            typeof detail === "string"
          ) {
            const pathMatch = detail.match(/^([^:]+):/);
            if (pathMatch?.[1]) {
              const resolved = resolveProposalPath(pathMatch[1].trim());
              if (resolved) {
                recordCreationIntegrityProposalFailure(
                  creationIntegrityFailuresByPath,
                  resolved,
                  parsed.error,
                  isRegularFileOnDisk(resolved),
                );
              }
            }
          }
          if (
            rejected.length === 0 &&
            isCrushedJavaScriptProposalError(parsed.error) &&
            typeof detail === "string"
          ) {
            const pathMatch = detail.match(/^([^:]+):/);
            if (pathMatch?.[1]) {
              recordCrushedJavaScriptProposalFailure(
                crushedJavaScriptFailuresByPath,
                pathMatch[1].trim(),
              );
            }
          }
          recordProposalRejectionsFromEditToolFailure(
            proposalRejectionsByPath,
            resolveProposalPath,
            rejected,
            parseEditToolArguments(call.function.arguments),
            detail,
            agentTurn,
          );
        } catch {
          /* ignore malformed tool JSON */
        }
      }

      const offload = applyToolResultOffload({
        projectId,
        streamId: payload.streamId,
        toolCallId: call.id,
        toolContent: outcome.toolContent,
      });
      const providerToolContent = offload.providerContent;
      totalToolChars += offload.providerChars;

      const truncatedInLoop =
        providerToolContent.includes(
          "[...total tool result budget reached...]",
        ) || providerToolContent.includes("[...truncated...]");
      if (scratch) {
        pushToolStep(scratch, {
          iteration: i,
          toolCallId: call.id,
          name,
          ok,
          resultChars: offload.providerChars,
          truncatedInLoop,
          displayTitle: doneTitle,
          errorSnippet: ok
            ? undefined
            : (detail?.slice(0, 500) ?? providerToolContent.slice(0, 500)),
          ...(outcome.validationSummary
            ? { validationSummary: outcome.validationSummary }
            : {}),
          ...(offload.offloaded
            ? {
                offloaded: true,
                originalResultChars: offload.originalChars,
                offloadRelPath: offload.offloadRelPath,
              }
            : {}),
        });
      }
      let activityStatus: AgentChatActivityPayload["status"] = ok
        ? "done"
        : "error";
      if (name === "run_command") {
        try {
          const parsed = JSON.parse(outcome.toolContent) as {
            rejected?: boolean;
            timedOut?: boolean;
          };
          if (parsed.rejected) activityStatus = "rejected";
          else if (parsed.timedOut) activityStatus = "timeout";
          else if (!ok) activityStatus = "error";
        } catch {
          /* ignore malformed tool JSON */
        }
      }
      emitActivity(payload.streamId, {
        id,
        tool: isAllowedToolName(name) ? name : undefined,
        title: doneTitle,
        detail: offload.offloaded
          ? [
              detail,
              `Context offloaded (${offload.originalChars.toLocaleString()} chars → pointer)`,
            ]
              .filter(Boolean)
              .join(" · ")
          : detail,
        status: activityStatus,
        ...(outcome.activitySubjectPath
          ? { subjectPath: outcome.activitySubjectPath }
          : {}),
      });
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: providerToolContent,
      });
    }
    if (scratch) {
      scratch.editProposalCreated = editProposalCreated;
      scratch.totalToolCharsAccumulated = totalToolChars;
    }

    markToolRoundDone();

    if (scratch?.harnessMetricsScratch && lastRoundWasReadOnlyOnly) {
      scratch.harnessMetricsScratch.readOnlyRounds += 1;
    }
    syncHarnessMetricsScratch();

    if (
      incrementalEditEnforcement &&
      editToolsAttemptedThisTurn &&
      lastRoundWasReadOnlyOnly
    ) {
      readOnlyRoundsAfterFirstEdit += 1;
    }

    if (
      scaffoldStrategyNudgeActivityId &&
      !scaffoldStrategyRecovered &&
      scaffoldStrategyNudgeConflict
    ) {
      if (
        isScaffoldSampleCompliant(resolvedScaffoldStrategy, sampled.toolCalls, {
          scaffoldCliSucceededThisTurn: commandToolSucceeded,
          plan: approvedPlanForScaffold?.plan ?? null,
        })
      ) {
        scaffoldStrategyRecovered = true;
        emitHarnessInterventionActivity(
          payload.streamId,
          scaffoldStrategyNudgeActivityId,
          "scaffold_strategy",
          { conflict: scaffoldStrategyNudgeConflict, recovered: true },
        );
      }
    }
    if (
      searchReplaceEscalationActivityId &&
      !searchReplaceEscalationRecovered &&
      editProposalCreated
    ) {
      searchReplaceEscalationRecovered = true;
      emitHarnessInterventionActivity(
        payload.streamId,
        searchReplaceEscalationActivityId,
        "search_replace_escalation",
        { recovered: true },
      );
    }

    const discoverySaturationMinRounds = incrementalEditEnforcement
      ? INCREMENTAL_EDIT_POLICY.discoverySaturationMinRounds
      : 3;

    if (incrementalEditEnforcement) {
      const midTurnKind = pickIncrementalEditMidTurnNudge({
        issued: incrementalEditMidTurnNudgesIssued,
        searchReplaceCountByPath,
        toolRoundCount,
        editProposalCreated,
        editToolsAttemptedThisTurn,
        proposeFileEditsAttempted,
        rereadLoopDetected,
        iterativeEditScope,
        pathsReadThisTurn,
        lastRoundSearchReplaceOnScopedPath,
      });
      if (midTurnKind) {
        incrementalEditMidTurnNudgesIssued.add(midTurnKind);
        postEscalationToolRounds = 0;
        if (scratch?.harnessMetricsScratch) {
          recordHarnessNudge(
            scratch.harnessMetricsScratch,
            incrementalEditMidTurnKindToHarnessNudgeId(midTurnKind),
          );
        }
        emitActivity(payload.streamId, {
          id: activityId(),
          title: "Harness: consolidate edits",
          status: "done",
          detail: incrementalEditMidTurnNudgeActivityDetail(midTurnKind),
        });
        messages.push({
          role: "user",
          content: buildIncrementalEditMidTurnNudge(
            midTurnKind,
            iterativeEditScope,
          ),
        });
        continue;
      }
    }

    const shouldNudgeDiscoverySaturation =
      !isPlanMode &&
      !editProposalCreated &&
      agentProfile.canProposeEdits &&
      isLikelyEditIntent(safePayload.userText) &&
      !discoverySaturationNudgeIssued &&
      !harnessCtx.greenfieldWorkspace &&
      !commandIntent &&
      !scaffoldMutatingCommandSucceeded &&
      toolRoundCount >= discoverySaturationMinRounds &&
      lastRoundWasReadOnlyOnly;
    if (shouldNudgeDiscoverySaturation) {
      discoverySaturationNudgeIssued = true;
      postEscalationToolRounds = 0;
      if (scratch?.harnessMetricsScratch) {
        recordHarnessNudge(
          scratch.harnessMetricsScratch,
          HARNESS_NUDGE_DISCOVERY_SATURATION,
        );
      }
      emitActivity(payload.streamId, {
        id: activityId(),
        title: "Harness: proceed to edits",
        status: "done",
        detail:
          "Several read-only rounds completed without an edit proposal — switch to propose_file_edits or search_replace.",
      });
      messages.push({
        role: "user",
        content: buildDiscoverySaturationNudge({
          readOnlyRounds: toolRoundCount,
          activeFilePath: safePayload.activeContext.activeFilePath,
          iterativeWorkEdit: incrementalEditEnforcement,
        }),
      });
      continue;
    }

    if (
      searchReplaceEscalationNudgeIssued ||
      incompleteHtmlNudgeIssued ||
      creationIncrementalRecoveryIssued ||
      partialBatchNudgeCount > 0 ||
      crushedJavaScriptNudgeIssued
    ) {
      postEscalationToolRounds += 1;
    }

    if (
      shouldForceFinalForRepeatedEditFailures({
        isPlanMode,
        editProposalCreated,
        canProposeEdits: agentProfile.canProposeEdits,
        userText: safePayload.userText,
        executeFromApprovedPlan,
        searchReplaceFailuresByPath,
        incompleteHtmlFailuresByPath,
        searchReplaceEscalationNudgeIssued,
        incompleteHtmlNudgeIssued,
        postEscalationToolRounds,
        iterativeWorkEdit: incrementalEditEnforcement,
        searchReplaceBlockedAfterEscalationCount,
      })
    ) {
      const srEscalationOptsForce = {
        iterativeWorkEdit: incrementalEditEnforcement,
      };
      const maxReason = setMaxIterationsReasonOnScratch(scratch, {
        totalSearchReplaceFailures: totalSearchReplaceFailures(
          searchReplaceFailuresByPath,
        ),
        searchReplaceBlockedAfterEscalationCount,
        searchReplaceEscalationNudgeIssued,
        incompleteHtmlNudgeIssued,
        postEscalationToolRounds,
        postEscalationMaxToolRounds: resolvePostEscalationMaxToolRounds(
          srEscalationOptsForce,
        ),
        maxSearchReplaceFailuresPerTurn: resolveSearchReplaceMaxFailuresPerTurn(
          srEscalationOptsForce,
        ),
        iterativeWorkEdit: incrementalEditEnforcement,
        forceFinalFromEditFailures: true,
      });
      const totalSrFailures = totalSearchReplaceFailures(
        searchReplaceFailuresByPath,
      );
      if (totalSrFailures > 0) {
        emitEditToolBudgetExhaustedActivity(
          payload.streamId,
          searchReplaceFailuresByPath,
          {
            escalationIssued: searchReplaceEscalationNudgeIssued,
            postEscalationStall: maxReason === "post_escalation_stall",
          },
        );
      } else {
        emitActivity(payload.streamId, {
          id: activityId(),
          title: "Finishing turn (edit tools did not succeed)",
          status: "done",
          detail:
            "Stopping further tool rounds after repeated edit failures. Provide an honest summary — no proposal was created.",
        });
      }
      await completeTurnWithFinalStream(
        buildMaxToolIterationsHint({
          isPlanMode,
          userText: safePayload.userText,
          editProposalCreated,
          searchReplaceFailuresByPath,
          incompleteHtmlFailuresByPath,
          proposalRejectionsByPath,
          executeFromApprovedPlan,
          iterativeWorkEdit: incrementalEditEnforcement,
        }),
      );
      return;
    }

    if (
      shouldForceFinalForRepeatedProposalRejectionsOnTurn({
        isPlanMode,
        editProposalCreated,
        canProposeEdits: agentProfile.canProposeEdits,
        userText: safePayload.userText,
        executeFromApprovedPlan,
        proposalRejectionsByPath,
      })
    ) {
      const blockedPaths = pathsAtProposalRejectionForceFinalThreshold(
        proposalRejectionsByPath,
      );
      setMaxIterationsReasonOnScratch(scratch, {
        totalSearchReplaceFailures: totalSearchReplaceFailures(
          searchReplaceFailuresByPath,
        ),
        searchReplaceBlockedAfterEscalationCount,
        searchReplaceEscalationNudgeIssued,
        incompleteHtmlNudgeIssued,
        postEscalationToolRounds,
        postEscalationMaxToolRounds: resolvePostEscalationMaxToolRounds({
          iterativeWorkEdit: incrementalEditEnforcement,
        }),
        maxSearchReplaceFailuresPerTurn: resolveSearchReplaceMaxFailuresPerTurn(
          {
            iterativeWorkEdit: incrementalEditEnforcement,
          },
        ),
        iterativeWorkEdit: incrementalEditEnforcement,
        forceFinalFromEditFailures: true,
        proposalRejectionLoop: true,
      });
      emitActivity(payload.streamId, {
        id: activityId(),
        title: "Finishing turn (repeated proposal rejections)",
        status: "done",
        detail:
          blockedPaths.length > 0
            ? `Stopping after repeated validation failures on ${blockedPaths
                .map((p) => p.split(/[/\\]/).filter(Boolean).pop() ?? p)
                .join(", ")} — no reviewable proposal was created.`
            : "Stopping after repeated edit proposal validation failures — no reviewable proposal was created.",
      });
      await completeTurnWithFinalStream(
        buildProposalRejectionForceFinalHint(blockedPaths),
      );
      return;
    }

    const srEscalationOpts = { iterativeWorkEdit: incrementalEditEnforcement };
    const shouldEscalateSearchReplace =
      !isPlanMode &&
      !editProposalCreated &&
      agentProfile.canProposeEdits &&
      !searchReplaceEscalationNudgeIssued &&
      shouldInjectSearchReplaceEscalation(
        searchReplaceFailuresByPath,
        srEscalationOpts,
      );
    if (shouldEscalateSearchReplace) {
      searchReplaceEscalationNudgeIssued = true;
      postEscalationToolRounds = 0;
      if (scratch?.harnessMetricsScratch) {
        const hm = scratch.harnessMetricsScratch;
        hm.searchReplaceEscalationIssued = true;
        hm.searchReplaceEscalationAtFailureCount = totalSearchReplaceFailures(
          searchReplaceFailuresByPath,
        );
        recordHarnessNudge(hm, HARNESS_NUDGE_SEARCH_REPLACE_ESCALATION);
      }
      const escalationActivityId = activityId();
      searchReplaceEscalationActivityId = escalationActivityId;
      emitHarnessInterventionActivity(
        payload.streamId,
        escalationActivityId,
        "search_replace_escalation",
        { recovered: false },
      );
      messages.push({
        role: "user",
        content: buildSearchReplaceEscalationNudge(
          pathsAtSearchReplaceEscalationThreshold(
            searchReplaceFailuresByPath,
            srEscalationOpts,
          ),
          { iterativeWorkEdit: incrementalEditEnforcement },
        ),
      });
      continue;
    }

    const shouldNudgeIncompleteHtml =
      !isPlanMode &&
      !editProposalCreated &&
      agentProfile.canProposeEdits &&
      !incompleteHtmlNudgeIssued &&
      shouldInjectIncompleteHtmlProposalNudge(incompleteHtmlFailuresByPath);
    if (shouldNudgeIncompleteHtml) {
      incompleteHtmlNudgeIssued = true;
      postEscalationToolRounds = 0;
      emitActivity(payload.streamId, {
        id: activityId(),
        title: "Harness: complete HTML required",
        status: "done",
        detail:
          "propose_file_edits was rejected as incomplete HTML. Retry with one full document including closing tags.",
      });
      messages.push({
        role: "user",
        content: buildIncompleteHtmlProposalNudge(
          pathsAtIncompleteHtmlNudgeThreshold(incompleteHtmlFailuresByPath),
        ),
      });
      continue;
    }

    const shouldNudgeCreationIncremental =
      !isPlanMode &&
      agentProfile.canProposeEdits &&
      !creationIncrementalRecoveryIssued &&
      shouldInjectCreationIncrementalRecoveryNudge(
        creationIntegrityFailuresByPath,
      );
    if (shouldNudgeCreationIncremental) {
      creationIncrementalRecoveryIssued = true;
      postEscalationToolRounds = 0;
      recordCreationRecoveryEnforced(
        creationRecoveryEnforcedPaths,
        pathsAtCreationIncrementalRecoveryThreshold(
          creationIntegrityFailuresByPath,
        ),
      );
      if (scratch?.harnessMetricsScratch) {
        recordHarnessNudge(
          scratch.harnessMetricsScratch,
          HARNESS_NUDGE_CREATION_INCREMENTAL_RECOVERY,
        );
      }
      emitActivity(payload.streamId, {
        id: activityId(),
        title: "Harness: incremental file creation",
        status: "done",
        detail:
          "Repeated full-file proposals for new paths failed validation — build a minimal file first, then extend incrementally.",
      });
      messages.push({
        role: "user",
        content: buildCreationIncrementalRecoveryNudge(
          pathsAtCreationIncrementalRecoveryThreshold(
            creationIntegrityFailuresByPath,
          ),
          { singleFileHtmlIntent },
        ),
      });
      continue;
    }

    const partialRejected = turnProposalAccum?.rejected ?? [];
    const partialAccepted = turnProposalAccum?.batch.operations.length ?? 0;
    const maxPartialBatchNudges = executeFromApprovedPlan ? 2 : 1;
    const shouldNudgePartialBatch =
      !isPlanMode &&
      editProposalCreated &&
      agentProfile.canProposeEdits &&
      !creationIncrementalRecoveryIssued &&
      partialBatchNudgeCount < maxPartialBatchNudges &&
      shouldInjectPartialBatchProposalNudge({
        acceptedCount: partialAccepted,
        rejected: partialRejected,
        executeFromApprovedPlan,
      });
    if (shouldNudgePartialBatch) {
      partialBatchNudgeCount += 1;
      postEscalationToolRounds = 0;
      emitActivity(payload.streamId, {
        id: activityId(),
        title: "Harness: retry rejected paths",
        status: "done",
        detail:
          partialBatchNudgeCount > 1
            ? "script.js (or other rejected paths) still failed validation — resubmit only rejected paths with multi-line JS."
            : "Some write_file ops were accepted; others failed validation. Resubmit complete bodies for rejected paths only.",
      });
      messages.push({
        role: "user",
        content: buildPartialBatchProposalNudge(
          partialRejected,
          partialAccepted,
        ),
      });
      continue;
    }

    const shouldNudgeCrushedJavaScript =
      !isPlanMode &&
      agentProfile.canProposeEdits &&
      !crushedJavaScriptNudgeIssued &&
      !creationIncrementalRecoveryIssued &&
      shouldInjectCrushedJavaScriptProposalNudge(
        crushedJavaScriptFailuresByPath,
      );
    if (shouldNudgeCrushedJavaScript) {
      crushedJavaScriptNudgeIssued = true;
      postEscalationToolRounds = 0;
      emitActivity(payload.streamId, {
        id: activityId(),
        title: "Harness: multi-line JavaScript required",
        status: "done",
        detail:
          "script.js failed crushed/corrupt validation twice — retry with one full multi-line propose_file_edits body.",
      });
      messages.push({
        role: "user",
        content: buildCrushedJavaScriptProposalNudge(
          pathsAtCrushedJavaScriptNudgeThreshold(
            crushedJavaScriptFailuresByPath,
          ),
        ),
      });
      continue;
    }

    if (
      incrementalEditEnforcement &&
      editProposalCreated &&
      !shouldNudgePartialBatch
    ) {
      if (scratch?.harnessMetricsScratch) {
        scratch.harnessMetricsScratch.stoppedAfterProposal = true;
      }
      await completeTurnWithFinalStream();
      return;
    }

    const scaffoldConflict = detectScaffoldConflict(
      resolvedScaffoldStrategy,
      sampled.toolCalls,
      {
        scaffoldCliSucceededThisTurn: commandToolSucceeded,
        plan: approvedPlanForScaffold?.plan ?? null,
      },
    );
    if (
      shouldInjectScaffoldStrategyNudge({
        strategy: resolvedScaffoldStrategy,
        greenfieldWorkspace: greenfield,
        executeFromApprovedPlan,
        postPlanIncremental,
        alreadyIssued: scaffoldStrategyNudgeIssued,
        conflict: scaffoldConflict,
      })
    ) {
      scaffoldStrategyNudgeIssued = true;
      postEscalationToolRounds = 0;
      const nudgeActivityId = activityId();
      scaffoldStrategyNudgeActivityId = nudgeActivityId;
      scaffoldStrategyNudgeConflict = scaffoldConflict;
      emitHarnessInterventionActivity(
        payload.streamId,
        nudgeActivityId,
        "scaffold_strategy",
        {
          conflict: scaffoldConflict,
          recovered: false,
        },
      );
      messages.push({
        role: "user",
        content: buildScaffoldStrategyNudge(
          resolvedScaffoldStrategy!,
          scaffoldConflict!,
        ),
      });
      continue;
    }

    if (
      !isPlanMode &&
      greenfield &&
      executeFromApprovedPlan &&
      !postPlanIncremental &&
      scaffoldMutatingCommandSucceeded &&
      !postScaffoldVerificationNudgeIssued
    ) {
      const verificationReport = assessPostScaffoldVerification({
        readPaths: Array.from(getAgentTurnReads(payload.streamId)),
        template: scaffoldExpectedTemplate,
      });
      if (!verificationReport.complete) {
        postScaffoldVerificationNudgeIssued = true;
        postEscalationToolRounds = 0;
        emitActivity(payload.streamId, {
          id: activityId(),
          title: "Harness: verify scaffold output",
          status: "done",
          detail:
            "Read package.json and entry files to confirm the scaffold stack.",
        });
        messages.push({
          role: "user",
          content: buildPostScaffoldVerificationNudge({
            template: verificationReport.expectedTemplate,
            missingPaths: verificationReport.missingPaths,
            uncheckedSignals: verificationReport.uncheckedSignals,
          }),
        });
        continue;
      }
    }

    if (isPlanMode && toolRoundCount >= 1) {
      await completeTurnWithFinalStream(
        `You have enough workspace context from discovery tools. Provide your final answer now with ${GF_PLAN_FENCE_NUDGE_PHRASE}. Do not request more tools.`,
      );
      return;
    }
  }

  if (scratch) scratch.maxToolIterationsHit = true;
  syncHarnessMetricsScratch();
  const srEscalationOptsMax = { iterativeWorkEdit: incrementalEditEnforcement };
  const totalSrFailuresAtMax = totalSearchReplaceFailures(
    searchReplaceFailuresByPath,
  );
  if (totalSrFailuresAtMax > 0 || incrementalEditEnforcement) {
    setMaxIterationsReasonOnScratch(scratch, {
      totalSearchReplaceFailures: totalSrFailuresAtMax,
      searchReplaceBlockedAfterEscalationCount,
      searchReplaceEscalationNudgeIssued,
      incompleteHtmlNudgeIssued,
      postEscalationToolRounds,
      postEscalationMaxToolRounds:
        resolvePostEscalationMaxToolRounds(srEscalationOptsMax),
      maxSearchReplaceFailuresPerTurn:
        resolveSearchReplaceMaxFailuresPerTurn(srEscalationOptsMax),
      iterativeWorkEdit: incrementalEditEnforcement,
      discoverySaturationNudgeIssued: discoverySaturationNudgeIssued,
      readOnlyRounds: scratch?.harnessMetricsScratch?.readOnlyRounds,
      maxToolIterationsHit: true,
    });
  }
  if (totalSrFailuresAtMax > 0) {
    emitEditToolBudgetExhaustedActivity(
      payload.streamId,
      searchReplaceFailuresByPath,
      {
        escalationIssued: searchReplaceEscalationNudgeIssued,
        postEscalationStall:
          scratch?.harnessMetricsScratch?.maxIterationsReason ===
          "post_escalation_stall",
      },
    );
  }
  const maxHint = buildMaxToolIterationsHint({
    isPlanMode,
    userText: safePayload.userText,
    editProposalCreated,
    searchReplaceFailuresByPath,
    incompleteHtmlFailuresByPath,
    proposalRejectionsByPath,
    executeFromApprovedPlan,
    iterativeWorkEdit: incrementalEditEnforcement,
  });
  await completeTurnWithFinalStream(maxHint);
}

async function runTurnJob(payload: AgentChatStartPayload): Promise<void> {
  const ac = activeTurns.get(payload.streamId);
  if (!ac) return;

  const snap = getCurrentProject();
  let scratch: TurnTraceScratch | null = null;
  let turnRouting: ReturnType<typeof resolveAgentTurnRouting> | null = null;
  const turnProgress: AgentTurnProgress = { editProposalCreated: false };
  let turnTimeoutMs = AGENT_TURN_TIMEOUT_MAX_MS;
  if (snap.projectId && snap.manifest) {
    try {
      const { postPlanIncremental } = resolvePostPlanRoutingInput(
        snap.projectId,
        payload,
      );
      const storedIndex = loadWorkspaceIndex(snap.projectId);
      const greenfieldIndex = storedIndex
        ? toGreenfieldIndexSnapshot(storedIndex)
        : null;
      const iterativeWorkEdit =
        !isExplicitComposerModelIntent(payload.modelIntent) &&
        shouldRouteIterativeWorkExecutor({
          chatMode: payload.activeContext.chatMode,
          isApprovedPlanAutoRun: payload.isApprovedPlanAutoRun,
          postPlanIncremental,
          userText: payload.userText,
          index: greenfieldIndex,
        });
      turnRouting = resolveAgentTurnRouting(snap.manifest, {
        modelIntent: payload.modelIntent,
        activeContext: payload.activeContext,
        isApprovedPlanAutoRun: payload.isApprovedPlanAutoRun,
        postPlanIncremental,
        iterativeWorkEdit,
      });
      const agentProfileForTimeout = getAgentProfile(
        turnRouting.agentProfileId,
      );
      const incrementalEditEnforcementForTimeout =
        iterativeWorkEdit || postPlanIncremental;
      turnTimeoutMs = resolveAgentTurnTimeoutMs(
        resolveIncrementalMaxToolIterations(
          resolveMaxToolIterationsForTurn(payload, agentProfileForTimeout),
          incrementalEditEnforcementForTimeout,
        ),
      );
      const { systemPrompt } = buildChatSystemPrompt(snap.manifest);
      scratch = createTurnTraceScratch(
        snap.projectId,
        payload,
        systemPrompt.length,
        turnRouting,
      );
    } catch {
      scratch = null;
    }
  }

  let traceOutcome: TurnTraceOutcome = "completed";
  let traceError: string | undefined;

  const timeout = setTimeout(() => ac.abort(ABORT_TIMEOUT), turnTimeoutMs);
  try {
    await runAgentTurn(payload, ac, scratch, turnProgress);
  } catch (e) {
    if (ac.signal.aborted) {
      if (ac.signal.reason === ABORT_USER) {
        traceOutcome = "cancelled";
      } else if (ac.signal.reason === ABORT_TIMEOUT) {
        traceOutcome = "timeout";
        traceError = turnProgress.editProposalCreated
          ? "Agent turn timed out — a pending diff review is still available in the chat."
          : "Agent turn timed out (turn time budget). Try a smaller change or fewer files per message.";
      } else {
        traceOutcome = "error";
        traceError =
          typeof ac.signal.reason === "string" && ac.signal.reason.trim()
            ? ac.signal.reason
            : "Agent turn aborted";
      }
    } else {
      traceOutcome = "error";
      traceError = e instanceof Error ? e.message : "Agent turn failed";
    }

    if (ac.signal.aborted || e === ABORT_USER || e === ABORT_TIMEOUT) {
      if (ac.signal.reason === ABORT_QUIT) {
        return;
      }
      if (ac.signal.reason === ABORT_USER) {
        finalizeTurnReceipt(payload.streamId, "cancelled");
      } else if (
        ac.signal.reason === ABORT_TIMEOUT &&
        turnProgress.editProposalCreated
      ) {
        finalizeTurnReceipt(payload.streamId, "interrupted");
      } else {
        finalizeTurnReceipt(payload.streamId, "error");
      }
      if (
        ac.signal.reason === ABORT_TIMEOUT &&
        turnProgress.editProposalCreated
      ) {
        emitActivity(payload.streamId, {
          id: activityId(),
          title: "Turn timed out",
          status: "interrupted",
          detail:
            "Turn time budget reached. A pending diff review from this turn is still available — apply or discard it before retrying.",
        });
      }
      emit({
        streamId: payload.streamId,
        phase: "activity_clear_running",
        reason:
          ac.signal.reason === ABORT_USER
            ? "cancelled"
            : ac.signal.reason === ABORT_TIMEOUT &&
                turnProgress.editProposalCreated
              ? "interrupted"
              : "error",
      });
      emit({
        streamId: payload.streamId,
        phase: ac.signal.reason === ABORT_USER ? "cancelled" : "error",
        ...(ac.signal.reason === ABORT_USER
          ? {}
          : { error: traceError ?? "Agent turn timed out" }),
      } as AgentChatEventPayload);
      return;
    }
    const msg =
      traceError ?? (e instanceof Error ? e.message : "Agent turn failed");
    finalizeTurnReceipt(payload.streamId, "error");
    emit({
      streamId: payload.streamId,
      phase: "activity_clear_running",
      reason: "error",
    });
    emit({ streamId: payload.streamId, phase: "error", error: msg });
  } finally {
    clearTimeout(timeout);
    if (traceOutcome === "completed") {
      finalizeTurnReceiptIfPending(payload.streamId, "completed");
    }
    activeTurns.delete(payload.streamId);
    clearTurnReceiptState(payload.streamId);
    setImmediate(() => clearAgentTurnReads(payload.streamId));
    if (scratch) {
      try {
        if (traceOutcome === "cancelled") {
          markLastProviderRoundCancelled(scratch);
        }
        if (
          isDevMode() &&
          scratch.lastSnapshotId &&
          traceOutcome !== "completed"
        ) {
          console.info(
            `[GrokForge] agent turn ${traceOutcome}; lastSnapshotId=${scratch.lastSnapshotId}`,
          );
        }
        const finalizedTrace = finalizeTurnTrace(scratch, traceOutcome, {
          errorMessage: traceError,
        });
        logHarnessMetricsIfDev(finalizedTrace.harnessMetrics);
        writeAgentTurnTrace(scratch.projectId, finalizedTrace);
        appendTraceToThreadMemory(scratch.projectId, finalizedTrace);
      } catch {
        /* ignore trace persistence failures */
      }
    }
  }
}

export function registerAgentChatIpc(options: {
  getCurrentProject: () => CurrentProjectSnapshot;
}): void {
  getCurrentProject = options.getCurrentProject;

  ipcMain.handle(
    "agent-chat-capabilities",
    (): AgentChatCapabilitiesResult => ({
      apiKeyConfigured: Boolean(hasConfiguredXaiApiKey() || getE2eMockReply()),
    }),
  );

  ipcMain.handle(
    "agent-chat-start",
    async (_, raw: unknown): Promise<AgentChatStartResult> => {
      const parsed = StartPayloadSchema.safeParse(raw);
      if (!parsed.success) return { ok: false, error: parsed.error.message };
      if (!getXaiApiKey() && !getE2eMockReply()) {
        return {
          ok: false,
          error:
            "Missing XAI API key. Add it in Settings or set XAI_API_KEY / GROKFORGE_XAI_API_KEY.",
        };
      }
      const payload = parsed.data;
      if (activeTurns.has(payload.streamId))
        return { ok: false, error: "streamId already in use" };
      const ac = new AbortController();
      activeTurns.set(payload.streamId, ac);
      void runTurnJob(payload);
      return { ok: true, streamId: payload.streamId };
    },
  );

  ipcMain.handle(
    "agent-chat-cancel",
    async (_, streamId: unknown): Promise<{ ok: boolean }> => {
      if (typeof streamId !== "string" || !streamId.trim())
        return { ok: false };
      const ac = activeTurns.get(streamId);
      if (!ac) return { ok: true };
      ac.abort(ABORT_USER);
      return { ok: true };
    },
  );

  ipcMain.handle(
    "agent-review-proposal",
    async (_, raw: unknown): Promise<AgentProposalReviewResult> => {
      const parsed = AgentProposalReviewRequestSchema.safeParse(raw);
      if (!parsed.success) return { ok: false, error: parsed.error.message };
      const { projectId, manifest } = getCurrentProject();
      if (!projectId || !manifest)
        return { ok: false, error: "No project loaded." };
      if (!getXaiApiKey() && !getE2eMockReply()) {
        return {
          ok: false,
          error:
            "Missing XAI API key. Add it in Settings or set XAI_API_KEY / GROKFORGE_XAI_API_KEY.",
        };
      }
      const ac = new AbortController();
      return reviewAgentEditProposal({
        manifest,
        proposal: parsed.data.proposal,
        userText: parsed.data.userText,
        planSummary: parsed.data.planSummary,
        transport: activeAgentChatModelTransport,
        abortSignal: ac.signal,
      });
    },
  );

  ipcMain.handle(
    "agent-command-approval-respond",
    async (_, raw: unknown): Promise<AgentCommandApprovalRespondResult> => {
      const parsed = z
        .object({
          streamId: z.string().min(1).max(AGENT_CHAT_MAX_STREAM_ID_LEN),
          requestId: z.string().min(1).max(128),
          approved: z.boolean(),
        })
        .safeParse(raw);
      if (!parsed.success) return { ok: false, error: parsed.error.message };
      const payload: AgentCommandApprovalResponse = parsed.data;
      const pending = pendingCommandApprovals.get(payload.requestId);
      if (!pending || pending.streamId !== payload.streamId) {
        return { ok: false, error: "Approval request is no longer active." };
      }
      pending.resolve(payload.approved);
      return { ok: true };
    },
  );

  ipcMain.handle(
    "get-last-agent-turn-trace",
    (): GetLastAgentTurnTraceResult => {
      const { projectId } = getCurrentProject();
      if (!projectId) return { ok: false, error: "No project loaded." };
      return getLastAgentTurnTraceForProject(projectId);
    },
  );

  ipcMain.handle(
    "export-sanitized-agent-turn-trace",
    (): ExportSanitizedAgentTurnTraceResult => {
      const { projectId } = getCurrentProject();
      if (!projectId) return { ok: false, error: "No project loaded." };
      return exportSanitizedAgentTurnTraceJson(projectId);
    },
  );

  ipcMain.handle(
    "replay-agent-retrieval-preview",
    (): ReplayAgentRetrievalPreviewResult => {
      const snap = getCurrentProject();
      if (!snap.projectId || !snap.manifest)
        return { ok: false, error: "No project loaded." };
      return replayRetrievalPreviewFromLatestTrace(
        snap.projectId,
        snap.manifest,
      );
    },
  );
}
