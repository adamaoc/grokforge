import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'

const userDataRoot = mkdtempSync(join(tmpdir(), 'grokforge-sessions-'))

vi.mock('electron', () => ({
  app: { getPath: () => userDataRoot },
}))

vi.mock('../../project/store', async () => {
  const actual = await vi.importActual<typeof import('../../project/store')>('../../project/store')
  return {
    ...actual,
    projectDir: (projectId: string) => join(userDataRoot, 'workspace-projects', projectId),
  }
})

import {
  appendSessionEvent,
  childSessionJsonlPath,
  finalizeSession,
  initChildSessionFile,
  loadSessionEvents,
} from '../../../harness-support/subagent/session-store'

const projectId = 'proj-session-test'
const childSessionId = 'child-abc'

afterEach(() => {
  rmSync(join(userDataRoot, 'workspace-projects', projectId), { recursive: true, force: true })
})

describe('agent-session-store', () => {
  it('writes session_meta and events to jsonl', () => {
    initChildSessionFile(projectId, {
      type: 'session_meta',
      childSessionId,
      parentStreamId: 'parent-stream',
      profileId: 'explorer',
      modelId: 'grok-4.3',
      modelIntent: 'planning',
      createdAt: new Date().toISOString(),
      task: 'Explore auth',
    })
    appendSessionEvent(projectId, childSessionId, {
      type: 'tool_call',
      at: new Date().toISOString(),
      toolCallId: 'tc1',
      toolName: 'read_file',
      arguments: '{}',
    })
    finalizeSession(projectId, childSessionId, 'done', {
      artifact: { summary: 'done', filesRead: ['/a.ts'], searchHits: [] },
    })

    const raw = readFileSync(childSessionJsonlPath(projectId, childSessionId), 'utf8')
    expect(raw).toContain('session_meta')
    expect(raw).toContain('parent-stream')
    const events = loadSessionEvents(projectId, childSessionId)
    expect(events.length).toBeGreaterThanOrEqual(3)
    expect(events[0].type).toBe('session_meta')
  })
})
