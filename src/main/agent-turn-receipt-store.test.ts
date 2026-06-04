import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'

const userDataRoot = mkdtempSync(join(tmpdir(), 'grokforge-receipts-'))

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

import {
  appendTurnReceipt,
  readLastTurnReceipt,
  readLastTurnReceiptBoundaryStatus,
  turnReceiptsPath,
} from '../harness/session/turn-receipt-store'

const projectId = 'proj-receipt-test'

const routingFields = {
  modelId: 'grok-build-0.1',
  harnessProfileKey: 'grok_code_fast' as const,
  agentProfileId: 'default' as const,
}

afterEach(() => {
  rmSync(join(userDataRoot, 'workspace-projects', projectId), { recursive: true, force: true })
})

describe('agent-turn-receipt-store', () => {
  it('appends and reads last receipt', () => {
    appendTurnReceipt(projectId, {
      schemaVersion: 1,
      streamId: 's1',
      status: 'in_progress',
      endedAt: '2026-05-19T10:00:00.000Z',
      toolCallsStarted: 0,
      toolCallsCompleted: 0,
      ...routingFields,
    })
    appendTurnReceipt(projectId, {
      schemaVersion: 1,
      streamId: 's1',
      status: 'completed',
      endedAt: '2026-05-19T10:01:00.000Z',
      toolCallsStarted: 2,
      toolCallsCompleted: 2,
      ...routingFields,
    })
    const last = readLastTurnReceipt(projectId)
    expect(last?.status).toBe('completed')
    expect(readFileSync(turnReceiptsPath(projectId), 'utf8').split('\n').filter(Boolean)).toHaveLength(2)
  })

  it('resolves orphan in_progress as interrupted boundary', () => {
    appendTurnReceipt(projectId, {
      schemaVersion: 1,
      streamId: 's-crash',
      status: 'in_progress',
      endedAt: '2026-05-19T11:00:00.000Z',
      toolCallsStarted: 1,
      toolCallsCompleted: 0,
      ...routingFields,
    })
    expect(readLastTurnReceiptBoundaryStatus(projectId)).toBe('interrupted')
  })

  it('prunes old lines when exceeding max', () => {
    mkdirSync(dirname(turnReceiptsPath(projectId)), { recursive: true })
    for (let i = 0; i < 205; i += 1) {
      appendFileSync(
        turnReceiptsPath(projectId),
        `${JSON.stringify({
          schemaVersion: 1,
          streamId: `s-${i}`,
          status: 'completed',
          endedAt: '2026-05-19T12:00:00.000Z',
          toolCallsStarted: 0,
          toolCallsCompleted: 0,
          ...routingFields,
        })}\n`,
        { flag: i === 0 ? 'w' : 'a' },
      )
    }
    appendTurnReceipt(projectId, {
      schemaVersion: 1,
      streamId: 's-final',
      status: 'completed',
      endedAt: '2026-05-19T12:01:00.000Z',
      toolCallsStarted: 0,
      toolCallsCompleted: 0,
      ...routingFields,
    })
    const lines = readFileSync(turnReceiptsPath(projectId), 'utf8').split('\n').filter(Boolean)
    expect(lines.length).toBeLessThanOrEqual(200)
    expect(readLastTurnReceipt(projectId)?.streamId).toBe('s-final')
  })
})
