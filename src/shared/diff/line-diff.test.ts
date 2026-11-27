import { describe, expect, it } from 'vitest'
import { computeLineDiff, countLineDiff } from './line-diff'

describe('computeLineDiff', () => {
  it('treats a null old text as a new file', () => {
    const rows = computeLineDiff(null, 'a\nb\n')
    expect(rows).toEqual([
      { type: 'add', text: 'a', newLine: 1 },
      { type: 'add', text: 'b', newLine: 2 },
    ])
  })

  it('marks a single changed line with surrounding context', () => {
    const rows = computeLineDiff('one\ntwo\nthree\n', 'one\n2\nthree\n')
    expect(rows.map((r) => (r.type === 'gap' ? 'gap' : `${r.type}:${r.text}`))).toEqual([
      'context:one',
      'del:two',
      'add:2',
      'context:three',
    ])
    expect(countLineDiff(rows)).toEqual({ added: 1, removed: 1 })
  })

  it('collapses unchanged lines far from the change', () => {
    const old = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n')
    const next = old.replace('line 10', 'line ten')
    const rows = computeLineDiff(old, next, 2)
    expect(rows[0]).toEqual({ type: 'gap', hidden: 7 })
    expect(rows[rows.length - 1]).toEqual({ type: 'gap', hidden: 8 })
    expect(countLineDiff(rows)).toEqual({ added: 1, removed: 1 })
  })

  it('keeps line numbers aligned through insertions', () => {
    const rows = computeLineDiff('a\nc\n', 'a\nb\nc\n')
    expect(rows).toEqual([
      { type: 'context', text: 'a', oldLine: 1, newLine: 1 },
      { type: 'add', text: 'b', newLine: 2 },
      { type: 'context', text: 'c', oldLine: 2, newLine: 3 },
    ])
  })
})
