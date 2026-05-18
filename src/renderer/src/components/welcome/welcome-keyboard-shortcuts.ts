/** Cmd / Super + 1–9 opens the first N visible recents (welcome screen). */
export const WELCOME_META_QUICK_OPEN_MAX = 9

const META_DIGIT_BY_CODE: Record<string, number> = {
  Digit1: 0,
  Digit2: 1,
  Digit3: 2,
  Digit4: 3,
  Digit5: 4,
  Digit6: 5,
  Digit7: 6,
  Digit8: 7,
  Digit9: 8,
  Numpad1: 0,
  Numpad2: 1,
  Numpad3: 2,
  Numpad4: 3,
  Numpad5: 4,
  Numpad6: 5,
  Numpad7: 6,
  Numpad8: 7,
  Numpad9: 8,
}

/** 0–8 for main-row or numpad digit keys; otherwise null. */
export function metaDigitIndexFromCode(code: string): number | null {
  const v = META_DIGIT_BY_CODE[code]
  return v === undefined ? null : v
}

export function isMetaPhysicalKey(e: Pick<KeyboardEvent, 'key' | 'code'>): boolean {
  return e.key === 'Meta' || e.code === 'MetaLeft' || e.code === 'MetaRight'
}

/**
 * When false, Meta+digit shortcuts should not run (typing in filter, dialogs, etc.).
 */
export function welcomeKeyboardTargetAllowsGlobalShortcut(target: EventTarget | null): boolean {
  if (typeof document === 'undefined') return false
  if (!(target instanceof Element)) return true
  if (target.closest('[role="dialog"]')) return false
  const field = target.closest('input, textarea, select, [contenteditable="true"]')
  if (!field) return true
  if (field instanceof HTMLInputElement) {
    const t = field.type
    if (t === 'checkbox' || t === 'radio' || t === 'button' || t === 'submit' || t === 'reset' || t === 'file') {
      return true
    }
  }
  return false
}
