/**
 * Populated (non-greenfield) workspace edit routing (story 129).
 */

import { isLikelyEditIntent } from './agent-final-answer-contract'
import { isReplanRequestUserText } from './post-plan-incremental'
import {
  GREENFIELD_MAX_SCANNED_FILES,
  hasPackageJson,
  type GreenfieldIndexSnapshot,
} from './workspace-greenfield'

/** Stable marker for eval/tests (must appear in populated-work harness appendix). */
export const POPULATED_WORK_EDIT_MARKER = '## Populated workspace iterative edit (harness 129)'

export function isPopulatedWorkspace(index: GreenfieldIndexSnapshot | null): boolean {
  if (!index) return false
  if (hasPackageJson(index.intelligence.packages)) return true
  return index.intelligence.stats.fileCountScanned > GREENFIELD_MAX_SCANNED_FILES
}

export function shouldRoutePopulatedWorkExecutor(input: {
  chatMode: 'fast' | 'plan'
  isApprovedPlanAutoRun?: boolean
  postPlanIncremental?: boolean
  userText: string
  index: GreenfieldIndexSnapshot | null
}): boolean {
  if (input.chatMode !== 'fast') return false
  if (input.isApprovedPlanAutoRun === true) return false
  if (input.postPlanIncremental === true) return false
  if (!isPopulatedWorkspace(input.index)) return false
  const trimmed = input.userText.trim()
  if (trimmed.length === 0) return false
  if (isReplanRequestUserText(trimmed)) return false
  return isLikelyEditIntent(trimmed)
}
