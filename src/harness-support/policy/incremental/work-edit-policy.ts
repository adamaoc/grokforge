/**
 * Consolidated incremental Work edit policy (story 144).
 * Single source for enforcement flag, turn caps, merged harness copy, and mid-turn nudges.
 */

import { EDIT_SEARCH_REPLACE_ESCALATION_MARKER } from '../final-answer/final-answer-contract'
import {
  buildIterativeEditScopeSections,
  type IterativeEditScope,
} from '../../routing/iterative-edit-scope'
import { POPULATED_WORK_EDIT_MARKER } from '../../routing/populated-workspace-edit'
import {
  INCREMENTAL_EDIT_CONSERVATIVE_LINES,
  INCREMENTAL_EDIT_STRUCTURAL_CHANGE_LINES,
  WORK_ITERATIVE_EDIT_MARKER,
  WORK_SURGICAL_EDIT_MARKER,
} from '../../routing/iterative-work-edit'

export { INCREMENTAL_EDIT_CONSERVATIVE_LINES, INCREMENTAL_EDIT_STRUCTURAL_CHANGE_LINES } from '../../routing/iterative-work-edit'

/** Re-export for guards/tests that import round cap from here. */
export const INCREMENTAL_EDIT_MAX_TOOL_ROUNDS = 4 as const

export const INCREMENTAL_EDIT_POLICY = {
  maxToolRounds: INCREMENTAL_EDIT_MAX_TOOL_ROUNDS,
  discoverySaturationMinRounds: 2,
  maxMidTurnNudges: 1,
} as const

/** Stable marker in mid-turn nudge body (kept from story 135 for eval compatibility). */
export const INCREMENTAL_EDIT_MID_TURN_NUDGE_MARKER = 'Harness: iterative edit thrash'

export type IncrementalEditMidTurnNudgeKind = 'stop_reread' | 'commit_proposal'

export function isIncrementalEditEnforcementTurn(ctx: {
  iterativeWorkEdit: boolean
  postPlanIncremental: boolean
}): boolean {
  return ctx.iterativeWorkEdit === true || ctx.postPlanIncremental === true
}

export function resolveIncrementalMaxToolIterations(
  baseMax: number,
  incrementalEditEnforcement: boolean,
): number {
  return incrementalEditEnforcement
    ? Math.min(baseMax, INCREMENTAL_EDIT_MAX_TOOL_ROUNDS)
    : baseMax
}

export type BuildIncrementalEditHarnessSectionsInput = {
  activeFilePath?: string | null
  iterativeEditScope?: IterativeEditScope
}

/** Merged iterative Work appendix (130+135+139) — no separate S&R section array. */
export function buildIncrementalEditHarnessSections(
  input: BuildIncrementalEditHarnessSectionsInput = {},
): readonly string[] {
  const activeHint = input.activeFilePath?.trim()
    ? `Active file in editor: **${input.activeFilePath.trim()}** — read it first when relevant.`
    : ''
  const sections: string[] = [
    WORK_ITERATIVE_EDIT_MARKER,
    WORK_SURGICAL_EDIT_MARKER,
    POPULATED_WORK_EDIT_MARKER,
    ...INCREMENTAL_EDIT_CONSERVATIVE_LINES,
    ...INCREMENTAL_EDIT_STRUCTURAL_CHANGE_LINES,
    'This is an **existing project** — do **not** emit a new `gf-plan` or replan from scratch.',
    '**Turn goal:** One user request → one reviewable edit proposal (typically via the primary **`edit`** tool, occasionally a focused `propose_file_edits` for new files or large refactors). When closely-related changes belong together, group them in one tool call (multiple edits[] entries for the same file, or a small multi-file batch).',
    '**Default (and strongly preferred) tool for modifications to existing files:** After **one** `read_file` per path, use the **`edit`** tool with a precise `edits[]` array (oldText/newText pairs matched against the original snapshot). This is the Pi-style primitive that produces the cleanest, most reliable results. Multiple related adjustments belong in a single `edit` call. For small, localized, incremental changes on existing files, **do not** default to full `propose_file_edits` — stay surgical with `edit`.',
    'Use `propose_file_edits` (write_file) **only** when the path is **new**, or when the user explicitly requests a deliberate full rewrite / major refactor. For routine modifications or small follow-ups on existing files, full-file proposals are strongly discouraged.',
    'Preserve or extend working code on existing files. Dramatic shrink proposals are blocked by the harness unless the user explicitly requested a rewrite.',
    activeHint,
    'If **Active file** is set in context, `read_file` that path first before broad discovery.',
    `Spend at most **${INCREMENTAL_EDIT_POLICY.discoverySaturationMinRounds}** read-only tool rounds before the first edit on this turn.`,
    'When editing a crushed or minified script: `read_file`, then use **`edit`** with clean, properly formatted replacement block(s) (one statement per line). GrokForge now applies strict formatting rules on medium+ files — any remaining glued or minified output after normalization will be hard-rejected. Escalate to full `propose_file_edits` **only** after repeated `edit` tool failures on this path this turn, or if the user explicitly asked for a rewrite.',
    'Do **not** re-read a path you already successfully edited this turn.',
    'Touch at most **2–3 paths** per turn unless the user listed more.',
    'Call **`run_command`** only when the user or plan implies install, scaffold, git, or verify — not for pure UI or component edits.',
  ]
  if (input.iterativeEditScope) {
    sections.push(...buildIterativeEditScopeSections(input.iterativeEditScope))
  }
  return sections.filter((s) => s.trim().length > 0)
}

