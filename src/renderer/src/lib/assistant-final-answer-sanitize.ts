import type { AgentChatActivityPayload } from '../../../shared/agent/chat-contract'
import {
  turnHadAcceptedEditProposal,
  turnHadFailedEditActivities,
} from '../../../shared/agent/activity-display'
import {
  FAILED_EDIT_FINAL_ANSWER_MAX_REFERENCE_CHARS,
  FAILED_EDIT_FINAL_ANSWER_MAX_REFERENCE_LINES,
} from '../../../harness-support/policy/final-answer/final-answer-contract'

/** Display-time context for failed-edit final-answer fence guard (story 164). */
export type FailedEditFinalAnswerDisplayContext = {
  hadEditFailures: boolean
  editProposalCreated: boolean
  chatMode?: 'plan' | 'fast'
}

export const FAILED_EDIT_FENCE_REMOVED_PLACEHOLDER =
  'Code block removed — edit tools did not succeed; nothing was written to disk. See the failure summary above or **Last agent turn trace** in the header menu.'

const FENCE_RE = /```[\s\S]*?```/g

/** True when a fenced block exceeds story 152 unapplied-reference caps. */
export function fenceExceedsFailedEditReferenceCap(fence: string): boolean {
  const lineCount = fence.split('\n').length
  return (
    lineCount > FAILED_EDIT_FINAL_ANSWER_MAX_REFERENCE_LINES ||
    fence.length > FAILED_EDIT_FINAL_ANSWER_MAX_REFERENCE_CHARS
  )
}

export function resolveFailedEditFinalAnswerDisplayContext(
  activities: readonly AgentChatActivityPayload[],
  turnContext?: { chatMode?: 'plan' | 'fast' } | null,
): FailedEditFinalAnswerDisplayContext {
  return {
    hadEditFailures: turnHadFailedEditActivities(activities),
    editProposalCreated: turnHadAcceptedEditProposal(activities),
    chatMode: turnContext?.chatMode,
  }
}

export function shouldSanitizeFailedEditFinalAnswerDisplay(
  ctx: FailedEditFinalAnswerDisplayContext,
): boolean {
  if (ctx.chatMode === 'plan') return false
  return ctx.hadEditFailures && !ctx.editProposalCreated
}

/**
 * Replaces oversized fenced code in assistant markdown when edit tools failed with no
 * accepted proposal. Does not mutate persisted thread lines (story 164).
 */
export function sanitizeFailedEditFinalAnswerDisplay(
  text: string,
  ctx: FailedEditFinalAnswerDisplayContext,
): string {
  if (!shouldSanitizeFailedEditFinalAnswerDisplay(ctx)) return text

  let changed = false
  const out = text.replace(FENCE_RE, (fence) => {
    if (!fenceExceedsFailedEditReferenceCap(fence)) return fence
    changed = true
    return FAILED_EDIT_FENCE_REMOVED_PLACEHOLDER
  })
  if (!changed) return text
  return out.replace(/\n{3,}/g, '\n\n').trimEnd()
}
