import { randomUUID } from 'node:crypto'
import type { AgentRetrievalDebugSnapshot } from './agent-context'
import type { AgentProfileId } from '../shared/agent-profile'
import type {
  AgentChatActiveContext,
  AgentChatStartPayload,
  AgentChatTurnRouting,
} from '../shared/agent-chat-contract'
import type { AgentTurnSnapshot } from '../shared/agent-turn-snapshot'
import { summarizeSnapshotForTrace } from '../shared/agent-turn-snapshot'
import type { AgentTurnTraceV1 } from '../shared/agent-turn-trace-contract'
import { AGENT_TURN_TRACE_SCHEMA_VERSION } from '../shared/agent-turn-trace-contract'
import {
  finalizeHarnessMetrics,
  type HarnessMetricsScratch,
} from '../shared/agent-harness-metrics'

export const AGENT_TURN_TRACE_MAX_PROVIDER_ROUNDS = 32

const MAX_SELECTION_TEXT_IN_TRACE = 8000

export type TurnTraceOutcome = 'completed' | 'cancelled' | 'error' | 'timeout'

export type TurnTraceScratch = {
  traceId: string
  projectId: string
  streamId: string
  model: string
  modelIntent?: AgentChatTurnRouting['modelIntent']
  canonicalModelId?: string
  harnessProfileKey?: AgentChatTurnRouting['harnessProfileKey']
  agentProfileId?: AgentProfileId
  chatMode: AgentChatActiveContext['chatMode']
  userText: string
  startedAtMs: number
  threadSnapshot: { messageCount: number; approxTotalChars: number }
  activeContext: AgentChatActiveContext
  systemPromptChars?: number
  retrieval?: AgentTurnTraceV1['retrieval']
  toolSteps: AgentTurnTraceV1['toolSteps']
  editProposalCreated: boolean
  totalToolCharsAccumulated: number
  assistantStreamChars: number
  maxToolIterationsHit?: boolean
  providerRounds: NonNullable<AgentTurnTraceV1['providerRounds']>
  lastSnapshotId?: string
  harnessMetricsScratch?: HarnessMetricsScratch
}

export function createTurnTraceScratch(
  projectId: string,
  payload: AgentChatStartPayload,
  systemPromptChars?: number,
  routing?: AgentChatTurnRouting,
): TurnTraceScratch {
  const approxTotalChars = payload.threadSnapshot.reduce((n, m) => n + m.content.length, 0)
  const active: AgentChatStartPayload['activeContext'] = {
    ...payload.activeContext,
    editorSelection: payload.activeContext.editorSelection
      ? {
          ...payload.activeContext.editorSelection,
          text: truncateSelectionForTrace(payload.activeContext.editorSelection.text),
        }
      : payload.activeContext.editorSelection,
  }
  return {
    traceId: randomUUID(),
    projectId,
    streamId: payload.streamId,
    model: payload.model,
    modelIntent: routing?.modelIntent,
    canonicalModelId: routing?.modelId,
    harnessProfileKey: routing?.harnessProfileKey,
    agentProfileId: routing?.agentProfileId,
    chatMode: payload.activeContext.chatMode,
    userText: payload.userText,
    startedAtMs: Date.now(),
    threadSnapshot: { messageCount: payload.threadSnapshot.length, approxTotalChars },
    activeContext: active,
    systemPromptChars,
    toolSteps: [],
    editProposalCreated: false,
    totalToolCharsAccumulated: 0,
    assistantStreamChars: 0,
    providerRounds: [],
  }
}

export function pushProviderRound(
  scratch: TurnTraceScratch,
  snapshot: AgentTurnSnapshot,
  outcome: 'completed' | 'cancelled' = 'completed',
): void {
  if (scratch.providerRounds.length >= AGENT_TURN_TRACE_MAX_PROVIDER_ROUNDS) return
  scratch.providerRounds.push(summarizeSnapshotForTrace(snapshot, outcome))
  scratch.lastSnapshotId = snapshot.snapshotId
}

export function markLastProviderRoundCancelled(scratch: TurnTraceScratch): void {
  const last = scratch.providerRounds[scratch.providerRounds.length - 1]
  if (last) last.outcome = 'cancelled'
}

function truncateSelectionForTrace(text: string | undefined): string | undefined {
  if (text === undefined) return undefined
  if (text.length <= MAX_SELECTION_TEXT_IN_TRACE) return text
  return `${text.slice(0, MAX_SELECTION_TEXT_IN_TRACE)}\n[...selection truncated for trace storage...]`
}

