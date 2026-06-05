import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'

const userDataRoot = mkdtempSync(join(tmpdir(), 'grokforge-offload-apply-'))

vi.mock('electron', () => ({
  app: { getPath: () => userDataRoot },
}))

vi.mock('./app-project-store', async () => {
  const actual = await vi.importActual<typeof import('./app-project-store')>('./app-project-store')
  return {
    ...actual,
    projectDir: (projectId: string) => join(userDataRoot, 'workspace-projects', projectId),
  }
})

import { applyToolResultOffload } from '../harness-support/compaction/tool-result-offload'

const projectId = 'proj-apply'

afterEach(() => {
  rmSync(join(userDataRoot, 'workspace-projects', projectId), { recursive: true, force: true })
})

describe('applyToolResultOffload', () => {
  it('passes through small results', () => {
    const small = '{"ok":true}'
    const out = applyToolResultOffload({
      projectId,
      streamId: 's1',
      toolCallId: 'c1',
      toolContent: small,
    })
    expect(out.offloaded).toBe(false)
    expect(out.providerContent).toBe(small)
  })

  it('writes disk and returns pointer for large results', () => {
    const big = Array.from({ length: 400 }, (_, i) => `row ${i} ${'x'.repeat(40)}`).join('\n')
    const out = applyToolResultOffload({
      projectId,
      streamId: 's1',
      toolCallId: 'c1',
      toolContent: big,
    })
    expect(out.offloaded).toBe(true)
    expect(out.providerChars).toBeLessThan(2_000)
    expect(out.offloadPath).toBeTruthy()
    expect(readFileSync(out.offloadPath!, 'utf8')).toBe(big)
  })
})
