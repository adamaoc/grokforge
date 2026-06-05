import { describe, expect, it } from 'vitest'
import {
  computeDiffLineStats,
  computeDiffLineStatsForFile,
  formatDiffSessionSummary,
  summarizeDiffSessionStats,
} from '../harness/diff/line-stats'

describe('computeDiffLineStats', () => {
  it('counts localized line changes', () => {
    const original = ['a', 'b', 'c', 'd'].join('\n')
    const modified = ['a', 'b', 'x', 'd'].join('\n')
    expect(computeDiffLineStats(original, modified)).toEqual({ additions: 1, deletions: 1 })
  })

  it('treats new file as all additions', () => {
    expect(
      computeDiffLineStatsForFile({
        status: 'created',
        original: '',
        modified: 'one\ntwo\n',
      }),
    ).toEqual({ additions: 2, deletions: 0 })
  })

  it('summarizes session totals', () => {
    const stats = summarizeDiffSessionStats([
      { status: 'modified', original: 'a\nb\n', modified: 'a\nc\n' },
      { status: 'created', original: '', modified: 'x\n' },
    ])
    expect(stats).toEqual({ additions: 2, deletions: 1 })
    expect(formatDiffSessionSummary(2, stats)).toBe('2 files · +2 -1')
  })
})
