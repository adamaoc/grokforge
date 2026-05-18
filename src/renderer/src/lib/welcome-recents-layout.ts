/**
 * Welcome screen: recent projects list layout (056 Chunk C).
 * Persisted in renderer localStorage (same pattern as `grokforge.accent`, `grokforge.agentWritesMode`).
 */
export const WELCOME_RECENTS_LAYOUT_STORAGE_KEY = 'grokforge.welcomeRecentsLayout.v1' as const

export type WelcomeRecentsLayout = 'cards' | 'table'

export function readWelcomeRecentsLayout(): WelcomeRecentsLayout {
  try {
    const raw = localStorage.getItem(WELCOME_RECENTS_LAYOUT_STORAGE_KEY)?.trim()
    if (raw === 'table' || raw === 'cards') return raw
  } catch {
    // ignore (private mode, etc.)
  }
  return 'cards'
}

export function writeWelcomeRecentsLayout(value: WelcomeRecentsLayout): void {
  if (value !== 'cards' && value !== 'table') return
  try {
    localStorage.setItem(WELCOME_RECENTS_LAYOUT_STORAGE_KEY, value)
  } catch {
    // ignore
  }
}
