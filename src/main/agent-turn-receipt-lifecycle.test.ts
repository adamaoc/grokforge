import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'

const userDataRoot = mkdtempSync(join(tmpdir(), 'grokforge-receipt-life-'))

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

import { readLastTurnReceipt } from './agent-turn-receipt-store'
import {
  _resetTurnReceiptLifecycleForTesting,
  beginTurnReceipt,
  consumeTurnRecoveryHint,
  finalizeTurnReceipt,
  flushActiveAgentTurnReceiptsAsInterrupted,
  trackTurnReceiptActivity,
} from './agent-turn-receipt-lifecycle'

const projectId = 'proj-life'
const routing = {
  modelIntent: 'chat_default' as const,
  modelId: 'grok-build-0.1',
  harnessProfileKey: 'grok_code_fast' as const,
  agentProfileId: 'default' as const,
}

afterEach(() => {
  _resetTurnReceiptLifecycleForTesting()
  rmSync(join(userDataRoot, 'workspace-projects', projectId), { recursive: true, force: true })
})

describe('agent-turn-receipt-lifecycle', () => {
  it('writes cancelled terminal receipt on user cancel flow', () => {
    beginTurnReceipt(projectId, 'stream-cancel', routing)
    trackTurnReceiptActivity('stream-cancel', 'running')
    trackTurnReceiptActivity('stream-cancel', 'done')
    finalizeTurnReceipt('stream-cancel', 'cancelled')
    expect(readLastTurnReceipt(projectId)?.status).toBe('cancelled')
    expect(readLastTurnReceipt(projectId)?.toolCallsStarted).toBe(1)
    expect(readLastTurnReceipt(projectId)?.toolCallsCompleted).toBe(1)
  })

  it('flush writes interrupted receipt for in-flight turn', () => {
    beginTurnReceipt(projectId, 'stream-quit', routing)
    const emitted: string[] = []
    flushActiveAgentTurnReceiptsAsInterrupted({
      emit: (p) => {
        if (p.phase === 'activity_clear_running') emitted.push(p.reason)
      },
      abortTurn: () => {},
    })
    expect(emitted).toEqual(['interrupted'])
    expect(readLastTurnReceipt(projectId)?.status).toBe('interrupted')
  })

  it('consumes recovery hint once for orphan in_progress', () => {
    beginTurnReceipt(projectId, 'stream-crash', routing)
    expect(consumeTurnRecoveryHint(projectId)).toContain('GROKFORGE_TURN_RECOVERY_HINT')
    expect(consumeTurnRecoveryHint(projectId)).toBeNull()
  })
})
