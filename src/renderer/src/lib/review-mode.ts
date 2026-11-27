import type { ReviewMode } from '../../../shared/agent/chat-contract'

export type { ReviewMode }

/** Kept from the original "temperament" setting so existing choices carry over. */
const STORAGE_KEY = 'grokforge.harnessTemperament.v1'

export function readStoredReviewMode(): ReviewMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)?.trim()
    if (raw === 'velocity' || raw === 'trust') return raw
  } catch {
    // Storage unavailable: fall back to the safe default.
  }
  return 'trust'
}

export function persistReviewMode(mode: ReviewMode): void {
  if (mode !== 'trust' && mode !== 'velocity') return
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // ignore
  }
}

export const REVIEW_MODE_COPY: Record<ReviewMode, { label: string; short: string; description: string }> = {
  trust: {
    label: 'Review each edit',
    short: 'Review edits',
    description: 'The agent asks before every file change and shows you the diff. Nothing is written until you allow it.',
  },
  velocity: {
    label: 'Auto-accept edits',
    short: 'Auto-accept',
    description:
      'The agent edits files without asking. Commands and deletes still ask, and every turn can be undone from its changes card.',
  },
}
