import { describe, expect, it, vi } from 'vitest'
import {
  EDITOR_SAVE_SHORTCUT_ROW,
  WORKSPACE_GLOBAL_SHORTCUT_ROWS,
  formatShortcutKeys,
  matchWorkspaceGlobalShortcutChord,
  readEmptyShortcutsExpanded,
  workspaceGlobalShortcutTargetAllowsShortcut,
  writeEmptyShortcutsExpanded,
} from './workspace-global-shortcuts'

function chordEvent(
  partial: Partial<KeyboardEvent> & Pick<KeyboardEvent, 'code'>,
): KeyboardEvent {
  return {
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...partial,
  } as KeyboardEvent
}

describe('WORKSPACE_GLOBAL_SHORTCUT_ROWS', () => {
  it('lists only global workspace shortcuts (no save)', () => {
    expect(WORKSPACE_GLOBAL_SHORTCUT_ROWS.map((r) => r.id)).toEqual([
      'search',
      'terminal',
      'sidebar',
      'editor',
    ])
    expect(WORKSPACE_GLOBAL_SHORTCUT_ROWS.some((r) => r.id === 'save')).toBe(false)
    expect(EDITOR_SAVE_SHORTCUT_ROW.id).toBe('save')
  })

  it('every row id has key labels for Mac and Windows', () => {
    for (const row of WORKSPACE_GLOBAL_SHORTCUT_ROWS) {
      expect(formatShortcutKeys(row.id, true).length).toBeGreaterThan(0)
      expect(formatShortcutKeys(row.id, false).length).toBeGreaterThan(0)
    }
  })
})

describe('matchWorkspaceGlobalShortcutChord', () => {
  it('maps each global chord to the matching id', () => {
    expect(matchWorkspaceGlobalShortcutChord(chordEvent({ metaKey: true, shiftKey: true, code: 'KeyF' }))).toBe(
      'search',
    )
    expect(matchWorkspaceGlobalShortcutChord(chordEvent({ metaKey: true, code: 'KeyJ' }))).toBe('terminal')
    expect(matchWorkspaceGlobalShortcutChord(chordEvent({ metaKey: true, code: 'KeyB' }))).toBe('sidebar')
    expect(matchWorkspaceGlobalShortcutChord(chordEvent({ metaKey: true, altKey: true, code: 'KeyE' }))).toBe(
      'editor',
    )
  })

  it('supports Ctrl modifier on non-Mac', () => {
    expect(
      matchWorkspaceGlobalShortcutChord(chordEvent({ ctrlKey: true, shiftKey: true, code: 'KeyF' })),
    ).toBe('search')
  })

  it('returns null when modifier chords do not match', () => {
    expect(matchWorkspaceGlobalShortcutChord(chordEvent({ code: 'KeyF' }))).toBeNull()
    expect(matchWorkspaceGlobalShortcutChord(chordEvent({ metaKey: true, code: 'KeyS' }))).toBeNull()
    expect(
      matchWorkspaceGlobalShortcutChord(chordEvent({ metaKey: true, shiftKey: true, code: 'KeyE' })),
    ).toBeNull()
  })

  it('contract: every global row id is reachable via matchWorkspaceGlobalShortcutChord', () => {
    const samples: Record<(typeof WORKSPACE_GLOBAL_SHORTCUT_ROWS)[number]['id'], KeyboardEvent> = {
      search: chordEvent({ metaKey: true, shiftKey: true, code: 'KeyF' }),
      terminal: chordEvent({ metaKey: true, code: 'KeyJ' }),
      sidebar: chordEvent({ metaKey: true, code: 'KeyB' }),
      editor: chordEvent({ metaKey: true, altKey: true, code: 'KeyE' }),
    }
    for (const row of WORKSPACE_GLOBAL_SHORTCUT_ROWS) {
      expect(matchWorkspaceGlobalShortcutChord(samples[row.id])).toBe(row.id)
    }
  })
})

describe('workspaceGlobalShortcutTargetAllowsShortcut', () => {
  it('is conservative without DOM', () => {
    expect(workspaceGlobalShortcutTargetAllowsShortcut(null)).toBe(false)
  })
})

describe('empty shortcuts expanded preference', () => {
  it('defaults to collapsed and persists toggle', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
      removeItem: (key: string) => {
        store.delete(key)
      },
    })

    expect(readEmptyShortcutsExpanded()).toBe(false)
    writeEmptyShortcutsExpanded(true)
    expect(readEmptyShortcutsExpanded()).toBe(true)
    writeEmptyShortcutsExpanded(false)
    expect(readEmptyShortcutsExpanded()).toBe(false)

    vi.unstubAllGlobals()
  })
})
