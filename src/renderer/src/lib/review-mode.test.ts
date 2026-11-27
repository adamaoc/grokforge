import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { persistReviewMode, readStoredReviewMode, REVIEW_MODE_COPY } from './review-mode'

const KEY = 'grokforge.harnessTemperament.v1'

function createStorage() {
  const store: Record<string, string> = {}
  return {
    store,
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
  }
}

describe('review mode', () => {
  let storage: ReturnType<typeof createStorage>

  beforeEach(() => {
    storage = createStorage()
    vi.stubGlobal('localStorage', storage)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('defaults to reviewing each edit', () => {
    expect(readStoredReviewMode()).toBe('trust')
  })

  it('reads values saved under the original temperament key', () => {
    storage.store[KEY] = 'velocity'
    expect(readStoredReviewMode()).toBe('velocity')
  })

  it('persists and ignores invalid values', () => {
    persistReviewMode('velocity')
    expect(storage.store[KEY]).toBe('velocity')
    persistReviewMode('nope' as never)
    expect(storage.store[KEY]).toBe('velocity')
  })

  it('falls back to the safe default when storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
    })
    expect(readStoredReviewMode()).toBe('trust')
  })

  it('has user-facing copy for both modes', () => {
    expect(REVIEW_MODE_COPY.trust.label).toBe('Review each edit')
    expect(REVIEW_MODE_COPY.velocity.label).toBe('Auto-accept edits')
  })
})
