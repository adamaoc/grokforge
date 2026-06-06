import { describe, expect, it } from 'vitest'
import { isPathWithinWorkspaceRoots } from '../path-guard'

describe('isPathWithinWorkspaceRoots', () => {
  const roots = [{ path: '/proj/apps/web' }, { path: '/proj/libs/shared' }]

  it('accepts exact root and descendants', () => {
    expect(isPathWithinWorkspaceRoots('/proj/apps/web', roots)).toBe(true)
    expect(isPathWithinWorkspaceRoots('/proj/apps/web/src/index.ts', roots)).toBe(true)
    expect(isPathWithinWorkspaceRoots('/proj/libs/shared/package.json', roots)).toBe(true)
  })

  it('rejects sibling paths and parents', () => {
    expect(isPathWithinWorkspaceRoots('/proj/apps', roots)).toBe(false)
    expect(isPathWithinWorkspaceRoots('/proj/other', roots)).toBe(false)
    expect(isPathWithinWorkspaceRoots('/etc/passwd', roots)).toBe(false)
  })
})
