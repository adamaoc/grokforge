import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { shouldIgnoreFsEntry } from './ignore-globs'

describe('shouldIgnoreFsEntry', () => {
  const root = join(process.cwd(), 'fixture-workspace-root')

  it('matches **/*.log for nested log files', () => {
    const entry = join(root, 'logs', 'nested', 'trace.log')
    expect(shouldIgnoreFsEntry(entry, [{ path: root }], ['**/*.log'])).toBe(true)
  })

  it('does not match plain files when only **/*.log is ignored', () => {
    const entry = join(root, 'src', 'main.ts')
    expect(shouldIgnoreFsEntry(entry, [{ path: root }], ['**/*.log'])).toBe(false)
  })

  it('matches **/node_modules but not a name that merely contains node_modules', () => {
    const ignored = join(root, 'vendor', 'node_modules', 'left-pad')
    const rootLevelIgnored = join(root, 'node_modules', 'left-pad')
    const notIgnored = join(root, 'lib', 'notnode_modules', 'index.js')
    const patterns = ['**/node_modules', '**/.git']
    expect(shouldIgnoreFsEntry(ignored, [{ path: root }], patterns)).toBe(true)
    expect(shouldIgnoreFsEntry(rootLevelIgnored, [{ path: root }], patterns)).toBe(true)
    expect(shouldIgnoreFsEntry(notIgnored, [{ path: root }], patterns)).toBe(false)
  })

  it('matches macOS .DS_Store metadata files', () => {
    const rootLevel = join(root, '.DS_Store')
    const nested = join(root, 'src', '.DS_Store')
    const patterns = ['**/.DS_Store']
    expect(shouldIgnoreFsEntry(rootLevel, [{ path: root }], patterns)).toBe(true)
    expect(shouldIgnoreFsEntry(nested, [{ path: root }], patterns)).toBe(true)
  })

  it('matches Next.js .next and default static export out trees', () => {
    const patterns = ['**/.next', '**/out']
    const nextServer = join(root, 'web', '.next', 'server', 'app.js')
    const exportAsset = join(root, 'web', 'out', '_next', 'static', 'chunk.js')
    expect(shouldIgnoreFsEntry(nextServer, [{ path: root }], patterns)).toBe(true)
    expect(shouldIgnoreFsEntry(exportAsset, [{ path: root }], patterns)).toBe(true)
    expect(shouldIgnoreFsEntry(join(root, 'web', 'src', 'app', 'page.tsx'), [{ path: root }], patterns)).toBe(
      false,
    )
  })

  it('uses the longest manifest root when paths nest', () => {
    const outer = join(root, 'mono')
    const inner = join(outer, 'app')
    const roots = [{ path: outer }, { path: inner }]
    const fileInInner = join(inner, 'ignored.log')
    // Relative to inner: ignored.log — should hit **/*.log
    expect(shouldIgnoreFsEntry(fileInInner, roots, ['**/*.log'])).toBe(true)
    const fileAtOuter = join(outer, 'sibling.log')
    // Relative to outer (inner does not contain this path): sibling.log
    expect(shouldIgnoreFsEntry(fileAtOuter, roots, ['**/app/**/*.log'])).toBe(false)
    expect(shouldIgnoreFsEntry(fileAtOuter, roots, ['**/*.log'])).toBe(true)
  })
})
