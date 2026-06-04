import { describe, expect, it } from 'vitest'
import { resolveHarnessProfileKey } from '../harness/profiles/contracts/harness-profile-key'

describe('resolveHarnessProfileKey', () => {
  it('maps grok-build-0.1 and grok-code-fast-1 to grok_code_fast', () => {
    expect(resolveHarnessProfileKey('grok-build-0.1')).toBe('grok_code_fast')
    expect(resolveHarnessProfileKey('grok-code-fast-1')).toBe('grok_code_fast')
    expect(resolveHarnessProfileKey('  grok-code-fast-1  ')).toBe('grok_code_fast')
    expect(resolveHarnessProfileKey('grok-code-fast')).toBe('grok_code_fast')
    expect(resolveHarnessProfileKey('grok-code-fast-1-0825')).toBe('grok_code_fast')
  })

  it('maps grok-4.3 to grok_4_3', () => {
    expect(resolveHarnessProfileKey('grok-4.3')).toBe('grok_4_3')
  })

  it('falls back to generic for unknown or blank ids', () => {
    expect(resolveHarnessProfileKey('grok-4.20-0309-reasoning')).toBe('generic')
    expect(resolveHarnessProfileKey('')).toBe('generic')
    expect(resolveHarnessProfileKey('   ')).toBe('generic')
  })
})
