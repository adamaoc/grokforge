import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  harnessTemperamentLabel,
  isVelocityTemperament,
  persistHarnessTemperament,
  readStoredHarnessTemperament,
  temperamentToWritesMode,
  writesModeToTemperament,
} from './harness-temperament'

const TEMPERAMENT_KEY = 'grokforge.harnessTemperament.v1'
const LEGACY_KEY = 'grokforge.agentWritesMode'

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

describe('harness temperament', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage())
  })

  afterEach(() => {
    localStorage.removeItem(TEMPERAMENT_KEY)
    localStorage.removeItem(LEGACY_KEY)
  })

  it('maps trust/velocity to writes modes', () => {
    expect(temperamentToWritesMode('trust')).toBe('batch_confirm')
    expect(temperamentToWritesMode('velocity')).toBe('auto_apply')
    expect(writesModeToTemperament('batch_confirm')).toBe('trust')
    expect(writesModeToTemperament('auto_apply')).toBe('velocity')
  })

  it('migrates legacy auto_apply to velocity', () => {
    localStorage.setItem(LEGACY_KEY, 'auto_apply')
    expect(readStoredHarnessTemperament()).toBe('velocity')
    expect(localStorage.getItem(TEMPERAMENT_KEY)).toBe('velocity')
  })

  it('migrates legacy batch_confirm to trust', () => {
    localStorage.setItem(LEGACY_KEY, 'batch_confirm')
    expect(readStoredHarnessTemperament()).toBe('trust')
    expect(localStorage.getItem(TEMPERAMENT_KEY)).toBe('trust')
  })

  it('persist writes both keys', () => {
    persistHarnessTemperament('velocity')
    expect(localStorage.getItem(TEMPERAMENT_KEY)).toBe('velocity')
    expect(localStorage.getItem(LEGACY_KEY)).toBe('auto_apply')
    expect(isVelocityTemperament()).toBe(true)
    expect(harnessTemperamentLabel('trust')).toBe('Trust')
    expect(harnessTemperamentLabel('velocity')).toBe('Velocity')
  })
})
