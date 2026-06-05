import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'

const userDataRoot = mkdtempSync(join(tmpdir(), 'grokforge-offload-'))

vi.mock('electron', () => ({
  app: {
    getPath: () => userDataRoot,
  },
}))

vi.mock('./app-project-store', async () => {
  const actual = await vi.importActual<typeof import('./app-project-store')>('./app-project-store')
  return {
    ...actual,
    projectDir: (projectId: string) => join(userDataRoot, 'workspace-projects', projectId),
  }
})

import {
  agentOffloadFilePath,
  isPathUnderProjectAgentOffload,
  writeAgentOffloadFile,
} from '../harness-support/compaction/offload-store'

const projectId = 'proj-offload-test'

afterEach(() => {
  rmSync(join(userDataRoot, 'workspace-projects', projectId), { recursive: true, force: true })
})

describe('agent-offload-store', () => {
  it('writes offload file and path guard accepts it', () => {
    const content = 'needle line 42\n'.repeat(500)
    const { absPath, sha256, lineCount } = writeAgentOffloadFile({
      projectId,
      streamId: 'stream-1',
      toolCallId: 'call-abc',
      content,
    })
    expect(absPath).toBe(agentOffloadFilePath(projectId, 'stream-1', 'call-abc'))
    expect(readFileSync(absPath, 'utf8')).toBe(content)
    expect(sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(lineCount).toBeGreaterThan(1)
    expect(isPathUnderProjectAgentOffload(absPath, projectId)).toBe(true)
    expect(isPathUnderProjectAgentOffload('/etc/passwd', projectId)).toBe(false)
  })
})
