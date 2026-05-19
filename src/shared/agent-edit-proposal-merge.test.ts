import { describe, expect, it } from 'vitest'
import { AGENT_TOOL_PROTOCOL_VERSION } from './agent-tool-contract'
import { mergeAgentEditProposals } from './agent-edit-proposal-merge'
import type { AgentEditProposalPayload } from './agent-chat-contract'

function proposal(
  paths: string[],
  rejected: AgentEditProposalPayload['rejected'] = [],
): AgentEditProposalPayload {
  return {
    batch: {
      version: AGENT_TOOL_PROTOCOL_VERSION,
      operations: paths.map((path) => ({
        op: 'write_file' as const,
        path,
        content: `// ${path}`,
      })),
    },
    rejected,
  }
}

describe('mergeAgentEditProposals', () => {
  it('returns incoming when accumulated is null', () => {
    const incoming = proposal(['/proj/a.ts'])
    expect(mergeAgentEditProposals(null, incoming)).toEqual(incoming)
  })

  it('merges two single-file proposals into two operations', () => {
    const merged = mergeAgentEditProposals(proposal(['/proj/a.html']), proposal(['/proj/b.css']))
    expect(merged.batch.operations.map((o) => o.path)).toEqual(['/proj/a.html', '/proj/b.css'])
  })

  it('later operation wins for the same path', () => {
    const first = proposal(['/proj/x.js'])
    const second = {
      batch: {
        version: AGENT_TOOL_PROTOCOL_VERSION,
        operations: [{ op: 'write_file' as const, path: '/proj/x.js', content: 'v2' }],
      },
      rejected: [],
    }
    const merged = mergeAgentEditProposals(first, second)
    expect(merged.batch.operations).toHaveLength(1)
    expect(merged.batch.operations[0]?.op === 'write_file' && merged.batch.operations[0].content).toBe('v2')
  })

  it('concatenates and dedupes rejected entries', () => {
    const a = proposal([], [{ path: '/bad', reason: 'outside roots' }])
    const b = proposal([], [
      { path: '/bad', reason: 'outside roots' },
      { path: '/other', reason: 'ignored' },
    ])
    const merged = mergeAgentEditProposals(a, b)
    expect(merged.rejected).toHaveLength(2)
  })

  it('caps operations at AGENT_TOOL_MAX_OPS and rejects overflow', () => {
    const paths = Array.from({ length: 33 }, (_, i) => `/proj/f${i}.ts`)
    const capped = mergeAgentEditProposals(null, proposal(paths))
    expect(capped.batch.operations).toHaveLength(32)
    expect(capped.rejected).toHaveLength(1)
    expect(capped.rejected[0]?.path).toBe('/proj/f32.ts')
    expect(capped.rejected[0]?.reason).toContain('max operations')
  })
})
