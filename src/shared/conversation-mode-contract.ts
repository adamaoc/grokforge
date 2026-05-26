/**
 * Conversation mode contract — maps UI labels, renderer composer state, and agent IPC `chatMode`.
 *
 * - **Work** (`conversationMode: normal`) → agent `chatMode: fast` (full toolset per profile)
 * - **Plan** (`conversationMode: plan`) → agent `chatMode: plan` (planner profile, gf-plan output)
 *
 * Approve-and-run temporarily sends `chatMode: fast` with `isApprovedPlanAutoRun` while the UI may
 * already show Work (velocity) or stay on Plan (trust) until execute completes.
 */

/** Renderer composer / persisted project preference. */
export type ConversationMode = 'normal' | 'plan'

/** Agent IPC `activeContext.chatMode` (story 118). */
export type AgentChatMode = 'fast' | 'plan'

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
