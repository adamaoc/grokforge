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
