import { describe, expect, it } from 'vitest'
import { diffEditorMountOptions, shouldUseFullContentPreview } from './diff-editor-mount-options'

describe('shouldUseFullContentPreview', () => {
  it('uses full preview for new and deleted files', () => {
    expect(shouldUseFullContentPreview('created', '', '<html></html>')).toBe(true)
    expect(shouldUseFullContentPreview('deleted', 'old', '')).toBe(true)
    expect(shouldUseFullContentPreview('modified', 'a', 'b')).toBe(false)
  })
})

describe('diffEditorMountOptions', () => {
  it('disables hideUnchangedRegions for new files', () => {
    expect(diffEditorMountOptions('created', 0)).toEqual({
      renderSideBySide: false,
      hideUnchangedRegionsEnabled: false,
    })
  })

  it('keeps side-by-side diff for modifications', () => {
    expect(diffEditorMountOptions('modified', 120)).toEqual({
      renderSideBySide: true,
      hideUnchangedRegionsEnabled: true,
    })
  })
})
