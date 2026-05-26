import { describe, expect, it } from 'vitest'
import { resolveAgentChatModelIntent, resolveAgentTurnRouting } from './agent-turn-routing'
import type { ModelRoutingManifest } from './model-router'

const manifest: ModelRoutingManifest = {
  models: {
    default: 'custom-fast',
    planning: 'custom-plan',
    execution: 'custom-exec',
    reasoning: 'custom-reason',
    voice: 'custom-voice',
  },
}

const fastCtx = { chatMode: 'fast' as const, openTabs: [] }
const planCtx = { chatMode: 'plan' as const, openTabs: [] }

describe('resolveAgentChatModelIntent', () => {
  it('forces execution when isApprovedPlanAutoRun', () => {
    expect(
      resolveAgentChatModelIntent({
        isApprovedPlanAutoRun: true,
        modelIntent: 'planning',
        activeContext: fastCtx,
      }),
    ).toBe('execution')
  })

  it('forces execution when postPlanIncremental without chip', () => {
    expect(
      resolveAgentChatModelIntent({
        postPlanIncremental: true,
        activeContext: fastCtx,
      }),
    ).toBe('execution')
  })

  it('honors explicit chip over postPlanIncremental', () => {
    expect(
      resolveAgentChatModelIntent({
        postPlanIncremental: true,
        modelIntent: 'chat_default',
        activeContext: fastCtx,
      }),
    ).toBe('chat_default')
  })

  it('uses explicit modelIntent when provided', () => {
    expect(
      resolveAgentChatModelIntent({
        modelIntent: 'execution',
        activeContext: fastCtx,
      }),
    ).toBe('execution')
  })

  it('infers planning from plan chatMode when chip omitted', () => {
    expect(
      resolveAgentChatModelIntent({
        activeContext: planCtx,
      }),
    ).toBe('planning')
  })

  it('honors chat_default chip in plan mode', () => {
    expect(
      resolveAgentChatModelIntent({
        modelIntent: 'chat_default',
        activeContext: planCtx,
      }),
    ).toBe('chat_default')
  })

  it('infers chat_default from fast chatMode', () => {
    expect(
      resolveAgentChatModelIntent({
        activeContext: fastCtx,
      }),
    ).toBe('chat_default')
  })
})

describe('resolveAgentTurnRouting', () => {
  it('resolves manifest model id and harness profile key', () => {
    const routing = resolveAgentTurnRouting(manifest, {
      modelIntent: 'planning',
      activeContext: planCtx,
    })
    expect(routing.modelId).toBe('custom-plan')
    expect(routing.harnessProfileKey).toBe('generic')
  })

  it('maps grok-4.3 to grok_4_3 profile key', () => {
    const routing = resolveAgentTurnRouting(
      {
        models: {
          default: 'grok-build-0.1',
          planning: 'grok-4.3',
          execution: 'grok-build-0.1',
          reasoning: 'grok-4.20-0309-reasoning',
          voice: 'grok-voice-latest',
        },
      },
      { activeContext: planCtx },
    )
    expect(routing.modelIntent).toBe('planning')
    expect(routing.modelId).toBe('grok-4.3')
    expect(routing.harnessProfileKey).toBe('grok_4_3')
    expect(routing.agentProfileId).toBe('planner')
    expect(routing.reasoningEffort).toBe('medium')
  })

  it('keeps planner profile when plan mode uses fast chip', () => {
    const routing = resolveAgentTurnRouting(manifest, {
      modelIntent: 'chat_default',
      activeContext: planCtx,
    })
    expect(routing.modelIntent).toBe('chat_default')
    expect(routing.modelId).toBe('custom-fast')
    expect(routing.agentProfileId).toBe('planner')
  })

  it('sets executor profile for execution intent on fast mode', () => {
    const routing = resolveAgentTurnRouting(
      {
        models: {
          default: 'grok-build-0.1',
          planning: 'grok-4.3',
          execution: 'grok-build-0.1',
          reasoning: 'grok-4.20-0309-reasoning',
          voice: 'grok-voice-latest',
        },
      },
      {
        modelIntent: 'execution',
        activeContext: fastCtx,
      },
    )
    expect(routing.agentProfileId).toBe('executor')
    expect(routing.reasoningEffort).toBeUndefined()
  })

  it('approve-and-run uses execution model and executor profile by default', () => {
    const routing = resolveAgentTurnRouting(manifest, {
      isApprovedPlanAutoRun: true,
      activeContext: fastCtx,
    })
    expect(routing.modelIntent).toBe('execution')
    expect(routing.modelId).toBe('custom-exec')
    expect(routing.agentProfileId).toBe('executor')
  })

  it('uses default profile for planning chip on fast mode', () => {
    const routing = resolveAgentTurnRouting(manifest, {
      modelIntent: 'planning',
      activeContext: fastCtx,
    })
    expect(routing.modelIntent).toBe('planning')
    expect(routing.agentProfileId).toBe('default')
  })

  it('postPlanIncremental uses execution model and executor profile', () => {
    const routing = resolveAgentTurnRouting(manifest, {
      postPlanIncremental: true,
      activeContext: fastCtx,
    })
    expect(routing.modelIntent).toBe('execution')
    expect(routing.modelId).toBe('custom-exec')
    expect(routing.agentProfileId).toBe('executor')
  })
})
