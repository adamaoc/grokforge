import type { AgentChatTurnRouting } from '../shared/agent-chat-contract'
import type { AgentChatEventPayload } from '../shared/agent-chat-contract'
import {
  buildTurnRecoverySystemBlock,
  shouldInjectTurnRecoveryHint,
  type AgentTurnReceipt,
  type TerminalTurnReceiptStatus,
} from '../shared/agent-turn-receipt-contract'
import { appendTurnReceipt, readLastTurnReceipt } from '../harness/session/turn-receipt-store'

type ActiveTurnReceiptState = {
  projectId: string
  routing: AgentChatTurnRouting
  toolCallsStarted: number
  toolCallsCompleted: number
  startedAt: string
  finalized: boolean
}

const activeTurnReceipts = new Map<string, ActiveTurnReceiptState>()
const consumedRecoveryProjectIds = new Set<string>()

function receiptFromState(
  streamId: string,
  status: AgentTurnReceipt['status'],
  state: ActiveTurnReceiptState,
  endedAt: string,
): AgentTurnReceipt {
  return {
    schemaVersion: 1,
    streamId,
    status,
    endedAt,
    modelId: state.routing.modelId,
    harnessProfileKey: state.routing.harnessProfileKey,
    agentProfileId: state.routing.agentProfileId,
    toolCallsStarted: state.toolCallsStarted,
    toolCallsCompleted: state.toolCallsCompleted,
  }
}

export function beginTurnReceipt(
  projectId: string,
  streamId: string,
  routing: AgentChatTurnRouting,
): void {
  const startedAt = new Date().toISOString()
  activeTurnReceipts.set(streamId, {
    projectId,
    routing,
    toolCallsStarted: 0,
    toolCallsCompleted: 0,
    startedAt,
    finalized: false,
  })
  appendTurnReceipt(
    projectId,
    receiptFromState(streamId, 'in_progress', activeTurnReceipts.get(streamId)!, startedAt),
  )
}

export function trackTurnReceiptActivity(
  streamId: string,
  status: 'running' | 'done' | 'error' | 'interrupted',
): void {
  const state = activeTurnReceipts.get(streamId)
  if (!state) return
  if (status === 'running') state.toolCallsStarted += 1
  if (status === 'done' || status === 'error' || status === 'interrupted') {
    state.toolCallsCompleted += 1
  }
}

export function finalizeTurnReceipt(streamId: string, status: TerminalTurnReceiptStatus): void {
  const state = activeTurnReceipts.get(streamId)
  if (!state || state.finalized) return
  state.finalized = true
  appendTurnReceipt(
    state.projectId,
    receiptFromState(streamId, status, state, new Date().toISOString()),
  )
}

export function finalizeTurnReceiptIfPending(
  streamId: string,
  status: TerminalTurnReceiptStatus,
): void {
  const state = activeTurnReceipts.get(streamId)
  if (state && !state.finalized) finalizeTurnReceipt(streamId, status)
}

export function clearTurnReceiptState(streamId: string): void {
  activeTurnReceipts.delete(streamId)
}

export function consumeTurnRecoveryHint(projectId: string): string | null {
  if (consumedRecoveryProjectIds.has(projectId)) return null
  const last = readLastTurnReceipt(projectId)
  if (!last || !shouldInjectTurnRecoveryHint(last)) return null
  consumedRecoveryProjectIds.add(projectId)
  return buildTurnRecoverySystemBlock(last)
}

export type FlushInterruptedTurnReceiptsOptions = {
  emit: (payload: AgentChatEventPayload) => void
  abortTurn: (streamId: string) => void
}

export function flushActiveAgentTurnReceiptsAsInterrupted(
  options: FlushInterruptedTurnReceiptsOptions,
): void {
  for (const [streamId, state] of activeTurnReceipts) {
    if (state.finalized) continue
    finalizeTurnReceipt(streamId, 'interrupted')
    options.emit({
      streamId,
      phase: 'activity_clear_running',
      reason: 'interrupted',
    })
    options.abortTurn(streamId)
  }
}

/** @internal Vitest */
export function _resetTurnReceiptLifecycleForTesting(): void {
  activeTurnReceipts.clear()
  consumedRecoveryProjectIds.clear()
}

/** @internal Vitest */
export function _getActiveTurnReceiptForTesting(streamId: string): ActiveTurnReceiptState | undefined {
  return activeTurnReceipts.get(streamId)
}
