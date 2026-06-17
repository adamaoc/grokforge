import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '@/types'
import { applyFinalAssistantContentToMessages } from './assistant-stream-finalize'

describe('applyFinalAssistantContentToMessages', () => {
  it('replaces assistant content with the authoritative stream buffer', () => {
    const messages: ChatMessage[] = [
      { id: 'user-1', role: 'user', content: 'plan a doc', timestamp: new Date() },
      { id: 'asst-1', role: 'assistant', content: 'partial ```gf-plan', timestamp: new Date() },
    ]
    const full = '```gf-plan\n{"schemaVersion":1,"summary":"ok"}\n```'
    const next = applyFinalAssistantContentToMessages(messages, 'asst-1', full)
    expect(next?.[1]?.content).toBe(full)
  })
})