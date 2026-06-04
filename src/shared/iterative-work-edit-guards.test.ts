import { describe, expect, it } from 'vitest'
import {
  INCREMENTAL_EDIT_POLICY,
  resolveIncrementalMaxToolIterations,
} from '../harness/policy/incremental/work-edit-policy'
import {
  ITERATIVE_WORK_MAX_TOOL_ROUNDS,
  resolveIterativeMaxToolIterations,
} from '../harness/policy/incremental/work-edit-guards'

describe('iterative-work-edit-guards', () => {
  it('re-exports round cap from incremental policy (144)', () => {
    expect(ITERATIVE_WORK_MAX_TOOL_ROUNDS).toBe(INCREMENTAL_EDIT_POLICY.maxToolRounds)
    expect(resolveIterativeMaxToolIterations(6, true)).toBe(ITERATIVE_WORK_MAX_TOOL_ROUNDS)
    expect(resolveIterativeMaxToolIterations(6, false)).toBe(6)
    expect(resolveIterativeMaxToolIterations(3, true)).toBe(3)
  })
})