/** One-line cross-reference for post-plan incremental turns (story 144). */
export const POST_PLAN_INCREMENTAL_ENFORCEMENT_LINE =
  'Same turn contract as Work iterative edits: one reviewable proposal via the primary `edit` tool for modifications on existing files (strongly preferred for incremental changes). Use propose_file_edits only for new files or explicit large rewrites. At most two read-only discovery rounds.'

export type PickIncrementalEditMidTurnNudgeInput = {
  issued: ReadonlySet<IncrementalEditMidTurnNudgeKind>
  searchReplaceCountByPath: ReadonlyMap<string, number>
  toolRoundCount: number
  editProposalCreated: boolean
  editToolsAttemptedThisTurn: boolean
  proposeFileEditsAttempted: boolean
  rereadLoopDetected: boolean
  iterativeEditScope?: IterativeEditScope
  pathsReadThisTurn: ReadonlySet<string>
  lastRoundSearchReplaceOnScopedPath: boolean
}

function hasRepeatedSearchReplaceWithoutPropose(
  input: PickIncrementalEditMidTurnNudgeInput,
): boolean {
  if (input.proposeFileEditsAttempted) return false
  for (const count of input.searchReplaceCountByPath.values()) {
    if (count >= 2) return true
  }
  return false
}

function shouldCommitProposalNudge(input: PickIncrementalEditMidTurnNudgeInput): boolean {
  if (input.editProposalCreated) return false
  if (hasRepeatedSearchReplaceWithoutPropose(input)) return true
  if (
    input.toolRoundCount >= 3 &&
    input.editToolsAttemptedThisTurn &&
    !input.editProposalCreated
  ) {
    return true
  }
  const scope = input.iterativeEditScope
  if (!scope || input.proposeFileEditsAttempted) return false
  if (scope.kind === 'single_file' && input.pathsReadThisTurn.size >= 2) {
    return true
  }
  return false
}

/** At most one kind per call; priority: stop_reread → commit_proposal. */
export function pickIncrementalEditMidTurnNudge(
  input: PickIncrementalEditMidTurnNudgeInput,
): IncrementalEditMidTurnNudgeKind | null {
  if (!input.issued.has('stop_reread') && input.rereadLoopDetected) {
    return 'stop_reread'
  }
  if (!input.issued.has('commit_proposal') && shouldCommitProposalNudge(input)) {
    return 'commit_proposal'
  }
  return null
}

export function incrementalEditMidTurnNudgeActivityDetail(
  kind: IncrementalEditMidTurnNudgeKind,
): string {
  switch (kind) {
    case 'stop_reread':
      return 'Stop re-reading a file you already edited this turn — finalize the proposal or one corrective patch.'
    case 'commit_proposal':
      return 'After repeated surgical edit failures, consider one focused full-section edit — but prefer retrying the `edit` tool with better excerpts from rawContent first.'
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }
}

export function buildIncrementalEditMidTurnNudge(
  kind: IncrementalEditMidTurnNudgeKind,
  scope?: IterativeEditScope,
): string {
  const header = `## ${INCREMENTAL_EDIT_MID_TURN_NUDGE_MARKER}`
  const pathHint =
    scope?.likelyPaths.length && scope.likelyPaths[0]
      ? `\`${scope.likelyPaths[0]}\``
      : 'the target file'
  switch (kind) {
    case 'stop_reread':
      return [
        header,
        'You called **`read_file`** on a path you already edited this turn.',
        'Do **not** re-read paths you already edited this turn. Use the `edit` tool for modifications; escalate to propose only for new/large-refactor cases.',
        'Follow **Work iterative edit (harness 130)** — commit one proposal, then stream the final answer.',
      ].join('\n')
    case 'commit_proposal':
      return [
        header,
        `Repeated surgical \`edit\` tool failures on ${pathHint} — re-read the relevant section from \`rawContent\`, then retry with precise \`edit\` {edits[]} using better unique context. Only consider one clean \`propose_file_edits\` if the change is large/structural or the user explicitly asked for a rewrite.`,
        scope?.rationale ?? 'One reviewable proposal per turn.',
        `Stay surgical with the \`edit\` tool unless the scope genuinely requires a broader rewrite (${EDIT_SEARCH_REPLACE_ESCALATION_MARKER}).`,
      ].join('\n')
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }
}
