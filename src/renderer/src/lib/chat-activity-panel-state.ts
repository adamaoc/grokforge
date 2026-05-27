export type ActivityPanelAutoExpandInput = {
  isLive: boolean
  hasNewError: boolean
  forceExpanded: boolean
  alwaysExpandPref: boolean
}

/** Expand only on new live error, force flag, or user pref — not step count (story 141). */
export function shouldAutoExpandActivityPanel(input: ActivityPanelAutoExpandInput): boolean {
  if (input.alwaysExpandPref) return true
  if (input.forceExpanded) return true
  if (input.isLive && input.hasNewError) return true
  return false
}

export type ActivityPanelTurnEndCollapseInput = {
  isLive: boolean
  userPinnedExpand: boolean
}

/** When a turn finishes, collapse unless the user pinned expand during the live turn. */
export function shouldCollapseOnTurnEnd(input: ActivityPanelTurnEndCollapseInput): boolean {
  if (input.isLive) return false
  return !input.userPinnedExpand
}
