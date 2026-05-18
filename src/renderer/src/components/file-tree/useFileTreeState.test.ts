import { describe, expect, it } from 'vitest'
import { refreshDirectoriesForPaths } from './useFileTreeState'

describe('refreshDirectoriesForPaths', () => {
  it('maps touched paths to their parent directories', () => {
    expect(
      refreshDirectoriesForPaths('/repo', ['/repo/src/a.ts', '/repo/docs/readme.md']),
    ).toEqual(['/repo/src', '/repo/docs'])
  })

  it('keeps root refreshes rooted at the workspace', () => {
    expect(refreshDirectoriesForPaths('/repo', ['/repo'])).toEqual(['/repo'])
  })
})
