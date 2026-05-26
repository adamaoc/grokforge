import type { DiffFileStatus } from '@/types'

/** Monaco diff editor shows a blank pane when original is empty — use a single editor instead. */
export function shouldUseFullContentPreview(
  status: DiffFileStatus,
  original: string,
  modified: string,
): boolean {
  if (status === 'created' || status === 'deleted') return true
  if (status === 'modified' && original.length === 0 && modified.length > 0) return true
  return false
}

/** Monaco `hideUnchangedRegions` hides entire new-file diffs when original is empty — disable for creates. */
export function diffEditorMountOptions(
  status: DiffFileStatus,
  originalLength: number,
): {
  renderSideBySide: boolean
  hideUnchangedRegionsEnabled: boolean
} {
  const isNewFile = status === 'created' || (originalLength === 0 && status !== 'deleted')
  if (isNewFile) {
    return { renderSideBySide: false, hideUnchangedRegionsEnabled: false }
  }
  if (status === 'deleted') {
    return { renderSideBySide: false, hideUnchangedRegionsEnabled: false }
  }
  return { renderSideBySide: true, hideUnchangedRegionsEnabled: true }
}
