import { describe, expect, it } from 'vitest'
import {
  AgentTurnReceiptSchema,
  buildTurnRecoverySystemBlock,
  resolveReceiptBoundaryStatus,
  shouldInjectTurnRecoveryHint,
  TURN_RECOVERY_HINT_MARKER,
  TURN_RECOVERY_SYSTEM_BLOCK_MAX_CHARS,
} from './agent-turn-receipt-contract'

const baseReceipt = {
  schemaVersion: 1 as const,
  streamId: 'stream-1',
  endedAt: '2026-05-19T12:00:00.000Z',
  modelId: 'grok-code-fast-1',
  harnessProfileKey: 'grok_code_fast' as const,
  agentProfileId: 'default' as const,
  toolCallsStarted: 2,
  toolCallsCompleted: 1,
}

describe('agent-turn-receipt-contract', () => {
  it('round-trips receipt schema', () => {
    const receipt = { ...baseReceipt, status: 'completed' as const }
    const parsed = AgentTurnReceiptSchema.parse(receipt)
    expect(parsed.streamId).toBe('stream-1')
  })

  it('treats orphan in_progress as interrupted boundary', () => {
    const receipt = { ...baseReceipt, status: 'in_progress' as const }
    expect(resolveReceiptBoundaryStatus(receipt)).toBe('interrupted')
    expect(shouldInjectTurnRecoveryHint(receipt)).toBe(true)
  })

  it('does not inject recovery for cancelled terminal receipt', () => {
    const receipt = { ...baseReceipt, status: 'cancelled' as const }
    expect(shouldInjectTurnRecoveryHint(receipt)).toBe(false)
  })

  it('recovery block includes marker and respects max chars', () => {
    const receipt = { ...baseReceipt, status: 'interrupted' as const, toolCallsStarted: 99 }
    const block = buildTurnRecoverySystemBlock(receipt)
    expect(block).toContain(TURN_RECOVERY_HINT_MARKER)
    expect(block.length).toBeLessThanOrEqual(TURN_RECOVERY_SYSTEM_BLOCK_MAX_CHARS)
  })
})
