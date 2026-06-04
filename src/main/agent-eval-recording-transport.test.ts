import { describe, expect, it } from 'vitest'
import type { AgentProviderRequest } from '../harness/compaction/turn-snapshot'
import { createRecordingTransport } from './agent-eval-recording-transport'

describe('createRecordingTransport', () => {
  it('records model, tools, and system text from provider requests', async () => {
    const { transport, getRecords } = createRecordingTransport({
      async sampleChatCompletion() {
        return { content: '', toolCalls: [] }
      },
      async streamFinalAnswer() {
        /* noop */
      },
    })

    const request: AgentProviderRequest = {
      snapshotId: '00000000-0000-4000-8000-000000000099',
      model: 'grok-test-model',
      messages: [
        { role: 'system', content: 'sys-a' },
        { role: 'user', content: 'hi' },
      ],
      tools: [
        {
          type: 'function',
          function: { name: 'read_file', description: 'read', parameters: {} },
        },
      ],
    }

    await transport.sampleChatCompletion(request, new AbortController().signal)

    const records = getRecords()
    expect(records).toHaveLength(1)
    expect(records[0]?.phase).toBe('sample')
    expect(records[0]?.model).toBe('grok-test-model')
    expect(records[0]?.snapshotId).toBe(request.snapshotId)
    expect(records[0]?.toolNames).toEqual(['read_file'])
    expect(records[0]?.systemText).toBe('sys-a')
  })
})
