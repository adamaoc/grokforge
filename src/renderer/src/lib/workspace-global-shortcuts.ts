/**
 * Global shortcuts while a project workspace is open (renderer `window` listeners).
 * Keep in sync with `WORKSPACE_SHORTCUT_ROWS` in `EditorEmptyState.tsx`.
 */

export function workspaceGlobalShortcutTargetAllowsShortcut(target: EventTarget | null): boolean {
  if (typeof document === 'undefined') return false
  if (!(target instanceof Element)) return true
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
