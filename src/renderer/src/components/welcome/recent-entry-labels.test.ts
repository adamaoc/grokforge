import { describe, expect, it } from 'vitest'
import type { RecentProjectEntry } from '@/types'
import { getRecentFolderLabel, getRecentRootsSubtitle, getRecentRootsSubtitleTitle } from './recent-entry-labels'

describe('recent-entry-labels', () => {
  it('getRecentFolderLabel prefers joined root labels', () => {
    const entry = {
      projectId: '1',
      displayName: 'My App',
      rootsCount: 2,
      rootLabels: ['A', 'B'],
      lastOpenedAt: new Date().toISOString(),
    } satisfies RecentProjectEntry
    expect(getRecentFolderLabel(entry)).toBe('A · B')
  })

  it('getRecentRootsSubtitle truncates long label lists', () => {
    const entry = {
      projectId: '1',
      displayName: 'X',
      rootsCount: 5,
      rootLabels: ['r1', 'r2', 'r3', 'r4', 'r5'],
      lastOpenedAt: new Date().toISOString(),
    } satisfies RecentProjectEntry
    expect(getRecentRootsSubtitle(entry)).toContain('…')
  })

  it('getRecentRootsSubtitleTitle joins all labels', () => {
    const entry = {
      projectId: '1',
      displayName: 'X',
      rootsCount: 2,
      rootLabels: ['a', 'b'],
      lastOpenedAt: new Date().toISOString(),
    } satisfies RecentProjectEntry
    expect(getRecentRootsSubtitleTitle(entry)).toBe('a · b')
  })
})
