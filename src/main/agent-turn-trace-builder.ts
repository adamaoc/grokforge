import { randomUUID } from 'node:crypto'
import type { AgentRetrievalDebugSnapshot } from './agent-context'
import type { AgentChatActiveContext, AgentChatStartPayload } from '../shared/agent-chat-contract'
import type { AgentTurnTraceV1 } from '../shared/agent-turn-trace-contract'
import { AGENT_TURN_TRACE_SCHEMA_VERSION } from '../shared/agent-turn-trace-contract'

const MAX_SELECTION_TEXT_IN_TRACE = 8000

export type TurnTraceOutcome = 'completed' | 'cancelled' | 'error' | 'timeout'

export type TurnTraceScratch = {
  traceId: string
  projectId: string
  streamId: string
  model: string
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
}

export function createTurnTraceScratch(
  projectId: string,
  payload: AgentChatStartPayload,
  systemPromptChars?: number,
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
  }
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
  options?: { errorMessage?: string; totalToolChars?: number; maxToolIterationsHit?: boolean },
): AgentTurnTraceV1 {
  const completedAt = new Date().toISOString()
  const durationMs = Math.max(0, Date.now() - scratch.startedAtMs)
  if (options?.totalToolChars !== undefined) scratch.totalToolCharsAccumulated = options.totalToolChars
  if (options?.maxToolIterationsHit !== undefined) scratch.maxToolIterationsHit = options.maxToolIterationsHit

  return {
    schemaVersion: AGENT_TURN_TRACE_SCHEMA_VERSION,
    traceId: scratch.traceId,
    projectId: scratch.projectId,
    streamId: scratch.streamId,
    model: scratch.model,
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
  }
}
