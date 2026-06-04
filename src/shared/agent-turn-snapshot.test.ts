import { describe, expect, it } from 'vitest'
import type { AgentModelChatMessage } from './agent-model-message'
import {
  cloneMessagesForSnapshot,
  AGENT_CHAT_SAMPLE_MAX_TOKENS_DEFAULT,
  AGENT_CHAT_SAMPLE_MAX_TOKENS_EXECUTOR,
  AGENT_CHAT_SAMPLE_MAX_TOKENS_PLANNER,
  providerRequestFromSnapshot,
  recombineSnapshotMessages,
  resolveAgentChatSampleMaxTokens,
  splitSystemAndProviderMessages,
  type AgentTurnSnapshot,
} from '../harness/compaction/turn-snapshot'

function minimalSnapshot(
  overrides: Partial<AgentTurnSnapshot> & Pick<AgentTurnSnapshot, 'agentProfileId' | 'roundKind'>,
): AgentTurnSnapshot {
  return {
    snapshotId: 'snap-1',
    streamId: 'stream-1',
    roundIndex: 0,
    roundKind: overrides.roundKind,
    createdAt: new Date().toISOString(),
    modelId: 'grok-build-0.1',
    modelIntent: 'execution',
    harnessProfileKey: 'grok_code_fast',
    agentProfileId: overrides.agentProfileId,
    chatMode: 'fast',
    systemMessages: ['sys'],
    messagesForProvider: [{ role: 'user', content: 'hi' }],
    toolDefinitions: [],
    activeContext: { chatMode: 'fast' },
    ...overrides,
  }
}

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

describe('resolveAgentChatSampleMaxTokens', () => {
  it('uses a high budget for executor tool samples', () => {
    expect(
      resolveAgentChatSampleMaxTokens(
        minimalSnapshot({ agentProfileId: 'executor', roundKind: 'tool_sample' }),
      ),
    ).toBe(AGENT_CHAT_SAMPLE_MAX_TOKENS_EXECUTOR)
  })

  it('uses a smaller budget for planner tool samples', () => {
    expect(
      resolveAgentChatSampleMaxTokens(
        minimalSnapshot({ agentProfileId: 'planner', roundKind: 'tool_sample' }),
      ),
    ).toBe(AGENT_CHAT_SAMPLE_MAX_TOKENS_PLANNER)
  })

  it('uses raised default budget for default profile tool samples (129)', () => {
    expect(
      resolveAgentChatSampleMaxTokens(
        minimalSnapshot({ agentProfileId: 'default', roundKind: 'tool_sample' }),
      ),
    ).toBe(AGENT_CHAT_SAMPLE_MAX_TOKENS_DEFAULT)
    expect(AGENT_CHAT_SAMPLE_MAX_TOKENS_DEFAULT).toBe(8192)
  })

  it('is included on provider requests from snapshots', () => {
    const req = providerRequestFromSnapshot(
      minimalSnapshot({ agentProfileId: 'executor', roundKind: 'tool_sample' }),
    )
    expect(req.sampleMaxTokens).toBe(AGENT_CHAT_SAMPLE_MAX_TOKENS_EXECUTOR)
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
