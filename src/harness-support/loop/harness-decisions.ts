import type { AgentModelChatMessage } from '../../shared/agent-model-message'

export type HarnessDecision =
  | { kind: 'continue' }
  | { kind: 'inject_user_message'; content: string }
  | { kind: 'force_final'; reason: string; extraUserHint?: string }
  | { kind: 'complete_turn' }

export type HarnessDecisionInput = {
  toolCallCount: number
  messages: readonly AgentModelChatMessage[]
  maxToolIterationsReached: boolean
}

export function continueHarnessTurn(): HarnessDecision {
  return { kind: 'continue' }
}

export function injectHarnessUserMessage(content: string): HarnessDecision {
  return { kind: 'inject_user_message', content }
}

export function forceHarnessFinal(reason: string, extraUserHint?: string): HarnessDecision {
  return extraUserHint
    ? { kind: 'force_final', reason, extraUserHint }
    : { kind: 'force_final', reason }
}

export function completeHarnessTurn(): HarnessDecision {
  return { kind: 'complete_turn' }
}

/**
 * Initial decision boundary for the runner's order-sensitive mid-turn policy.
 *
 * The current runner still owns the full branch order. This helper establishes the
 * data shape that future extractions should return instead of mutating the loop inline.
 */
export function decideDefaultHarnessAction(input: HarnessDecisionInput): HarnessDecision {
  if (input.maxToolIterationsReached) {
    return forceHarnessFinal('max_tool_iterations')
  }
  return continueHarnessTurn()
}
