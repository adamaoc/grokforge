import { describe, expect, it } from 'vitest'
import {
  WORK_DISCOVERY_INVOCATION_BUDGET,
  WORK_SAME_PATH_WRITE_THRESHOLD,
  createWorkLoopGuardState,
  evaluateWorkLoopNudge,
  markWorkLoopNudgeSent,
  recordWorkToolInvocation,
} from '../work-loop-guard'

const planId = '6903bde7-102f-4ec1-808d-936fac7d78a3'

describe('work-loop-guard', () => {
  it('nudges after repeated outside-workspace read_file failures', () => {
    const state = createWorkLoopGuardState()
    const args = JSON.stringify({
      path: '/Users/me/Library/Application Support/grokforge/workspace-projects/x/plans/y/plan.json',
    })

    recordWorkToolInvocation(state, 'read_file', args, false, 'Path is outside workspace roots.')
    expect(evaluateWorkLoopNudge(state, planId)).toBeNull()

    recordWorkToolInvocation(state, 'read_file', args, false, 'Path is outside workspace roots.')
    const nudge = evaluateWorkLoopNudge(state, planId)
    expect(nudge?.kind).toBe('outside_workspace_read')
    expect(nudge?.message).toContain(`gf-plan:${planId}`)
  })

  it('nudges after post-write verify thrash', () => {
    const state = createWorkLoopGuardState()
    const writeArgs = JSON.stringify({ path: 'root:react-best-practices.md', content: '# Doc' })
    const readArgs = JSON.stringify({ path: 'root:react-best-practices.md' })

    recordWorkToolInvocation(state, 'write_file', writeArgs, true, 'Wrote root:react-best-practices.md')
    recordWorkToolInvocation(state, 'read_file', readArgs, true, '{"rawContent":"# Doc"}')
    expect(evaluateWorkLoopNudge(state)).toBeNull()

    recordWorkToolInvocation(state, 'read_file', readArgs, true, '{"rawContent":"# Doc"}')
    const nudge = evaluateWorkLoopNudge(state)
    expect(nudge?.kind).toBe('post_write_verify_thrash')
    expect(nudge?.message).toContain('react-best-practices.md')
  })

  it('nudges when discovery budget is reached without writes', () => {
    const state = createWorkLoopGuardState()

    for (let i = 0; i < WORK_DISCOVERY_INVOCATION_BUDGET - 1; i += 1) {
      recordWorkToolInvocation(
        state,
        'read_file',
        JSON.stringify({ path: `root:src/file-${i}.ts` }),
        true,
        'ok',
      )
      expect(evaluateWorkLoopNudge(state)).toBeNull()
    }

    recordWorkToolInvocation(
      state,
      'read_file',
      JSON.stringify({ path: `root:src/file-${WORK_DISCOVERY_INVOCATION_BUDGET}.ts` }),
      true,
      'ok',
    )
    const nudge = evaluateWorkLoopNudge(state)
    expect(nudge?.kind).toBe('discovery_budget')
    expect(nudge?.message).toContain('discovery budget')
  })

  it('nudges after repeated writes to the same path', () => {
    const state = createWorkLoopGuardState()
    const writeArgs = JSON.stringify({ path: 'root:routes/api/posts.js', content: 'x' })

    for (let i = 0; i < WORK_SAME_PATH_WRITE_THRESHOLD - 1; i += 1) {
      recordWorkToolInvocation(state, 'write_file', writeArgs, true, 'ok')
      expect(evaluateWorkLoopNudge(state)).toBeNull()
    }

    recordWorkToolInvocation(state, 'write_file', writeArgs, true, 'ok')
    const nudge = evaluateWorkLoopNudge(state)
    expect(nudge?.kind).toBe('repeated_path_write')
    expect(nudge?.message).toContain('posts.js')
  })

  it('fires each nudge kind at most once', () => {
    const state = createWorkLoopGuardState()
    const readArgs = JSON.stringify({ path: 'root:doc.md' })
    recordWorkToolInvocation(
      state,
      'write_file',
      JSON.stringify({ path: 'root:doc.md', content: 'x' }),
      true,
      'ok',
    )
    recordWorkToolInvocation(state, 'read_file', readArgs, true, 'a')
    recordWorkToolInvocation(state, 'read_file', readArgs, true, 'b')
    recordWorkToolInvocation(state, 'read_file', readArgs, true, 'c')

    const first = evaluateWorkLoopNudge(state)
    expect(first?.kind).toBe('post_write_verify_thrash')
    markWorkLoopNudgeSent(state, first!.kind)

    const second = evaluateWorkLoopNudge(state)
    expect(second?.kind).toBe('repeated_identical_tool')
  })
})