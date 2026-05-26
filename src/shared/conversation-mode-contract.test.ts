import { describe, expect, it } from 'vitest'
import {
  agentChatModeToConversationMode,
  chatModeDisplayLabel,
  conversationModeLabel,
  conversationModeToAgentChatMode,
} from './conversation-mode-contract'

describe('conversation-mode-contract', () => {
  it('maps Work/Plan UI to agent chatMode', () => {
    expect(conversationModeLabel('normal')).toBe('Work')
    expect(conversationModeLabel('plan')).toBe('Plan')
    expect(conversationModeToAgentChatMode('normal')).toBe('fast')
    expect(conversationModeToAgentChatMode('plan')).toBe('plan')
    expect(agentChatModeToConversationMode('fast')).toBe('normal')
    expect(agentChatModeToConversationMode('plan')).toBe('plan')
    expect(chatModeDisplayLabel('fast')).toBe('work')
    expect(chatModeDisplayLabel('plan')).toBe('plan')
  })
})
