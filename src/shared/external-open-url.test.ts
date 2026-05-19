import { describe, expect, it } from 'vitest'
import { isAllowedExternalOpenUrl, parseAllowedExternalOpenUrl } from './external-open-url'

describe('isAllowedExternalOpenUrl', () => {
  it('allows https', () => {
    expect(isAllowedExternalOpenUrl(new URL('https://example.com/path'))).toBe(true)
  })

  it('allows http on localhost and loopback', () => {
    expect(isAllowedExternalOpenUrl(new URL('http://localhost:3000'))).toBe(true)
    expect(isAllowedExternalOpenUrl(new URL('http://127.0.0.1:5173'))).toBe(true)
    expect(isAllowedExternalOpenUrl(new URL('http://[::1]:8080'))).toBe(true)
    expect(isAllowedExternalOpenUrl(new URL('http://app.localhost:4000'))).toBe(true)
  })

  it('rejects remote http and non-http(s) schemes', () => {
    expect(isAllowedExternalOpenUrl(new URL('http://example.com'))).toBe(false)
    expect(isAllowedExternalOpenUrl(new URL('file:///etc/passwd'))).toBe(false)
  })
})

describe('parseAllowedExternalOpenUrl', () => {
  it('returns parsed URL when allowed', () => {
    const url = parseAllowedExternalOpenUrl('http://localhost:3000/docs')
    expect(url?.href).toBe('http://localhost:3000/docs')
  })

  it('returns null for disallowed or invalid input', () => {
    expect(parseAllowedExternalOpenUrl('http://evil.com')).toBeNull()
    expect(parseAllowedExternalOpenUrl('not-a-url')).toBeNull()
  })
})
