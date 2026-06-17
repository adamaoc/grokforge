import { describe, expect, it } from 'vitest'
import {
  createPlanLoopGuardState,
  evaluatePlanLoopNudge,
  markPlanLoopNudgeSent,
  recordPlanToolInvocation,
  toolInvocationArgsKey,
} from '../plan-loop-guard'

describe('plan-loop-guard', () => {
  it('builds stable args keys for path tools', () => {
    expect(toolInvocationArgsKey('read_file', JSON.stringify({ path: 'root:architecture.md' }))).toBe(
      'read_file:root:architecture.md',
    )
    expect(toolInvocationArgsKey('list_files', JSON.stringify({ path: '.' }))).toBe('list_files:.')
  })

  it('nudges after repeated failed read_file on the same missing path', () => {
    const state = createPlanLoopGuardState()
    const args = JSON.stringify({ path: 'root:styleguide.md' })

    recordPlanToolInvocation(state, 'read_file', args, false)
    expect(evaluatePlanLoopNudge(state, 2)).toBeNull()

    recordPlanToolInvocation(state, 'read_file', args, false)
    const nudge = evaluatePlanLoopNudge(state, 3)
    expect(nudge?.kind).toBe('missing_file_creation')
    expect(nudge?.message).toContain('root:styleguide.md')
    expect(nudge?.message).toContain('gf-plan')
  })

  it('nudges after repeated identical successful tool calls', () => {
    const state = createPlanLoopGuardState()
    const args = JSON.stringify({ path: 'root:architecture.md' })

    recordPlanToolInvocation(state, 'read_file', args, true)
    recordPlanToolInvocation(state, 'read_file', args, true)
    expect(evaluatePlanLoopNudge(state, 2)).toBeNull()

    recordPlanToolInvocation(state, 'read_file', args, true)
    const nudge = evaluatePlanLoopNudge(state, 3)
    expect(nudge?.kind).toBe('repeated_identical_tool')
    expect(nudge?.message).toContain('read_file:root:architecture.md')
  })

  it('nudges when discovery budget is reached', () => {
    const state = createPlanLoopGuardState()
    const nudge = evaluatePlanLoopNudge(state, 5)
    expect(nudge?.kind).toBe('discovery_budget')
    expect(nudge?.message).toContain('gf-plan')
  })

  it('fires each nudge kind at most once per turn', () => {
    const state = createPlanLoopGuardState()
    const args = JSON.stringify({ path: 'root:styleguide.md' })

    recordPlanToolInvocation(state, 'read_file', args, false)
    recordPlanToolInvocation(state, 'read_file', args, false)

    const first = evaluatePlanLoopNudge(state, 6)
    expect(first?.kind).toBe('missing_file_creation')
    markPlanLoopNudgeSent(state, first!.kind)

    const second = evaluatePlanLoopNudge(state, 6)
    expect(second?.kind).toBe('discovery_budget')
  })

  it('prioritizes missing-file nudge over repeated-tool nudge', () => {
    const state = createPlanLoopGuardState()
    const missing = JSON.stringify({ path: 'root:styleguide.md' })
    const existing = JSON.stringify({ path: 'root:architecture.md' })

    recordPlanToolInvocation(state, 'read_file', missing, false)
    recordPlanToolInvocation(state, 'read_file', missing, false)
    recordPlanToolInvocation(state, 'read_file', existing, true)
    recordPlanToolInvocation(state, 'read_file', existing, true)
    recordPlanToolInvocation(state, 'read_file', existing, true)

    const nudge = evaluatePlanLoopNudge(state, 6)
    expect(nudge?.kind).toBe('missing_file_creation')
  })
})