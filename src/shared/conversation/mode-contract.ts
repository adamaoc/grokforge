/**
 * Conversation mode contract — maps UI labels, renderer composer state, and agent IPC `chatMode`.
 *
 * - **Work** (`conversationMode: normal`) → agent `chatMode: fast` (the agent may edit)
 * - **Plan** (`conversationMode: plan`) → agent `chatMode: plan` (the agent's plan mode)
 */

/** Renderer composer / persisted project preference. */
export type ConversationMode = 'normal' | 'plan'

/** Agent IPC `activeContext.chatMode`. */
export type { AgentChatMode } from '../agent/chat-contract'
import type { AgentChatMode } from '../agent/chat-contract'

export const CONVERSATION_MODE_WORK: ConversationMode = 'normal'
export const CONVERSATION_MODE_PLAN: ConversationMode = 'plan'

export const AGENT_CHAT_MODE_WORK: AgentChatMode = 'fast'
export const AGENT_CHAT_MODE_PLAN: AgentChatMode = 'plan'

export function conversationModeLabel(mode: ConversationMode): 'Work' | 'Plan' {
  return mode === 'plan' ? 'Plan' : 'Work'
}

export function chatModeDisplayLabel(chatMode: AgentChatMode): 'work' | 'plan' {
  return chatMode === 'plan' ? 'plan' : 'work'
}

export function conversationModeToAgentChatMode(mode: ConversationMode): AgentChatMode {
  return mode === 'plan' ? AGENT_CHAT_MODE_PLAN : AGENT_CHAT_MODE_WORK
}

export function agentChatModeToConversationMode(chatMode: AgentChatMode): ConversationMode {
  return chatMode === 'plan' ? CONVERSATION_MODE_PLAN : CONVERSATION_MODE_WORK
}

export function isPlanConversationMode(mode: ConversationMode): boolean {
  return mode === CONVERSATION_MODE_PLAN
}

export function isPlanAgentChatMode(chatMode: AgentChatMode): boolean {
  return chatMode === AGENT_CHAT_MODE_PLAN
}
