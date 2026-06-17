import { describe, expect, it } from 'vitest'
import { isHarnessModelTimeoutError, toHarnessModelError } from '../client'

describe('toHarnessModelError', () => {
  it('maps AbortSignal timeout errors to a harness message', () => {
    const mapped = toHarnessModelError(new Error('The operation was aborted due to timeout'))

    expect(mapped.message).toBe(
      'Model request timed out. Partial file changes from this turn may already be on disk — refresh the file tree and retry if needed.',
    )
    expect(mapped.message).not.toContain('aborted due to timeout')
  })

  it('maps generic timed out errors to the harness message', () => {
    const mapped = toHarnessModelError(new Error('Request timed out after 90000ms'))

    expect(mapped.message).toContain('Model request timed out')
    expect(mapped.message).toContain('Partial file changes')
  })

  it('maps fetch failures to a network guidance message', () => {
    const mapped = toHarnessModelError(new TypeError('fetch failed'))

    expect(mapped.message).toBe(
      'Could not reach the xAI API (network error). Check your connection, API key in Settings, and try again.',
    )
  })

  it('passes through other Error instances unchanged', () => {
    const original = new Error('HTTP 429: rate limited')
    expect(toHarnessModelError(original)).toBe(original)
  })
})

describe('isHarnessModelTimeoutError', () => {
  it('detects harness timeout messages after mapping', () => {
    const mapped = toHarnessModelError(new Error('timed out'))
    expect(isHarnessModelTimeoutError(mapped)).toBe(true)
  })
})