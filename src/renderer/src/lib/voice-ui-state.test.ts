import { describe, expect, it } from 'vitest'
import {
  shouldAutoCloseVoicePanel,
  shouldAutoCollapseVoicePanelOnSessionEnd,
  shouldAutoOpenVoicePanel,
  voiceHeaderIndicator,
} from './voice-ui-state'

describe('shouldAutoOpenVoicePanel', () => {
  it('opens on connecting, active, and error', () => {
    expect(shouldAutoOpenVoicePanel('connecting', false)).toBe(true)
    expect(shouldAutoOpenVoicePanel('listening', true)).toBe(true)
    expect(shouldAutoOpenVoicePanel('error', false)).toBe(true)
  })

  it('does not open when idle', () => {
    expect(shouldAutoOpenVoicePanel('idle', false)).toBe(false)
  })
})

describe('shouldAutoCloseVoicePanel', () => {
  it('closes only when idle and inactive', () => {
    expect(shouldAutoCloseVoicePanel('idle', false)).toBe(true)
    expect(shouldAutoCloseVoicePanel('listening', true)).toBe(false)
    expect(shouldAutoCloseVoicePanel('error', false)).toBe(false)
  })
})

describe('shouldAutoCollapseVoicePanelOnSessionEnd', () => {
  it('collapses only after an active session ends', () => {
    expect(shouldAutoCollapseVoicePanelOnSessionEnd('idle', false, true)).toBe(true)
    expect(shouldAutoCollapseVoicePanelOnSessionEnd('idle', false, false)).toBe(false)
    expect(shouldAutoCollapseVoicePanelOnSessionEnd('listening', true, true)).toBe(false)
  })
})

describe('voiceHeaderIndicator', () => {
  it('returns disabled tooltip when voice is off', () => {
    const ind = voiceHeaderIndicator('idle', false, false, true)
    expect(ind.tooltip).toContain('disabled')
    expect(ind.showActiveDot).toBe(false)
  })

  it('shows close tooltip when panel is open', () => {
    const ind = voiceHeaderIndicator('idle', false, true, false)
    expect(ind.tooltip).toBe('Close voice controls')
    expect(ind.pillTint).toBe(false)
  })

  it('shows active dot when live but panel collapsed', () => {
    const ind = voiceHeaderIndicator('listening', true, false, false)
    expect(ind.showActiveDot).toBe(true)
    expect(ind.pillTint).toBe(true)
    expect(ind.tooltip).toBe('Show voice controls')
  })

  it('shows open tooltip when idle and collapsed', () => {
    const ind = voiceHeaderIndicator('idle', false, false, false)
    expect(ind.tooltip).toBe('Open voice controls')
    expect(ind.showActiveDot).toBe(false)
  })

  it('highlights error when panel closed', () => {
    const ind = voiceHeaderIndicator('error', false, false, false)
    expect(ind.showActiveDot).toBe(true)
    expect(ind.tooltip).toContain('Voice issue')
  })
})