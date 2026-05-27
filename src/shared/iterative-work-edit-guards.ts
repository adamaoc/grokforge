/**
 * Iterative Work edit thrash guards (story 135).
 * Mid-turn nudges and round cap — enforcement complement to harness 130 copy.
 */

import { EDIT_SEARCH_REPLACE_ESCALATION_MARKER } from './agent-final-answer-contract'

/** Stable marker for eval/tests when iterative thrash nudge is injected. */
export const ITERATIVE_EDIT_THRASH_NUDGE_MARKER = 'Harness: iterative edit thrash'

/** Max tool_sample rounds on iterative Work edit turns (below executor default 6). */
export const ITERATIVE_WORK_MAX_TOOL_ROUNDS = 4

export type IterativeThrashNudgeKind =
  | 'sr_consolidation'
  | 'reread_loop'
  | 'one_proposal'
  | 'discovery_after_edit'

export type PickIterativeThrashNudgeInput = {
  issued: ReadonlySet<IterativeThrashNudgeKind>
  searchReplaceCountByPath: ReadonlyMap<string, number>
  pathsEditedThisTurn: ReadonlySet<string>
  toolRoundCount: number
  editProposalCreated: boolean
  editToolsAttemptedThisTurn: boolean
  proposeFileEditsAttempted: boolean
  readOnlyRoundsAfterFirstEdit: number
  discoverySaturationNudgeIssued: boolean
  rereadLoopDetected: boolean
}

export function resolveIterativeMaxToolIterations(
  baseMax: number,
  iterativeWorkEdit: boolean,
): number {
  return iterativeWorkEdit ? Math.min(baseMax, ITERATIVE_WORK_MAX_TOOL_ROUNDS) : baseMax
}

function hasRepeatedSearchReplaceWithoutPropose(input: PickIterativeThrashNudgeInput): boolean {
  if (input.proposeFileEditsAttempted) return false
  for (const count of input.searchReplaceCountByPath.values()) {
    if (count >= 2) return true
  }
  return false
}

/** At most one kind per call; priority: reread → S&R consolidation → one proposal → discovery after edit. */
export function pickIterativeThrashNudge(
  input: PickIterativeThrashNudgeInput,
): IterativeThrashNudgeKind | null {
  if (!input.issued.has('reread_loop') && input.rereadLoopDetected) {
    return 'reread_loop'
  }
  if (!input.issued.has('sr_consolidation') && hasRepeatedSearchReplaceWithoutPropose(input)) {
    return 'sr_consolidation'
  }
  if (
    !input.issued.has('one_proposal') &&
    input.toolRoundCount >= 3 &&
    input.editToolsAttemptedThisTurn &&
    !input.editProposalCreated
  ) {
    return 'one_proposal'
  }
  if (
    !input.issued.has('discovery_after_edit') &&
    input.editToolsAttemptedThisTurn &&
    input.readOnlyRoundsAfterFirstEdit >= 2 &&
    !input.discoverySaturationNudgeIssued
  ) {
    return 'discovery_after_edit'
  }
  return null
}

export function iterativeThrashNudgeActivityDetail(kind: IterativeThrashNudgeKind): string {
  switch (kind) {
    case 'sr_consolidation':
      return 'Multiple search_replace on the same file — combine into one patch or one propose_file_edits.'
    case 'reread_loop':
      return 'Stop re-reading a file you already edited this turn — finalize the proposal or one corrective patch.'
    case 'one_proposal':
      return 'Several edit rounds without a reviewable proposal — use propose_file_edits now.'
    case 'discovery_after_edit':
      return 'You already attempted edits — stop read-only discovery and commit one proposal.'
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }
}

/** User message injected once per thrash kind per turn. */
export function buildIterativeEditThrashNudge(kind: IterativeThrashNudgeKind): string {
  const header = `## ${ITERATIVE_EDIT_THRASH_NUDGE_MARKER}`
  switch (kind) {
    case 'sr_consolidation':
      return [
        header,
        'You called **`search_replace`** on the same path more than once this turn without **`propose_file_edits`**.',
        'Combine the change into **one** larger `old_string` / `new_string`, or use **one** `propose_file_edits` with full `rawContent` from the latest `read_file`.',
        'After 2 failed search_replace on a path, full-file propose_file_edits is mandatory (' +
          EDIT_SEARCH_REPLACE_ESCALATION_MARKER +
          ').',
        'Follow **Work iterative edit (harness 130)** — one reviewable proposal per turn.',
      ].join('\n')
    case 'reread_loop':
      return [
        header,
        'You called **`read_file`** on a path you already edited this turn.',
        'Do **not** re-read edited paths unless `search_replace` failed — finalize **`propose_file_edits`** or one corrective patch.',
        'Follow **Work surgical edit (harness 135)** — commit one proposal, then stream the final answer.',
      ].join('\n')
    case 'one_proposal':
      return [
        header,
        'This turn has **3+** tool rounds with edit attempts but **no** reviewable edit proposal yet.',
        'Use **one** `propose_file_edits` with complete file bodies from `read_file` **`rawContent`** — one proposal per turn.',
        'For localStorage / persistence features on vanilla apps, prefer one proposal on **`script.js`** (or the active file) after a single `read_file`.',
      ].join('\n')
    case 'discovery_after_edit':
      return [
        header,
        'You already attempted edits this turn but returned to read-only tools.',
        'Stop discovery — use **`propose_file_edits`** or **`search_replace`** now with evidence from files already read.',
        'Follow **Work iterative edit (harness 130)** — at most two read-only rounds before the first edit.',
      ].join('\n')
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }
}
