import { describe, expect, it } from 'vitest'
import {
  INCREMENTAL_FOLLOW_UP_MAX_CHARS,
  isGreenfieldCreateRequestUserText,
  isIncrementalFollowUpUserText,
  isReplanRequestUserText,
  isSingleFilePrimaryWorkspace,
  primaryNonTrivialFile,
  shouldRoutePostPlanIncremental,
} from '../../../harness-support/plan/routing/post-plan-incremental'

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
    expect(isReplanRequestUserText('plan out a blank todo app')).toBe(true)
    expect(isReplanRequestUserText('empty folder, create a todo app')).toBe(true)
  })

  it('does not match incremental edits', () => {
    expect(isReplanRequestUserText('add delete button')).toBe(false)
  })
})

describe('isGreenfieldCreateRequestUserText', () => {
  it('matches empty/from-scratch create requests', () => {
    expect(isGreenfieldCreateRequestUserText('blank app, create a todo list')).toBe(true)
    expect(isGreenfieldCreateRequestUserText('empty workspace, build a new site')).toBe(true)
    expect(isGreenfieldCreateRequestUserText('no files yet, create project')).toBe(true)
  })

  it('does not match ordinary incremental edits', () => {
    expect(isGreenfieldCreateRequestUserText('add a delete button')).toBe(false)
    expect(isGreenfieldCreateRequestUserText('change the title in index.html')).toBe(false)
  })
})

describe('shouldRoutePostPlanIncremental', () => {
  const base = {
    chatMode: 'fast' as const,
    hasCompletedPlan: true,
    userText: 'add a delete button',
  }

  it('routes populated short edit follow-ups after a completed plan', () => {
    expect(shouldRoutePostPlanIncremental(base)).toBe(true)
  })

  it('blocks stale completed plans when the current workspace is greenfield', () => {
    expect(
      shouldRoutePostPlanIncremental({
        ...base,
        isGreenfieldWorkspace: true,
        userText: 'empty folder, create a todo app and plan out the work',
      }),
    ).toBe(false)
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
