import { describe, expect, it } from 'vitest'
import {
  INCREMENTAL_FOLLOW_UP_MAX_CHARS,
  isIncrementalFollowUpUserText,
  isReplanRequestUserText,
  isSingleFilePrimaryWorkspace,
  primaryNonTrivialFile,
} from '../harness-support/plan/routing/post-plan-incremental'

function indexWithFiles(files: { relativePath: string; basename: string }[]) {
  return {
    intelligence: {
      files,
      packages: [],
      stats: { fileCountScanned: files.length },
    },
  }
}

describe('isReplanRequestUserText', () => {
  it('matches explicit replan phrases', () => {
    expect(isReplanRequestUserText('create a new plan for auth')).toBe(true)
    expect(isReplanRequestUserText('re-plan from scratch')).toBe(true)
    expect(isReplanRequestUserText('plan again please')).toBe(true)
  })

  it('does not match incremental edits', () => {
    expect(isReplanRequestUserText('add delete button')).toBe(false)
  })
})

describe('isIncrementalFollowUpUserText', () => {
  it('accepts short edit-intent follow-ups', () => {
    expect(isIncrementalFollowUpUserText('add delete button')).toBe(true)
    expect(isIncrementalFollowUpUserText('In index.html, change the title')).toBe(true)
  })

  it('rejects replan, empty, and long messages', () => {
    expect(isIncrementalFollowUpUserText('create a new plan')).toBe(false)
    expect(isIncrementalFollowUpUserText('')).toBe(false)
    expect(isIncrementalFollowUpUserText('a'.repeat(INCREMENTAL_FOLLOW_UP_MAX_CHARS + 1))).toBe(
      false,
    )
    expect(isIncrementalFollowUpUserText('thanks for the help')).toBe(false)
  })
})

describe('isSingleFilePrimaryWorkspace', () => {
  it('is true when exactly one non-trivial file', () => {
    expect(
      isSingleFilePrimaryWorkspace(
        indexWithFiles([{ relativePath: 'index.html', basename: 'index.html' }]),
      ),
    ).toBe(true)
  })

  it('ignores trivial files when counting', () => {
    expect(
      isSingleFilePrimaryWorkspace(
        indexWithFiles([
          { relativePath: 'index.html', basename: 'index.html' },
          { relativePath: '.gitkeep', basename: '.gitkeep' },
        ]),
      ),
    ).toBe(true)
  })

  it('is false for multi-file workspaces', () => {
    expect(
      isSingleFilePrimaryWorkspace(
        indexWithFiles([
          { relativePath: 'a.html', basename: 'a.html' },
          { relativePath: 'b.css', basename: 'b.css' },
        ]),
      ),
    ).toBe(false)
  })
})

describe('primaryNonTrivialFile', () => {
  it('returns the sole non-trivial file', () => {
    const file = { relativePath: 'index.html', basename: 'index.html' }
    expect(primaryNonTrivialFile(indexWithFiles([file]))).toEqual(file)
  })
})
