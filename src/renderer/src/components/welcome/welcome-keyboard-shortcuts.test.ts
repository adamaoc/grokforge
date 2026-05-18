import { describe, expect, it } from 'vitest'
import {
  isMetaPhysicalKey,
  metaDigitIndexFromCode,
  welcomeKeyboardTargetAllowsGlobalShortcut,
} from './welcome-keyboard-shortcuts'

describe('welcome-keyboard-shortcuts', () => {
  it('metaDigitIndexFromCode maps Digit and Numpad', () => {
    expect(metaDigitIndexFromCode('Digit1')).toBe(0)
    expect(metaDigitIndexFromCode('Digit9')).toBe(8)
    expect(metaDigitIndexFromCode('Numpad5')).toBe(4)
    expect(metaDigitIndexFromCode('KeyA')).toBeNull()
  })

  it('isMetaPhysicalKey recognizes Meta', () => {
    expect(isMetaPhysicalKey({ key: 'Meta', code: 'MetaLeft' })).toBe(true)
    expect(isMetaPhysicalKey({ key: 'a', code: 'KeyA' })).toBe(false)
  })

  it('welcomeKeyboardTargetAllowsGlobalShortcut is conservative without DOM', () => {
    expect(welcomeKeyboardTargetAllowsGlobalShortcut(null)).toBe(false)
  })
})
