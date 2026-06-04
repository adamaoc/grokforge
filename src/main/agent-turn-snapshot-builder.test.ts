import { describe, expect, it } from 'vitest'
import type { AgentModelChatMessage } from '../shared/agent-model-message'
import { buildTurnSnapshot } from '../harness/compaction/turn-snapshot-builder'

const baseRouting = {
  modelIntent: 'chat_default' as const,
  modelId: 'grok-build-0.1',
  harnessProfileKey: 'grok_code_fast' as const,
  agentProfileId: 'default' as const,
}

const minimalTool = {
  type: 'function' as const,
  function: {
    name: 'read_file',
    description: 'read',
    parameters: { type: 'object', properties: {} },
  },
}

function activeContextWithPin(path: string) {
  return {
    openTabs: [],
    chatMode: 'fast' as const,
    pinned: [{ type: 'file' as const, path }],
  }
}

describe('buildTurnSnapshot', () => {
  it('second snapshot includes tool messages while first is unchanged', () => {
    const messagesRound0: AgentModelChatMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'go' },
    ]
    const snap0 = buildTurnSnapshot({
      roundIndex: 0,
      roundKind: 'tool_sample',
      streamId: 's1',
      routing: baseRouting,
      chatMode: 'fast',
      messages: messagesRound0,
      toolDefinitions: [minimalTool],
      activeContext: { openTabs: [], chatMode: 'fast' },
    })

    const messagesRound1: AgentModelChatMessage[] = [
      ...messagesRound0,
      { role: 'assistant', content: null, tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'read_file', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'tc1', content: '{"ok":true}' },
    ]
    const snap1 = buildTurnSnapshot({
      roundIndex: 1,
      roundKind: 'tool_sample',
      streamId: 's1',
      routing: baseRouting,
      chatMode: 'fast',
      messages: messagesRound1,
      toolDefinitions: [minimalTool],
      activeContext: { openTabs: [], chatMode: 'fast' },
    })

    expect(snap0.messagesForProvider).toHaveLength(1)
    expect(snap1.messagesForProvider).toHaveLength(3)
    expect(snap0.messagesForProvider[0]?.content).toBe('go')
    expect(snap0.snapshotId).not.toBe(snap1.snapshotId)
  })

  it('does not reflect pin changes on live context after first snapshot', () => {
    const live = activeContextWithPin('/first/pin.ts')
    const snap0 = buildTurnSnapshot({
      roundIndex: 0,
      roundKind: 'tool_sample',
      streamId: 's2',
      routing: baseRouting,
      chatMode: 'fast',
      messages: [{ role: 'user', content: 'x' }],
      toolDefinitions: [minimalTool],
      activeContext: live,
    })

    live.pinned = [{ type: 'file', path: '/second/pin.ts' }]
    expect(snap0.activeContext.pinned?.[0]?.path).toBe('/first/pin.ts')
  })
})
