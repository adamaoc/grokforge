import { accessSync, chmodSync, constants } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

let ensured = false

/** node-pty spawn-helper must be executable; some installs lose +x on prebuilds. */
export function ensureNodePtySpawnHelperExecutable(): void {
  if (ensured || process.platform === 'win32') return
  ensured = true
  try {
    const require = createRequire(import.meta.url)
    const pkgDir = dirname(require.resolve('node-pty/package.json'))
    const relDirs = [
      join('prebuilds', `${process.platform}-${process.arch}`),
      join('build', 'Release'),
      join('build', 'Debug'),
    ]
    for (const rel of relDirs) {
      const helper = join(pkgDir, rel, 'spawn-helper')
      try {
        accessSync(helper, constants.F_OK)
        chmodSync(helper, 0o755)
      } catch {
        // missing path — try next
      }
    }
  } catch {
    // node-pty not installed (tests mocking PTY only)
  }
}
