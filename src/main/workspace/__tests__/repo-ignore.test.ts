import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, beforeEach } from 'vitest'
import { shouldIgnoreFsEntry } from '../ignore-globs'
import { invalidateRepoIgnoreCheckerCache, isIgnoredByRepoIgnoreFiles } from '../repo-ignore'

describe('repo-ignore (.gitignore / .cursorignore)', () => {
  beforeEach(() => {
    invalidateRepoIgnoreCheckerCache()
  })

  it('honors root .gitignore with empty manifest ignore patterns', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-repoig-'))
    mkdirSync(join(root, 'coverage', 'nested'), { recursive: true })
    writeFileSync(join(root, '.gitignore'), 'coverage/\n')
    writeFileSync(join(root, 'coverage', 'nested', 'out.json'), '{}')
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(join(root, 'src', 'keep.ts'), '// x')

    const roots = [{ path: root }]
    expect(shouldIgnoreFsEntry(join(root, 'coverage', 'nested', 'out.json'), roots, [])).toBe(true)
    expect(shouldIgnoreFsEntry(join(root, 'src', 'keep.ts'), roots, [])).toBe(false)
  })

  it('honors one-level-deep .gitignore relative to that folder', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-repoig-child-'))
    mkdirSync(join(root, 'web', 'dist'), { recursive: true })
    writeFileSync(join(root, 'web', '.gitignore'), 'dist/\n')
    writeFileSync(join(root, 'web', 'dist', 'bundle.js'), '')
    mkdirSync(join(root, 'web', 'src'), { recursive: true })
    writeFileSync(join(root, 'web', 'src', 'a.ts'), '')

    const roots = [{ path: root }]
    expect(shouldIgnoreFsEntry(join(root, 'web', 'dist', 'bundle.js'), roots, [])).toBe(true)
    expect(shouldIgnoreFsEntry(join(root, 'web', 'src', 'a.ts'), roots, [])).toBe(false)
  })

  it('does not load .gitignore two levels below workspace root', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-repoig-deep-'))
    mkdirSync(join(root, 'a', 'b'), { recursive: true })
    writeFileSync(join(root, 'a', 'b', '.gitignore'), '*\n')
    writeFileSync(join(root, 'a', 'b', 'file.txt'), 'x')

    const roots = [{ path: root }]
    expect(isIgnoredByRepoIgnoreFiles(join(root, 'a', 'b', 'file.txt'), roots)).toBe(false)
  })

  it('merges .cursorignore after .gitignore at root', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-repoig-cursor-'))
    writeFileSync(join(root, '.gitignore'), '*.log\n')
    writeFileSync(join(root, '.cursorignore'), 'secrets/\n')
    mkdirSync(join(root, 'secrets'), { recursive: true })
    writeFileSync(join(root, 'secrets', 'x.env'), '')
    writeFileSync(join(root, 'app.log'), '')

    const roots = [{ path: root }]
    expect(shouldIgnoreFsEntry(join(root, 'app.log'), roots, [])).toBe(true)
    expect(shouldIgnoreFsEntry(join(root, 'secrets', 'x.env'), roots, [])).toBe(true)
  })

  it('treats directory-only gitignore patterns (trailing slash) for the folder entry itself', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-repoig-dirslash-'))
    mkdirSync(join(root, 'build', 'out'), { recursive: true })
    writeFileSync(join(root, '.gitignore'), 'build/\n')
    writeFileSync(join(root, 'build', 'out', 'x.js'), '')

    const roots = [{ path: root }]
    expect(shouldIgnoreFsEntry(join(root, 'build'), roots, [])).toBe(true)
    expect(shouldIgnoreFsEntry(join(root, 'build', 'out', 'x.js'), roots, [])).toBe(true)
  })

  it('manifest ignore is evaluated before repo ignores', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-repoig-manifest-'))
    writeFileSync(join(root, '.gitignore'), '!special.log\n')
    writeFileSync(join(root, 'special.log'), '')

    const roots = [{ path: root }]
    expect(shouldIgnoreFsEntry(join(root, 'special.log'), roots, ['**/special.log'])).toBe(true)
  })
})
