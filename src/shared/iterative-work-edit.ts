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

/** Pre-sample nudge marker for localized UI edits (story 139). */
export const LOCALIZED_UI_EDIT_PRE_SAMPLE_MARKER = 'Harness: localized UI edit 139'

const LOCALIZED_UI_EDIT_RES =
  /\b(add\s+.*button|remove\s+todo|delete\s+button|click handler)\b/i

function basenameFromPath(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean)
  return parts[parts.length - 1] ?? path
}

/** True when user text looks like a small localized UI/handler edit (story 139). */
export function isLocalizedUiEditIntent(userText: string): boolean {
  return LOCALIZED_UI_EDIT_RES.test(userText.trim())
}

export type LocalizedUiEditPreSampleNudgeInput = {
  activeFilePath?: string | null
  likelyPathBasename?: string | null
}

/** One-shot hint before first tool sample on localized iterative Work edits (story 139). */
export function buildLocalizedUiEditPreSampleNudge(
  input: LocalizedUiEditPreSampleNudgeInput = {},
): string {
  const fromScope = input.likelyPathBasename?.trim()
  const fromActive = input.activeFilePath?.trim()
    ? basenameFromPath(input.activeFilePath.trim())
    : null
  const targetFile = fromScope || fromActive || 'script.js'
  return [
    `## ${LOCALIZED_UI_EDIT_PRE_SAMPLE_MARKER}`,
    `Localized UI edit — \`read_file\` **${targetFile}** (or the active file), then one precise \`search_replace\` with a multi-line \`old_string\` copied from \`rawContent\`, or \`propose_file_edits\` if the file is short or one long line.`,
  ].join('\n')
}

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
