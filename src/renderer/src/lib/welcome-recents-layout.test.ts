import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  readWelcomeRecentsLayout,
  WELCOME_RECENTS_LAYOUT_STORAGE_KEY,
  writeWelcomeRecentsLayout,
} from './welcome-recents-layout'

describe('welcome-recents-layout', () => {
  const store: Record<string, string> = {}

  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => {
        store[k] = v
      },
      removeItem: (k: string) => {
        delete store[k]
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    for (const k of Object.keys(store)) delete store[k]
  })

  it('defaults to cards when unset', () => {
    expect(readWelcomeRecentsLayout()).toBe('cards')
  })

  it('reads table when stored', () => {
    store[WELCOME_RECENTS_LAYOUT_STORAGE_KEY] = 'table'
    expect(readWelcomeRecentsLayout()).toBe('table')
  })

  it('ignores invalid values', () => {
    store[WELCOME_RECENTS_LAYOUT_STORAGE_KEY] = 'wide'
    expect(readWelcomeRecentsLayout()).toBe('cards')
  })

  it('persists known layout', () => {
    writeWelcomeRecentsLayout('table')
    expect(store[WELCOME_RECENTS_LAYOUT_STORAGE_KEY]).toBe('table')
    expect(readWelcomeRecentsLayout()).toBe('table')
  })
})
