import { describe, expect, it } from 'vitest'
import { resolveReasoningEffort } from './agent-reasoning-effort'

describe('resolveReasoningEffort', () => {
  it('returns medium for grok_4_3 planner turns', () => {
    expect(
      resolveReasoningEffort({
        modelId: 'grok-4.3',
        harnessProfileKey: 'grok_4_3',
        agentProfileId: 'planner',
        modelIntent: 'planning',
      }),
    ).toBe('medium')
  })

  it('returns low for grok_4_3 executor turns', () => {
    expect(
      resolveReasoningEffort({
        modelId: 'grok-4.3',
        harnessProfileKey: 'grok_4_3',
        agentProfileId: 'executor',
        modelIntent: 'execution',
      }),
    ).toBe('low')
  })

  it('omits effort for grok_code_fast / build models', () => {
    expect(
      resolveReasoningEffort({
        modelId: 'grok-build-0.1',
        harnessProfileKey: 'grok_code_fast',
        agentProfileId: 'default',
        modelIntent: 'chat_default',
      }),
    ).toBeUndefined()
  })

  it('omits effort for generic profile', () => {
    expect(
      resolveReasoningEffort({
        modelId: 'grok-4.20-0309-reasoning',
        harnessProfileKey: 'generic',
        agentProfileId: 'default',
        modelIntent: 'chat_default',
      }),
    ).toBeUndefined()
  })
})
