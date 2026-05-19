/** Global dismiss for agent primer onboarding (story 095). */
export const ONBOARDING_STORAGE_KEY = 'grokforge.onboarding.v1' as const

const PROJECT_SEEN_PREFIX = 'grokforge.onboarding.projectSeen.v1:'

function projectSeenKey(projectId: string): string {
  return `${PROJECT_SEEN_PREFIX}${projectId}`
}

export function isOnboardingGloballyDismissed(): boolean {
  if (typeof localStorage === 'undefined') return true
  return localStorage.getItem(ONBOARDING_STORAGE_KEY) === 'dismissed'
}

export function dismissOnboardingGlobally(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(ONBOARDING_STORAGE_KEY, 'dismissed')
}

export function isProjectOnboardingSeen(projectId: string | null | undefined): boolean {
  if (!projectId || typeof localStorage === 'undefined') return true
  return localStorage.getItem(projectSeenKey(projectId)) === '1'
}

export function markProjectOnboardingSeen(projectId: string): void {
  if (!projectId || typeof localStorage === 'undefined') return
  localStorage.setItem(projectSeenKey(projectId), '1')
}

/** Show primer on first open of a project until dismissed globally or seen for this project. */
export function shouldShowProjectOnboarding(projectId: string | null | undefined): boolean {
  if (!projectId) return false
  if (isOnboardingGloballyDismissed()) return false
  if (isProjectOnboardingSeen(projectId)) return false
  return true
}
