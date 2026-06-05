import { describe, expect, it } from 'vitest'
import type { AgentModelChatMessage } from './agent-model-message'
import { buildContextBudgetReport } from '../harness-support/compaction/turn-snapshot'

describe('buildContextBudgetReport offload', () => {
  it('counts pointer size in toolResultChars and tracks offloaded original', () => {
    const pointer = JSON.stringify({
      ok: true,
      offloaded: true,
      originalChars: 50_000,
      offloadPath: '/tmp/offload.txt',
      preview: 'line',
    })
    const messages: AgentModelChatMessage[] = [
      { role: 'user', content: 'hi' },
      { role: 'tool', tool_call_id: '1', content: pointer },
    ]
    const report = buildContextBudgetReport([], messages)
    expect(report.toolResultChars).toBe(pointer.length)
    expect(report.toolResultChars).toBeLessThan(2_000)
    expect(report.toolResultOffloadedOriginalChars).toBe(50_000)
  })
})
