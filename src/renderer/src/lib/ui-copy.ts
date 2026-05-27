/** User-facing chat strings (story 142). */

export type LiveAssistantStatusInput = {
  planExecuteStreamActive: boolean
  chatMode?: 'fast' | 'plan'
  hasToolActivities: boolean
  /** Activity summary strip visible — avoid duplicating status in the message body. */
  suppressDuplicateStatus?: boolean
}

/** One-line placeholder while the assistant message is still empty. */
export function liveAssistantStatusPlaceholder(input: LiveAssistantStatusInput): string {
  if (input.suppressDuplicateStatus) return 'Thinking…'
  if (input.planExecuteStreamActive) return 'Running your plan…'
  if (input.chatMode === 'plan') return 'Thinking…'
  if (input.hasToolActivities) return 'Applying changes…'
  return 'Thinking…'
}

/** Compact welcome intro (≤6 lines before suggestion chips). */
export function buildChatWelcomeContent(
  projectName: string,
  activeRootLabel?: string | null,
): string {
  const scope = activeRootLabel?.trim()
    ? ` — active root **${activeRootLabel}**`
    : ''
  return `Hey — I'm ready to help with **${projectName}**${scope}. What should we work on?`
}
