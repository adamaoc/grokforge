import { describe, expect, it } from 'vitest'
import type { AgentTurnTraceV1 } from './agent-turn-trace-contract'
import {
  AGENT_THREAD_MEMORY_MAX_CHARS,
  AGENT_THREAD_MEMORY_MAX_DECISIONS,
  AGENT_THREAD_MEMORY_MAX_FILES_READ,
} from '../harness/compaction/thread-memory-contract'
import { emptyThreadMemory, formatThreadMemoryBlock, mergeTraceIntoThreadMemory } from '../harness/compaction/thread-memory'

function trace(partial: Partial<AgentTurnTraceV1> & Pick<AgentTurnTraceV1, 'toolSteps'>): AgentTurnTraceV1 {
  return {
    schemaVersion: 1,
    traceId: '00000000-0000-4000-8000-000000000001',
    projectId: 'proj',
    streamId: 'stream-1',
    model: 'grok-test',
    chatMode: 'fast',
    userText: 'hi',
    startedAt: '2026-01-01T00:00:00.000Z',
    completedAt: '2026-01-01T00:00:01.000Z',
    durationMs: 1000,
    outcome: 'completed',
    threadSnapshot: { messageCount: 0, approxTotalChars: 0 },
    activeContext: {},
    toolSteps: partial.toolSteps,
    editProposalCreated: false,
    totalToolCharsAccumulated: 0,
    assistantStreamChars: 0,
    ...partial,
  }
}

describe('mergeTraceIntoThreadMemory', () => {
  it('records read_file paths and tool decision titles', () => {
    const memory = mergeTraceIntoThreadMemory(
      emptyThreadMemory(),
      trace({
        toolSteps: [
          {
            iteration: 0,
            toolCallId: 'c1',
            name: 'read_file',
            ok: true,
            resultChars: 10,
            truncatedInLoop: false,
            displayTitle: 'Read file: /proj/src/a.ts',
          },
          {
            iteration: 1,
            toolCallId: 'c2',
            name: 'propose_file_edits',
            ok: true,
            resultChars: 20,
            truncatedInLoop: false,
            displayTitle: 'Prepared edit proposal (1 file)',
          },
        ],
      }),
    )

    expect(memory.filesRead).toContain('/proj/src/a.ts')
    expect(memory.decisions.some((d) => d.includes('edit proposal'))).toBe(true)
  })

  it('dedupes and trims to caps', () => {
    let memory = emptyThreadMemory()
    for (let i = 0; i < AGENT_THREAD_MEMORY_MAX_FILES_READ + 4; i++) {
      memory = mergeTraceIntoThreadMemory(
        memory,
        trace({
          toolSteps: [
            {
              iteration: 0,
              toolCallId: `c-${i}`,
              name: 'read_file',
              ok: true,
              resultChars: 1,
              truncatedInLoop: false,
              displayTitle: `Read file: /proj/f${i}.ts`,
            },
          ],
        }),
      )
    }
    expect(memory.filesRead.length).toBe(AGENT_THREAD_MEMORY_MAX_FILES_READ)

    for (let i = 0; i < AGENT_THREAD_MEMORY_MAX_DECISIONS + 3; i++) {
      memory = mergeTraceIntoThreadMemory(
        memory,
        trace({
          toolSteps: [
            {
              iteration: 0,
              toolCallId: `d-${i}`,
              name: 'run_command',
              ok: true,
              resultChars: 1,
              truncatedInLoop: false,
              displayTitle: `Command finished: step ${i}`,
            },
          ],
        }),
      )
    }
    expect(memory.decisions.length).toBe(AGENT_THREAD_MEMORY_MAX_DECISIONS)
  })
})

describe('formatThreadMemoryBlock', () => {
  it('returns empty for blank memory', () => {
    expect(formatThreadMemoryBlock(emptyThreadMemory())).toBe('')
  })

  it('truncates formatted output to max chars', () => {
    const memory = emptyThreadMemory()
    memory.filesRead = Array.from(
      { length: 80 },
      (_, i) => `/workspace/root/packages/module-${i}/src/components/FeatureName.tsx`,
    )
    const block = formatThreadMemoryBlock(memory)
    expect(block.length).toBeLessThanOrEqual(AGENT_THREAD_MEMORY_MAX_CHARS)
    if (memory.filesRead.join('\n').length > AGENT_THREAD_MEMORY_MAX_CHARS) {
      expect(block.endsWith('…')).toBe(true)
    }
  })
})
