import { describe, expect, it } from 'vitest'
import { isPathUnderWorkspaceRoots, normalizeFsPath } from './workspace-path-check'

describe('workspace-path-check', () => {
  const roots = [{ path: '/proj/GrokForgev02', label: 'Main' }]

  it('normalizeFsPath collapses segments', () => {
    expect(normalizeFsPath('/a/b/../b/c')).toBe('/a/b/c')
  })

  it('accepts descendant under root', () => {
    expect(isPathUnderWorkspaceRoots('/proj/GrokForgev02/src/main/main.ts', roots)).toBe(true)
  })

  it('rejects sibling folder with similar name', () => {
    expect(isPathUnderWorkspaceRoots('/proj/GrokForge/main.ts', roots)).toBe(false)
  })
})
