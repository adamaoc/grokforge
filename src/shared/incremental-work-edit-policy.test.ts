import { describe, expect, it } from 'vitest'
import {
  INCREMENTAL_EDIT_MID_TURN_NUDGE_MARKER,
  INCREMENTAL_EDIT_POLICY,
  buildIncrementalEditHarnessSections,
  buildIncrementalEditMidTurnNudge,
  isIncrementalEditEnforcementTurn,
  pickIncrementalEditMidTurnNudge,
  resolveIncrementalMaxToolIterations,
} from './incremental-work-edit-policy'
import { WORK_ITERATIVE_EDIT_MARKER } from './iterative-work-edit'
import { resolveIterativeEditScope } from './iterative-edit-scope'

describe('incremental-work-edit-policy', () => {
  it('isIncrementalEditEnforcementTurn is true for either flag', () => {
    expect(
      isIncrementalEditEnforcementTurn({ iterativeWorkEdit: true, postPlanIncremental: false }),
    ).toBe(true)
    expect(
      isIncrementalEditEnforcementTurn({ iterativeWorkEdit: false, postPlanIncremental: true }),
    ).toBe(true)
    expect(
      isIncrementalEditEnforcementTurn({ iterativeWorkEdit: false, postPlanIncremental: false }),
    ).toBe(false)
  })

  it('resolveIncrementalMaxToolIterations caps at policy max', () => {
    expect(resolveIncrementalMaxToolIterations(6, true)).toBe(INCREMENTAL_EDIT_POLICY.maxToolRounds)
    expect(resolveIncrementalMaxToolIterations(6, false)).toBe(6)
  })

  it('buildIncrementalEditHarnessSections includes stable marker', () => {
    const text = buildIncrementalEditHarnessSections().join('\n')
    expect(text).toContain(WORK_ITERATIVE_EDIT_MARKER)
    expect(text).toMatch(/propose_file_edits/i)
    expect(text).not.toContain('## Work iterative search_replace quality')
  })

  it('buildIncrementalEditHarnessSections prefers search_replace for existing files', () => {
    const text = buildIncrementalEditHarnessSections().join('\n')
    expect(text).toMatch(/Default tool \(existing files\)/i)
    expect(text).toMatch(/search_replace/i)
    expect(text).toMatch(/Fallback to `propose_file_edits`/i)
    expect(text).not.toMatch(
      /prefer \*\*one\*\* `propose_file_edits` whose `rawContent` is the \*\*full current file\*\*/i,
    )
  })

  it('buildIncrementalEditHarnessSections discourages destructive rewrites on follow-ups', () => {
    const text = buildIncrementalEditHarnessSections().join('\n')
    expect(text).toMatch(/Conservative edits/i)
    expect(text).toMatch(/read_file.*first in this turn/i)
    expect(text).toMatch(/Strongly discouraged/i)
    expect(text).toMatch(/entire current file/i)
    expect(text).toMatch(/shortened rewrite/i)
    expect(text).toMatch(/destructive shrink/i)
    expect(text).toMatch(/script\.js.*one statement per line/i)
  })

  it('buildIncrementalEditHarnessSections guides structural behavior edits', () => {
    const text = buildIncrementalEditHarnessSections().join('\n')
    expect(text).toMatch(/Structural \/ behavior changes/i)
    expect(text).toMatch(/coordinated pass across 1–2 related files/i)
    expect(text).toMatch(/failed match.*read_file/i)
    expect(text).toMatch(/do not chain blind retries/i)
  })

  it('pickIncrementalEditMidTurnNudge prioritizes stop_reread', () => {
    const kind = pickIncrementalEditMidTurnNudge({
      issued: new Set(),
      searchReplaceCountByPath: new Map([['/tmp/a.js', 2]]),
      toolRoundCount: 0,
      editProposalCreated: false,
      editToolsAttemptedThisTurn: false,
      proposeFileEditsAttempted: false,
      rereadLoopDetected: true,
      pathsReadThisTurn: new Set(),
      lastRoundSearchReplaceOnScopedPath: false,
    })
    expect(kind).toBe('stop_reread')
  })

  it('pickIncrementalEditMidTurnNudge returns commit_proposal after 2 S&R', () => {
    const kind = pickIncrementalEditMidTurnNudge({
      issued: new Set(),
      searchReplaceCountByPath: new Map([['/tmp/script.js', 2]]),
      toolRoundCount: 1,
      editProposalCreated: false,
      editToolsAttemptedThisTurn: true,
      proposeFileEditsAttempted: false,
      rereadLoopDetected: false,
      pathsReadThisTurn: new Set(),
      lastRoundSearchReplaceOnScopedPath: false,
    })
    expect(kind).toBe('commit_proposal')
  })

  it('pickIncrementalEditMidTurnNudge does not commit_proposal after 1 S&R on scoped path', () => {
    const scope = resolveIterativeEditScope({
      userText: 'add localStorage persistence for todos',
    })
    const kind = pickIncrementalEditMidTurnNudge({
      issued: new Set(),
      searchReplaceCountByPath: new Map([['/proj/script.js', 1]]),
      toolRoundCount: 2,
      editProposalCreated: false,
      editToolsAttemptedThisTurn: true,
      proposeFileEditsAttempted: false,
      rereadLoopDetected: false,
      iterativeEditScope: scope,
      pathsReadThisTurn: new Set(['/proj/script.js']),
      lastRoundSearchReplaceOnScopedPath: true,
    })
    expect(kind).toBeNull()
  })

  it('does not re-issue the same kind in one turn', () => {
    const kind = pickIncrementalEditMidTurnNudge({
      issued: new Set(['commit_proposal']),
      searchReplaceCountByPath: new Map([['/tmp/script.js', 2]]),
      toolRoundCount: 3,
      editProposalCreated: false,
      editToolsAttemptedThisTurn: true,
      proposeFileEditsAttempted: false,
      rereadLoopDetected: false,
      pathsReadThisTurn: new Set(),
      lastRoundSearchReplaceOnScopedPath: false,
    })
    expect(kind).toBeNull()
  })

  it('buildIncrementalEditMidTurnNudge includes stable marker', () => {
    expect(buildIncrementalEditMidTurnNudge('commit_proposal')).toContain(
      INCREMENTAL_EDIT_MID_TURN_NUDGE_MARKER,
    )
  })
})
