import { describe, expect, it } from 'vitest'
import {
  buildIterativeEditThrashNudge,
  ITERATIVE_EDIT_THRASH_NUDGE_MARKER,
  ITERATIVE_WORK_MAX_TOOL_ROUNDS,
  pickIterativeThrashNudge,
  resolveIterativeMaxToolIterations,
  type PickIterativeThrashNudgeInput,
} from './iterative-work-edit-guards'

function baseInput(
  overrides: Partial<PickIterativeThrashNudgeInput> = {},
): PickIterativeThrashNudgeInput {
  return {
    issued: new Set(),
    searchReplaceCountByPath: new Map(),
    pathsEditedThisTurn: new Set(),
    toolRoundCount: 0,
    editProposalCreated: false,
    editToolsAttemptedThisTurn: false,
    proposeFileEditsAttempted: false,
    readOnlyRoundsAfterFirstEdit: 0,
    discoverySaturationNudgeIssued: false,
    rereadLoopDetected: false,
    ...overrides,
  }
}

describe('iterative-work-edit-guards', () => {
  it('caps max tool rounds at 4 for iterative Work', () => {
    expect(resolveIterativeMaxToolIterations(6, true)).toBe(ITERATIVE_WORK_MAX_TOOL_ROUNDS)
    expect(resolveIterativeMaxToolIterations(6, false)).toBe(6)
    expect(resolveIterativeMaxToolIterations(3, true)).toBe(3)
  })

  it('pickIterativeThrashNudge prioritizes reread_loop over sr_consolidation', () => {
    const kind = pickIterativeThrashNudge(
      baseInput({
        rereadLoopDetected: true,
        searchReplaceCountByPath: new Map([['/tmp/a.js', 2]]),
      }),
    )
    expect(kind).toBe('reread_loop')
  })

  it('pickIterativeThrashNudge returns sr_consolidation after 2 S&R on same path', () => {
    const kind = pickIterativeThrashNudge(
      baseInput({
        searchReplaceCountByPath: new Map([['/tmp/script.js', 2]]),
      }),
    )
    expect(kind).toBe('sr_consolidation')
  })

  it('pickIterativeThrashNudge skips sr_consolidation when propose_file_edits was attempted', () => {
    const kind = pickIterativeThrashNudge(
      baseInput({
        proposeFileEditsAttempted: true,
        searchReplaceCountByPath: new Map([['/tmp/script.js', 2]]),
      }),
    )
    expect(kind).toBeNull()
  })

  it('pickIterativeThrashNudge returns one_proposal after 3 rounds with edits and no proposal', () => {
    const kind = pickIterativeThrashNudge(
      baseInput({
        toolRoundCount: 3,
        editToolsAttemptedThisTurn: true,
      }),
    )
    expect(kind).toBe('one_proposal')
  })

  it('pickIterativeThrashNudge returns discovery_after_edit after edit attempt + 2 read-only rounds', () => {
    const kind = pickIterativeThrashNudge(
      baseInput({
        editToolsAttemptedThisTurn: true,
        readOnlyRoundsAfterFirstEdit: 2,
      }),
    )
    expect(kind).toBe('discovery_after_edit')
  })

  it('does not re-issue the same kind in one turn', () => {
    const kind = pickIterativeThrashNudge(
      baseInput({
        issued: new Set(['sr_consolidation']),
        searchReplaceCountByPath: new Map([['/tmp/script.js', 2]]),
      }),
    )
    expect(kind).toBeNull()
  })

  it('buildIterativeEditThrashNudge includes stable marker', () => {
    expect(buildIterativeEditThrashNudge('sr_consolidation')).toContain(
      ITERATIVE_EDIT_THRASH_NUDGE_MARKER,
    )
  })
})
