import { describe, expect, it } from 'vitest'
import {
  applyEdits,
  fuzzyFindText,
  normalizeForFuzzyMatch,
} from './agent-edit-fuzzy'

describe('agent-edit-fuzzy', () => {
  it('exact match wins', () => {
    const res = fuzzyFindText('hello world', 'world')
    expect(res.found).toBe(true)
    expect(res.usedFuzzyMatch).toBe(false)
    expect(res.index).toBe(6)
  })

  it('fuzzy matches after minor formatting differences', () => {
    const file = 'const msg = "Hello — world";'
    const oldText = 'const msg = "Hello - world";' // different dash + spacing

    const res = fuzzyFindText(file, oldText)
    expect(res.found).toBe(true)
    expect(res.usedFuzzyMatch).toBe(true)
  })

  it('normalizeForFuzzyMatch handles smart quotes, dashes, and trailing ws', () => {
    const input = '“foo” – bar  \n  baz  '
    const norm = normalizeForFuzzyMatch(input)
    expect(norm).toContain('"foo"')
    expect(norm).toContain('- bar')
    expect(norm.endsWith('baz')).toBe(true)
  })

  it('applyEdits supports multiple non-overlapping edits', () => {
    const original = 'function foo() {\n  return 1;\n}\n\nfunction bar() {\n  return 2;\n}\n'
    const edits = [
      { oldText: 'return 1;', newText: 'return 42;' },
      { oldText: 'return 2;', newText: 'return 99;' },
    ]
    const result = applyEdits(original, edits, 'test.ts')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.content).toContain('return 42;')
      expect(result.content).toContain('return 99;')
      expect(result.usedFuzzy).toBe(false)
    }
  })

  it('applyEdits rejects overlapping edits', () => {
    const original = 'abcde'
    const edits = [
      { oldText: 'bcd', newText: 'X' },
      { oldText: 'cde', newText: 'Y' },
    ]
    const result = applyEdits(original, edits, 'test.ts')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/overlap/i)
    }
  })

  it('applyEdits enforces uniqueness', () => {
    const original = 'foo foo'
    const result = applyEdits(original, [{ oldText: 'foo', newText: 'bar' }], 'test.ts')
    expect(result.ok).toBe(false)
  })
})
