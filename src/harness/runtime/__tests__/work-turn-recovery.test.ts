import { describe, expect, it } from 'vitest'
import { createWorkLoopGuardState, recordWorkToolInvocation } from '../work-loop-guard'
import { formatWorkTurnRecoverySummary } from '../work-turn-recovery'

describe('formatWorkTurnRecoverySummary', () => {
  it('summarizes discovery, writes, and repeated paths', () => {
    const state = createWorkLoopGuardState()
    const path = 'root:routes/api/posts.js'

    recordWorkToolInvocation(
      state,
      'read_file',
      JSON.stringify({ path: 'root:src/index.js' }),
      true,
      'ok',
    )
    for (let i = 0; i < 3; i += 1) {
      recordWorkToolInvocation(
        state,
        'write_file',
        JSON.stringify({ path, content: `v${i}` }),
        true,
        'ok',
      )
    }

    const summary = formatWorkTurnRecoverySummary(state, 50)

    expect(summary).toContain('**50** tool rounds')
    expect(summary).toContain('Discovery tools')
    expect(summary).toContain('**1** calls')
    expect(summary).toContain('**3** calls')
    expect(summary).toContain('posts.js')
    expect(summary).toContain('what happened?')
  })

  it('notes when no proposals were prepared', () => {
    const state = createWorkLoopGuardState()
    recordWorkToolInvocation(
      state,
      'search_workspace',
      JSON.stringify({ query: 'posts' }),
      true,
      '[]',
    )

    const summary = formatWorkTurnRecoverySummary(state, 12)

    expect(summary).toContain('No file proposals were prepared')
  })
})