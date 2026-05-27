/**
 * node-pty prebuilds ship spawn-helper without the executable bit on some installs
 * (umask, copy, or archive extract). PTY spawn then fails with posix_spawnp failed.
 */
import { accessSync, chmodSync, constants } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(fileURLToPath(import.meta.url))

function ensureExecutable(filePath) {
  try {
    accessSync(filePath, constants.F_OK)
  } catch {
    return false
  }
  try {
    chmodSync(filePath, 0o755)
    return true
  } catch (e) {
    console.warn(`[ensure-node-pty-executable] could not chmod ${filePath}:`, e)
    return false
  }
}

const pkgDir = dirname(require.resolve('node-pty/package.json'))
const relDirs = [
  join('prebuilds', `${process.platform}-${process.arch}`),
  'build/Release',
  'build/Debug',
]

let fixed = 0
for (const rel of relDirs) {
  if (ensureExecutable(join(pkgDir, rel, 'spawn-helper'))) fixed += 1
}

if (fixed > 0) {
  console.log(`[ensure-node-pty-executable] set +x on ${fixed} spawn-helper path(s)`)
}
