/**
 * Post-plan incremental follow-up heuristics (story 120).
 */

import { isLikelyEditIntent } from '../../policy/final-answer/final-answer-contract'
import type { GreenfieldIndexFile, GreenfieldIndexSnapshot } from '../../context/workspace-greenfield'
import { countNonTrivialIndexFiles, nonTrivialIndexFiles } from '../../context/workspace-greenfield'

/** Stable marker for eval/tests (must appear in post-plan harness appendix). */
export const POST_PLAN_INCREMENTAL_MARKER = '## Post-plan incremental follow-up (harness 120)'

/** Stable marker for single-file edit bias appendix. */
export const SINGLE_FILE_EDIT_BIAS_MARKER = '## Single-file workspace edit bias (harness 120)'

/** Max user message length for incremental follow-up routing. */
export const INCREMENTAL_FOLLOW_UP_MAX_CHARS = 320

export const REPLAN_REQUEST_RE =
  /\b(new\s+plan|re-?plan|plan\s+again|plan\s+out|from\s+scratch|start\s+over|rewrite\s+the\s+plan|fresh\s+plan|blank\s+(app|project|workspace)|empty\s+(folder|workspace|repo|project)|no\s+files\s+yet)\b/i

export const GREENFIELD_CREATE_REQUEST_RE =
  /\b(blank\s+(app|project|workspace)|empty\s+(folder|workspace|repo|project)|from\s+scratch|start\s+over|create\s+(a\s+)?(new\s+)?(app|site|project)|build\s+(a\s+)?(new\s+)?(app|site|project)|no\s+files\s+yet)\b/i

export function isReplanRequestUserText(userText: string): boolean {
  return REPLAN_REQUEST_RE.test(userText.trim())
}

export function isGreenfieldCreateRequestUserText(userText: string): boolean {
  return GREENFIELD_CREATE_REQUEST_RE.test(userText.trim())
}

export function shouldRoutePostPlanIncremental(input: {
  chatMode: 'fast' | 'plan'
  isApprovedPlanAutoRun?: boolean
  hasCompletedPlan: boolean
  isGreenfieldWorkspace?: boolean
  userText: string
}): boolean {
  return (
    input.chatMode === 'fast' &&
    input.isApprovedPlanAutoRun !== true &&
    input.hasCompletedPlan &&
    input.isGreenfieldWorkspace !== true &&
    isIncrementalFollowUpUserText(input.userText)
  )
}

export function isIncrementalFollowUpUserText(userText: string): boolean {
  const trimmed = userText.trim()
  if (trimmed.length === 0 || trimmed.length > INCREMENTAL_FOLLOW_UP_MAX_CHARS) return false
  if (isReplanRequestUserText(trimmed)) return false
  return isLikelyEditIntent(trimmed)
}

export function isSingleFilePrimaryWorkspace(index: GreenfieldIndexSnapshot | null): boolean {
  if (!index) return false
  return countNonTrivialIndexFiles(index.intelligence.files) === 1
}

export function primaryNonTrivialFile(
  index: GreenfieldIndexSnapshot | null,
): GreenfieldIndexFile | null {
  if (!index) return null
  const nonTrivial = nonTrivialIndexFiles(index.intelligence.files)
  return nonTrivial.length === 1 ? (nonTrivial[0] ?? null) : null
}
