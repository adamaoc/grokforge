import { describe, expect, it } from 'vitest'
import {
  SUBAGENT_MAX_RETURN_CHARS,
  SpawnSubagentArgsSchema,
  SubagentResultArtifactSchema,
  buildFallbackSubagentArtifact,
  capSubagentArtifact,
  serializeSubagentResultForParent,
} from '../harness-support/subagent/contracts/subagent-contract'

describe('agent-subagent-contract', () => {
  it('parses spawn args', () => {
    const parsed = SpawnSubagentArgsSchema.parse({
      task: 'Find auth entrypoints',
      modelIntent: 'reasoning',
    })
    expect(parsed.task).toContain('auth')
  })

  it('caps artifact arrays', () => {
    const capped = capSubagentArtifact({
      summary: 'ok',
      filesRead: Array.from({ length: 50 }, (_, i) => `/f${i}.ts`),
      searchHits: Array.from({ length: 50 }, (_, i) => ({ query: 'q', path: `/f${i}.ts` })),
    })
    expect(capped.filesRead.length).toBeLessThanOrEqual(32)
    expect(capped.searchHits.length).toBeLessThanOrEqual(24)
  })

  it('truncates serialized parent payload', () => {
    const json = serializeSubagentResultForParent({
      summary: 'x'.repeat(5000),
      filesRead: Array.from({ length: 20 }, (_, i) => `/very/long/path/file-${i}.ts`),
      searchHits: Array.from({ length: 20 }, () => ({
        query: 'needle',
        path: '/also/long/path/file.ts',
        line: 1,
      })),
    })
    expect(json.length).toBeLessThanOrEqual(SUBAGENT_MAX_RETURN_CHARS)
    expect(() => JSON.parse(json)).not.toThrow()
  })

  it('builds fallback artifact', () => {
    const artifact = buildFallbackSubagentArtifact({
      task: 'explore',
      filesRead: ['/a.ts'],
      searchHits: [{ query: 'foo', path: '/a.ts', line: 2 }],
    })
    expect(SubagentResultArtifactSchema.safeParse(artifact).success).toBe(true)
  })
})
