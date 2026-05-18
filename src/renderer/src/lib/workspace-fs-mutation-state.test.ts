import { describe, expect, it } from 'vitest'
import { isSameOrDescendantPath, reconcilePathsForMutation, rewritePathForRename } from './workspace-fs-mutation-state'

describe('workspace-fs-mutation-state', () => {
  it('rewrites descendant paths after a folder rename', () => {
    expect(
      rewritePathForRename('/repo/src/components/App.tsx', {
        op: 'rename',
        oldPath: '/repo/src',
        newPath: '/repo/app',
        isDirectory: true,
      }),
    ).toBe('/repo/app/components/App.tsx')
  })

  it('reconciles active/open/dirty paths after a file rename', () => {
    expect(
      reconcilePathsForMutation(
        ['/repo/src/a.ts', '/repo/src/b.ts'],
        '/repo/src/a.ts',
        { '/repo/src/a.ts': true, '/repo/src/b.ts': false },
        { op: 'rename', oldPath: '/repo/src/a.ts', newPath: '/repo/src/renamed.ts', isDirectory: false },
      ),
    ).toEqual({
      openFiles: ['/repo/src/renamed.ts', '/repo/src/b.ts'],
      activeFile: '/repo/src/renamed.ts',
      dirtyFiles: { '/repo/src/renamed.ts': true, '/repo/src/b.ts': false },
    })
  })

  it('closes deleted descendants and chooses the previous remaining tab', () => {
    expect(
      reconcilePathsForMutation(
        ['/repo/src/a.ts', '/repo/docs/readme.md', '/repo/src/nested/b.ts'],
        '/repo/src/nested/b.ts',
        { '/repo/src/a.ts': false, '/repo/docs/readme.md': true, '/repo/src/nested/b.ts': true },
        { op: 'delete', path: '/repo/src', isDirectory: true },
      ),
    ).toEqual({
      openFiles: ['/repo/docs/readme.md'],
      activeFile: '/repo/docs/readme.md',
      dirtyFiles: { '/repo/docs/readme.md': true },
    })
  })

  it('detects exact or descendant paths for delete warnings', () => {
    expect(isSameOrDescendantPath('/repo/src/a.ts', '/repo/src')).toBe(true)
    expect(isSameOrDescendantPath('/repo/source/a.ts', '/repo/src')).toBe(false)
  })
})
