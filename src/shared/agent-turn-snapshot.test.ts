import { describe, expect, it } from 'vitest'
import type { AgentModelChatMessage } from './agent-model-message'
import {
  cloneMessagesForSnapshot,
  recombineSnapshotMessages,
  splitSystemAndProviderMessages,
} from './agent-turn-snapshot'

describe('splitSystemAndProviderMessages', () => {
  it('splits system from user assistant and tool messages', () => {
    const messages: AgentModelChatMessage[] = [
      { role: 'system', content: 'sys-a' },
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: null, tool_calls: [{ id: '1', type: 'function', function: { name: 'read_file', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: '1', content: '{"ok":true}' },
    ]
    const { systemMessages, messagesForProvider } = splitSystemAndProviderMessages(messages)
    expect(systemMessages).toEqual(['sys-a'])
    expect(messagesForProvider).toHaveLength(3)
    expect(messagesForProvider[0]?.role).toBe('user')
  })
})

describe('recombineSnapshotMessages', () => {
  it('rebuilds provider payload order', () => {
    const recombined = recombineSnapshotMessages({
      systemMessages: ['sys'],
      messagesForProvider: [{ role: 'user', content: 'hi' }],
    })
    expect(recombined).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
    ])
  })
})

describe('cloneMessagesForSnapshot', () => {
  it('does not mutate when live messages change after clone', () => {
    const live: AgentModelChatMessage[] = [{ role: 'user', content: 'v1' }]
    const cloned = cloneMessagesForSnapshot(live)
    live[0] = { role: 'user', content: 'v2' }
    expect(cloned[0]?.content).toBe('v1')
  })
})
