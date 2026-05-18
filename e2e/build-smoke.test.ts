import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

describe('production bundle (019)', () => {
  it('dist contains main, preload, and renderer entry', () => {
    expect(existsSync(path.join(repoRoot, 'dist/main/main.js'))).toBe(true)
    expect(existsSync(path.join(repoRoot, 'dist/preload/preload.js'))).toBe(true)
    expect(existsSync(path.join(repoRoot, 'dist/renderer/index.html'))).toBe(true)
  })
})
