import { describe, expect, it } from 'vitest'
import { applySearchReplace, countSearchReplaceMatches } from './agent-search-replace'

describe('applySearchReplace', () => {
  it('replaces when old_string occurs exactly once', () => {
    const result = applySearchReplace('alpha beta gamma', 'beta', 'BETA')
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.content).toBe('alpha BETA gamma')
  })

  it('errors when old_string is missing', () => {
    const result = applySearchReplace('hello', 'missing', 'x')
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.matchCount).toBe(0)
  })

  it('errors when old_string matches multiple times', () => {
    const result = applySearchReplace('foo foo', 'foo', 'bar')
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.matchCount).toBe(2)
  })

  it('counts non-overlapping matches', () => {
    expect(countSearchReplaceMatches('aaa', 'aa')).toBe(1)
    expect(countSearchReplaceMatches('abab', 'ab')).toBe(2)
  })
})
