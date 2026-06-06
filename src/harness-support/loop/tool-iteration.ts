import type { AgentModelChatMessage } from '../../shared/agent/model-message'
import type { AgentTurn } from './turn-state'
import type { HarnessDecision } from './harness-decisions'

export type ToolIterationStatus =
  | 'continue'
  | 'needs_final_stream'
  | 'completed'
  | 'aborted'

export type ToolIterationInput = {
  messages: AgentModelChatMessage[]
  turn: AgentTurn
  maxToolIterations: number
}

export type ToolIterationResult = {
  status: ToolIterationStatus
  messages: AgentModelChatMessage[]
  turn: AgentTurn
  decision?: HarnessDecision
  finalHint?: string
}

export function createToolIterationResult(
  input: ToolIterationInput,
  status: ToolIterationStatus,
  extras?: Pick<ToolIterationResult, 'decision' | 'finalHint'>,
): ToolIterationResult {
  return {
    status,
    messages: input.messages,
    turn: input.turn,
    ...extras,
  }
}
