import type { AgentModelChatMessage } from '../../shared/agent/model-message'
import type { AgentTurn } from './turn-state'

export type FinalAnswerContext = {
  messages: AgentModelChatMessage[]
  turn: AgentTurn
  extraUserHint?: string
}

export function appendFinalAnswerInstruction(context: FinalAnswerContext): AgentModelChatMessage[] {
  const messages = [...context.messages]
  if (context.extraUserHint) {
    messages.push({ role: 'user', content: context.extraUserHint })
  }
  messages.push({
    role: 'user',
    content:
      'Now provide the final answer to the user from the gathered context. Stream the final answer; do not request more tools.',
  })
  return messages
}
