import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  dismissOnboardingGlobally,
  isOnboardingGloballyDismissed,
  markProjectOnboardingSeen,
  ONBOARDING_STORAGE_KEY,
  shouldShowProjectOnboarding,
} from './onboarding-storage'

function createStorage() {
  const store: Record<string, string> = {}
  return {
    store,
    getItem(key: string) {
      return store[key] ?? null
    },
    setItem(key: string, value: string) {
      store[key] = value
    },
    removeItem(key: string) {
      delete store[key]
    },
  }
}

describe('onboarding-storage', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage())
  })

  it('shows onboarding for a new project until seen', () => {
    expect(shouldShowProjectOnboarding('proj-a')).toBe(true)
    markProjectOnboardingSeen('proj-a')
    expect(shouldShowProjectOnboarding('proj-a')).toBe(false)
    expect(shouldShowProjectOnboarding('proj-b')).toBe(true)
  })

  it('global dismiss hides onboarding for all projects', () => {
    dismissOnboardingGlobally()
    expect(isOnboardingGloballyDismissed()).toBe(true)
    expect(shouldShowProjectOnboarding('proj-new')).toBe(false)
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBe('dismissed')
  })
})
