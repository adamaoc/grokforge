/**
 * Global shortcuts while a project workspace is open (renderer `window` listeners).
 * Single source of truth for empty-state labels and App.tsx key handling.
 */

export type WorkspaceShortcutId = 'search' | 'terminal' | 'sidebar' | 'editor'

export type WorkspaceShortcutRow = {
  id: WorkspaceShortcutId
  label: string
}

export const WORKSPACE_GLOBAL_SHORTCUT_ROWS: WorkspaceShortcutRow[] = [
  { id: 'search', label: 'Workspace search' },
  { id: 'terminal', label: 'Toggle terminal' },
  { id: 'sidebar', label: 'Toggle sidebar' },
  { id: 'editor', label: 'Toggle editor / files pane' },
]

/** Editor-scoped only — not shown on empty state (no active tab). */
export const EDITOR_SAVE_SHORTCUT_ROW = {
  id: 'save' as const,
  label: 'Save active file',
}

export const EMPTY_SHORTCUTS_EXPANDED_STORAGE_KEY = 'grokforge.editor.emptyShortcutsExpanded'

export function readEmptyShortcutsExpanded(): boolean {
  if (typeof localStorage === 'undefined') return false
  return localStorage.getItem(EMPTY_SHORTCUTS_EXPANDED_STORAGE_KEY) === 'true'
}

export function writeEmptyShortcutsExpanded(expanded: boolean): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(EMPTY_SHORTCUTS_EXPANDED_STORAGE_KEY, expanded ? 'true' : 'false')
}

export function formatShortcutKeys(id: WorkspaceShortcutId, isMac: boolean): string[] {
  if (isMac) {
    const mod = '⌘'
    switch (id) {
      case 'search':
        return [`${mod}⇧F`]
      case 'terminal':
        return [`${mod}J`]
      case 'sidebar':
        return [`${mod}B`]
      case 'editor':
        return ['⌥⌘E']
    }
  }
  switch (id) {
    case 'search':
      return ['Ctrl', 'Shift', 'F']
    case 'terminal':
      return ['Ctrl', 'J']
    case 'sidebar':
      return ['Ctrl', 'B']
    case 'editor':
      return ['Alt', 'Ctrl', 'E']
  }
}

export function formatEditorSaveShortcutKeys(isMac: boolean): string[] {
  return isMac ? ['⌘S'] : ['Ctrl', 'S']
}

export function workspaceGlobalShortcutTargetAllowsShortcut(target: EventTarget | null): boolean {
  if (typeof document === 'undefined') return false
  const isElement = typeof Element !== 'undefined' && target instanceof Element
  if (!isElement) return true
  if (target.closest('[role="dialog"]')) return false
  const field = target.closest('input, textarea, select, [contenteditable="true"]')
  if (!field) return true
  if (field instanceof HTMLInputElement) {
    const t = field.type
    if (t === 'checkbox' || t === 'radio' || t === 'button' || t === 'submit' || t === 'reset' || t === 'file') {
      return true
    }
  }
  return false
}

type ShortcutKeyEvent = Pick<KeyboardEvent, 'target' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'code'>

type ShortcutChordEvent = Pick<KeyboardEvent, 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'code'>

/** Modifier + key resolution only — use in tests and `resolveWorkspaceGlobalShortcut`. */
export function matchWorkspaceGlobalShortcutChord(e: ShortcutChordEvent): WorkspaceShortcutId | null {
  const mod = e.metaKey || e.ctrlKey
  if (!mod) return null

  if (e.altKey && !e.shiftKey && e.code === 'KeyE') return 'editor'
  if (e.altKey) return null

  if (e.shiftKey && e.code === 'KeyF') return 'search'
  if (e.shiftKey) return null

  if (e.code === 'KeyJ') return 'terminal'
  if (e.code === 'KeyB') return 'sidebar'

  return null
}

/** Returns a workspace-global shortcut id when the chord matches; null otherwise. */
export function resolveWorkspaceGlobalShortcut(e: ShortcutKeyEvent): WorkspaceShortcutId | null {
  if (!workspaceGlobalShortcutTargetAllowsShortcut(e.target)) return null
  return matchWorkspaceGlobalShortcutChord(e)
}
