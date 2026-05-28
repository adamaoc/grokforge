/**
 * Consolidated incremental Work edit policy (story 144).
 * Single source for enforcement flag, turn caps, merged harness copy, and mid-turn nudges.
 */

import { EDIT_SEARCH_REPLACE_ESCALATION_MARKER } from './agent-final-answer-contract'
import {
  buildIterativeEditScopeSections,
  type IterativeEditScope,
} from './iterative-edit-scope'
import { POPULATED_WORK_EDIT_MARKER } from './populated-workspace-edit'
import {
  INCREMENTAL_EDIT_CONSERVATIVE_LINES,
  INCREMENTAL_EDIT_STRUCTURAL_CHANGE_LINES,
  WORK_ITERATIVE_EDIT_MARKER,
  WORK_SURGICAL_EDIT_MARKER,
} from './iterative-work-edit'

export { INCREMENTAL_EDIT_CONSERVATIVE_LINES, INCREMENTAL_EDIT_STRUCTURAL_CHANGE_LINES } from './iterative-work-edit'

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
    '**Turn goal:** One user request → one reviewable edit proposal (merged **`search_replace`** patches and/or **`propose_file_edits`** — often **1–2 related files**). When changes are closely related and part of the same request, group them in that single proposal; split only unrelated work across turns.',
    '**Default tool (existing files):** After **one** `read_file` per path, use **`search_replace`** (or one `propose_file_edits`) with an exact `old_string` from **`rawContent`** for small/medium localized changes. When the request describes several closely-related adjustments that form one logical unit (title + styling, feature + handler, etc.), include the coordinated pieces together in the same proposal rather than one tiny piece per turn.',
    '**Fallback to `propose_file_edits` only when:** the path is **new**; the change is large/structural across many regions where multiple S&R would be worse; the file is crushed/one long line or under ~20 lines; or **≥2** failed `search_replace` on that path this turn.',
    'Do **not** use `propose_file_edits` to replace an existing multi-line file with a 1–2 line stub when a targeted `search_replace` would suffice — GrokForge rejects destructive shrink proposals.',
    'If the user asked to **add** or **tweak** something, proposals on existing files must **preserve or extend** working code — dramatic shrink (>50% lines/chars) is blocked unless they explicitly asked for a rewrite.',
    activeHint,
    'If **Active file** is set in context, `read_file` that path first before broad `search_workspace` / `list_directory`.',
    `Spend at most **${INCREMENTAL_EDIT_POLICY.discoverySaturationMinRounds}** read-only tool rounds before the first edit on this turn.`,
    'When (re)building **`script.js`** or rewriting a crushed script: send the **complete** file with real line breaks in `write_file.content` — never paste a minified one-liner; if validation failed once, fix formatting (one statement per line) before retrying logic.',
    'Up to **2** `search_replace` calls per path per turn when the ask needs two localized regions; after **2 failed** matches on a path, escalate to **one** full-file `propose_file_edits` from `read_file` **`rawContent`**.',
    'Do **not** call `read_file` again on a path you already edited this turn unless `search_replace` failed on that path.',
    `After **2** failed \`search_replace\` on a path, use one full-file \`propose_file_edits\` from \`read_file\` **\`rawContent\`** (${EDIT_SEARCH_REPLACE_ESCALATION_MARKER}).`,
    'When using `search_replace`: copy `old_string` only from `read_file` **`rawContent`**; include 3–8 complete context lines; pass `expectedContentHash`. Skip S&R when the file is one long line or under ~20 lines — use `propose_file_edits` instead.',
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
  'Same turn contract as Work iterative edits: one reviewable proposal, at most two read-only discovery rounds, then commit **`search_replace`** or **`propose_file_edits`**.'

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
      return 'Escalate to one full-file propose_file_edits from rawContent after repeated search_replace failures.'
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
        'Do **not** re-read edited paths unless `search_replace` failed — finalize with one corrective **`search_replace`** or escalate to **`propose_file_edits`**.',
        'Follow **Work iterative edit (harness 130)** — commit one proposal, then stream the final answer.',
      ].join('\n')
    case 'commit_proposal':
      return [
        header,
        `Repeated \`search_replace\` failures or edit thrash on ${pathHint} — **escalate** to **one** \`propose_file_edits\` with complete \`rawContent\` from the latest \`read_file\`.`,
        scope?.rationale ?? 'One reviewable proposal per turn.',
        `After 2 failed search_replace on a path, full-file propose_file_edits is mandatory (${EDIT_SEARCH_REPLACE_ESCALATION_MARKER}).`,
      ].join('\n')
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }
}
