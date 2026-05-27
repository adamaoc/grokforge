/**
 * Iterative Work-mode edit routing (story 130).
 * Broader than populated-workspace (129): any non-greenfield repo + edit intent.
 */

import { isBootstrapScaffoldUserText } from './agent-command-intent'
import { isLikelyEditIntent } from './agent-final-answer-contract'
import { isReplanRequestUserText } from './post-plan-incremental'
import {
  isGreenfieldWorkspace,
  type GreenfieldIndexSnapshot,
} from './workspace-greenfield'

/** Stable marker for eval/tests (must appear in iterative Work harness appendix). */
export const WORK_ITERATIVE_EDIT_MARKER = '## Work iterative edit (harness 130)'

/** Surgical edit enforcement appendix (story 135). */
export const WORK_SURGICAL_EDIT_MARKER = '## Work surgical edit (harness 135)'

/** Shared conservative edit rules for post-plan and iterative Work follow-ups. */
export const INCREMENTAL_EDIT_CONSERVATIVE_LINES: readonly string[] = [
  '**Conservative edits:** This is a **small follow-up** on working code — **add or adjust only what the request needs**; keep every unrelated line identical to `read_file` **`rawContent`**.',
  'On every **existing** file you change: call `read_file` on that path **first in this turn** (or reuse content from the immediately prior tool round) **before** `propose_file_edits` or `search_replace` — never guess or reconstruct the file from memory.',
  '**Strongly discouraged:** Full-file rewrites, deleting most of the file, or shrinking a multi-line script/HTML file to one or two lines when the user asked to **add**, **persist**, **fix**, or **tweak** something — GrokForge rejects proposals that remove large sections.',
  'On follow-up edits to **existing** files, default to **`search_replace`** on a block copied from **`rawContent`** — change only what the request needs; do not drop functions, listeners, or markup the user did not ask to remove.',
  'A full-file `propose_file_edits` means the **entire current file** from `read_file` plus your **small patch** — not a stub, shortcut, or shortened rewrite that drops existing functions or markup.',
  '**`.js` full-file writes:** draft readable multi-line source in the tool call (one statement per line). GrokForge rejects crushed one-liners, glued statements, code after `//` on the same line, and orphan `)` lines — match **Agent tool loop** code-layout rules.',
]

/** Behavior / DOM-logic follow-ups (remove button, handlers, changing existing functions). */
export const INCREMENTAL_EDIT_STRUCTURAL_CHANGE_LINES: readonly string[] = [
  '**Default tool for existing files:** `search_replace` with exact `old_string` from `rawContent`; use `propose_file_edits` only when fallback conditions in the Work iterative edit appendix apply.',
  '**Structural / behavior changes** (new control wiring, remove/delete, changing an existing function or event flow): keep patches **surgical** — one contiguous block per file from **`rawContent`**. When the ask clearly spans markup and script (e.g. a new button **and** its handler, or title + related styling), **one coordinated pass across 1–2 related files** this turn is fine; split only unrelated multi-feature work (e.g. persistence **plus** a separate restyle).',
  'After **one** `read_file` per path you will change, patch **one contiguous block** you copied from **`rawContent`** (a full function, listener setup, or list-item template) — not several guessed fragments across the file.',
  'For `search_replace`: `old_string` must match **exactly** (whitespace included) from the latest `read_file`; include the **whole** function or DOM block you are changing. A failed match **is** a reason to `read_file` again (`startLine` / `maxLines` on that section if helpful), then **one** corrected `search_replace` or **one** full-file `propose_file_edits` — do not chain blind retries.',
  'When markup and script both need changes, touch **at most 1–2 related paths** (e.g. `index.html` + `script.js`) in one turn — `read_file` each once, then propose coordinated edits; avoid ping-ponging reads/edits across more files.',
]

export function shouldRouteIterativeWorkExecutor(input: {
  chatMode: 'fast' | 'plan'
  isApprovedPlanAutoRun?: boolean
  postPlanIncremental?: boolean
  userText: string
  index: GreenfieldIndexSnapshot | null
  retrievalMatchCount?: number
}): boolean {
  if (input.chatMode !== 'fast') return false
  if (input.isApprovedPlanAutoRun === true) return false
  if (input.postPlanIncremental === true) return false
  const trimmed = input.userText.trim()
  if (trimmed.length === 0) return false
  if (isReplanRequestUserText(trimmed)) return false
  if (isBootstrapScaffoldUserText(trimmed)) return false
  if (!isLikelyEditIntent(trimmed)) return false
  if (
    isGreenfieldWorkspace({
      index: input.index,
      retrievalMatchCount: input.retrievalMatchCount ?? 0,
    })
  ) {
    return false
  }
  return true
}
