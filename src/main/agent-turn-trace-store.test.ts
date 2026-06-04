import { describe, expect, it } from 'vitest'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  AGENT_TURN_TRACE_SCHEMA_VERSION,
  AgentTurnTraceV1Schema,
  type AgentTurnTraceV1,
} from '../shared/agent-turn-trace-contract'
import { redactUserHomeInString, sanitizeTraceForExport } from '../harness/logger/turn-trace-store'

function minimalTrace(overrides: Partial<AgentTurnTraceV1> = {}): AgentTurnTraceV1 {
  return AgentTurnTraceV1Schema.parse({
    schemaVersion: AGENT_TURN_TRACE_SCHEMA_VERSION,
    traceId: '00000000-0000-4000-8000-000000000001',
    projectId: 'proj-test',
    streamId: 'stream-test',
    model: 'grok-test',
    chatMode: 'fast',
    userText: 'hello',
    startedAt: '2020-01-01T00:00:00.000Z',
    completedAt: '2020-01-01T00:00:01.000Z',
    durationMs: 1000,
    outcome: 'completed',
    threadSnapshot: { messageCount: 1, approxTotalChars: 10 },
    activeContext: { chatMode: 'fast' },
    toolSteps: [],
    editProposalCreated: false,
    totalToolCharsAccumulated: 0,
    assistantStreamChars: 42,
    ...overrides,
  })
}

describe('redactUserHomeInString', () => {
  it('prefixes home with tilde for absolute paths', () => {
    const home = homedir()
    if (!home) return
    const p = join(home, 'Projects', 'app', 'foo.ts')
    expect(redactUserHomeInString(p)).toMatch(/^~\//)
    expect(redactUserHomeInString(p)).toContain('Projects/app/foo.ts')
  })
})

describe('sanitizeTraceForExport', () => {
  it('redacts retrieval paths and obvious secret-ish substrings', () => {
    const home = homedir()
    const p = home ? join(home, 'secret-project', 'x.ts') : '/secret-project/x.ts'
    const t = minimalTrace({
      retrieval: {
        generatedAt: '2020-01-01T00:00:00.000Z',
        retrievedFiles: [
          {
            path: p,
            bucket: 'a',
            score: 1,
            reasons: ['match'],
            dirty: false,
            chars: 10,
            truncated: false,
          },
        ],
        stale: false,
        skipped: { ignored: 0, generated: 0, binary: 0, sensitive: 0, large: 0 },
        warnings: [],
        detailLines: [],
        contextBodyChars: 0,
      },
      userText: 'paste XAI_API_KEY=sk-test-abcdef here',
    })
    const out = sanitizeTraceForExport(t)
    const json = JSON.stringify(out)
    expect(json).not.toContain('XAI_API_KEY=')
    expect(json).toContain('[redacted]')
    if (home && home.length > 1) {
      expect(json).not.toContain(home)
    }
  })

  it('parses optional harnessMetrics on trace v1', () => {
    const t = minimalTrace({
      harnessMetrics: {
        iterativeWorkEdit: true,
        toolRoundCount: 3,
        editProposalAtRound: 2,
        nudgesIssued: ['discovery_saturation', 'iterative_sr_consolidation'],
        resolvedEditScope: 'single_file',
      },
    })
    expect(t.harnessMetrics?.iterativeWorkEdit).toBe(true)
    expect(t.harnessMetrics?.editProposalAtRound).toBe(2)
  })
})