export function applyRetrievalToScratch(scratch: TurnTraceScratch, snap: AgentRetrievalDebugSnapshot): void {
  scratch.retrieval = {
    generatedAt: snap.generatedAt,
    retrievedFiles: snap.files.map((f) => ({
      path: f.path,
      bucket: f.bucket,
      score: f.score,
      reasons: f.reasons.slice(0, 8),
      dirty: f.dirty,
      chars: f.chars,
      truncated: f.truncated,
    })),
    stale: snap.stale,
    staleReason: snap.staleReason,
    skipped: { ...snap.skipped },
    warnings: snap.warnings.slice(0, 20),
    detailLines: [],
    contextBodyChars: 0,
  }
}

export function pushToolStep(scratch: TurnTraceScratch, step: AgentTurnTraceV1['toolSteps'][number]): void {
  scratch.toolSteps.push(step)
}

export function setRetrievalDetailLines(scratch: TurnTraceScratch, lines: string[]): void {
  if (!scratch.retrieval) return
  scratch.retrieval.detailLines = lines.slice(0, 80)
}

export function setRetrievalContextBodyChars(scratch: TurnTraceScratch, chars: number): void {
  if (!scratch.retrieval) return
  scratch.retrieval.contextBodyChars = chars
}

export function finalizeTurnTrace(
  scratch: TurnTraceScratch,
  outcome: TurnTraceOutcome,
  options?: {
    errorMessage?: string
    totalToolChars?: number
    maxToolIterationsHit?: boolean
    harnessMetrics?: AgentTurnTraceV1['harnessMetrics']
  },
): AgentTurnTraceV1 {
  const completedAt = new Date().toISOString()
  const durationMs = Math.max(0, Date.now() - scratch.startedAtMs)
  if (options?.totalToolChars !== undefined) scratch.totalToolCharsAccumulated = options.totalToolChars
  if (options?.maxToolIterationsHit !== undefined) scratch.maxToolIterationsHit = options.maxToolIterationsHit

  const harnessMetrics =
    options?.harnessMetrics ??
    (scratch.harnessMetricsScratch
      ? finalizeHarnessMetrics({
          iterativeWorkEdit: scratch.harnessMetricsScratch.iterativeWorkEdit,
          postPlanIncremental: scratch.harnessMetricsScratch.postPlanIncremental,
          resolvedEditScope: scratch.harnessMetricsScratch.resolvedEditScope,
          toolRoundCount: scratch.harnessMetricsScratch.toolRoundCount,
          readOnlyRounds: scratch.harnessMetricsScratch.readOnlyRounds,
          searchReplaceCountByPath: scratch.harnessMetricsScratch.searchReplaceCountByPath,
          searchReplaceFailuresByPath: scratch.harnessMetricsScratch.searchReplaceFailuresByPath,
          searchReplaceEscalationIssued: scratch.harnessMetricsScratch.searchReplaceEscalationIssued,
          searchReplaceEscalationAtFailureCount:
            scratch.harnessMetricsScratch.searchReplaceEscalationAtFailureCount,
          searchReplaceBlockedAfterEscalationCount:
            scratch.harnessMetricsScratch.searchReplaceBlockedAfterEscalationCount,
          searchReplaceLastFailureReasons: scratch.harnessMetricsScratch.searchReplaceLastFailureReasons,
          maxIterationsReason: scratch.harnessMetricsScratch.maxIterationsReason,
          nudgesIssued: scratch.harnessMetricsScratch.nudgesIssued,
          editProposalAtRound: scratch.harnessMetricsScratch.editProposalAtRound,
          stoppedAfterProposal: scratch.harnessMetricsScratch.stoppedAfterProposal,
          rereadLoopDetected: scratch.harnessMetricsScratch.rereadLoopDetected,
        })
      : undefined)

  return {
    schemaVersion: AGENT_TURN_TRACE_SCHEMA_VERSION,
    traceId: scratch.traceId,
    projectId: scratch.projectId,
    streamId: scratch.streamId,
    model: scratch.model,
    modelIntent: scratch.modelIntent,
    canonicalModelId: scratch.canonicalModelId,
    harnessProfileKey: scratch.harnessProfileKey,
    agentProfileId: scratch.agentProfileId,
    chatMode: scratch.chatMode,
    userText: scratch.userText,
    startedAt: new Date(scratch.startedAtMs).toISOString(),
    completedAt,
    durationMs,
    outcome,
    errorMessage: options?.errorMessage,
    threadSnapshot: scratch.threadSnapshot,
    activeContext: scratch.activeContext as unknown as Record<string, unknown>,
    systemPromptChars: scratch.systemPromptChars,
    retrieval: scratch.retrieval,
    toolSteps: scratch.toolSteps,
    editProposalCreated: scratch.editProposalCreated,
    totalToolCharsAccumulated: scratch.totalToolCharsAccumulated,
    assistantStreamChars: scratch.assistantStreamChars,
    maxToolIterationsHit: scratch.maxToolIterationsHit,
    providerRounds: scratch.providerRounds.length > 0 ? scratch.providerRounds : undefined,
    harnessMetrics,
  }
}
