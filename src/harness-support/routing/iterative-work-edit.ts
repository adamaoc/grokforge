/**
 * Iterative Work-mode edit routing (story 130).
 * Broader than populated-workspace (129): any non-greenfield repo + edit intent.
 */

import { isBootstrapScaffoldUserText } from './command-intent'
import { isLikelyEditIntent } from '../policy/final-answer/final-answer-contract'
import { isReplanRequestUserText } from '../plan/routing/post-plan-incremental'
import {
  isGreenfieldWorkspace,
  type GreenfieldIndexSnapshot,
} from '../context/workspace-greenfield'

/** Stable marker for eval/tests (must appear in iterative Work harness appendix). */
export const WORK_ITERATIVE_EDIT_MARKER = '## Work iterative edit (harness 130)'

/** Surgical edit enforcement appendix (story 135). */
export const WORK_SURGICAL_EDIT_MARKER = '## Work surgical edit (harness 135)'

/** Shared conservative edit rules for post-plan and iterative Work follow-ups. */
export const INCREMENTAL_EDIT_CONSERVATIVE_LINES: readonly string[] = [
  '**Conservative edits:** This is a **small follow-up** on working code — **add or adjust only what the request needs**; keep every unrelated line identical to `read_file` **`rawContent`**.',
  'On every **existing** file you change: call `read_file` on that path **first in this turn** **before** using `edit`, legacy search_replace, or propose_file_edits write_file — never guess.',
  '**Strongly discouraged:** Full-file rewrites or shrinking working files when the user asked to add/fix/tweak — GrokForge blocks large destructive shrinks unless explicitly requested.',
  'On follow-up modifications to **existing** files, default to the primary **`edit`** tool (precise oldText/newText from rawContent, multiple entries allowed in one call for related changes). Change only what the request needs. Do **not** jump to full `propose_file_edits` for small incremental changes.',
  'Reserve `propose_file_edits` write_file **only** for new files or when the user explicitly requests a deliberate full rewrite / major refactor of an existing file.',
  '**All edit output (newText or write_file):** must be clean readable multi-line source (one statement per line). GrokForge rejects crushed/minified proposals.',
]

/** Behavior / DOM-logic follow-ups (remove button, handlers, changing existing functions). */
export const INCREMENTAL_EDIT_STRUCTURAL_CHANGE_LINES: readonly string[] = [
  '**Default tool for modifications to existing files:** the primary **`edit`** tool with precise oldText/newText pairs from `rawContent` (one call can contain multiple related replacements). For incremental post-plan or Work turns, strongly prefer the `edit` tool over full `propose_file_edits` unless the user explicitly asked for a rewrite or the change is large/structural across many regions.',
  '**Structural / behavior changes** (new control wiring, remove/delete, changing an existing function or event flow): keep changes **surgical and precise** using the `edit` tool. When the ask spans markup + script in related ways, include the coordinated replacements together in **one** `edit` call (multiple edits[] entries) or a small focused batch. Split only truly unrelated work.',
  'After **one** `read_file` per path, target **contiguous, unique blocks** from **`rawContent`** with `edit`. A failed match is a reason to re-read the exact section, then issue a corrected `edit` with better context in oldText.',
  'When markup and script both need changes, touch **at most 1–2 related paths** in one turn — read each once, then use `edit` (preferred) for the coordinated modifications.',
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
