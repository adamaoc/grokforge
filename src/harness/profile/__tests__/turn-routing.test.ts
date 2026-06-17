import { describe, expect, it } from 'vitest'
import type { GrokProjectManifest } from '../../../main/project/manifest'
import type { AgentChatStartPayload } from '../../../shared/agent/chat-contract'
import { PLAN_PROFILE } from '../plan-profile'
import {
  resolveHarnessProfile,
  resolveHarnessTurnMode,
  resolveHarnessTurnRouting,
} from '../turn-routing'
import { WORK_PROFILE } from '../work-profile'

function testManifest(): GrokProjectManifest {
  return {
    version: 1,
    name: 'Test',
    roots: [{ id: 'root', path: '/tmp/proj', label: 'Proj' }],
    ignore: [],
    context: {},
    models: {
      default: 'grok-build-0.1',
      planning: 'grok-4.3',
      execution: 'grok-build-0.1',
      reasoning: 'grok-4.20-0309-reasoning',
      voice: 'grok-voice-latest',
    },
    voice: { defaultVoiceMode: 'off' },
  }
}

function basePayload(chatMode: 'fast' | 'plan'): AgentChatStartPayload {
  return {
    streamId: 's1',
    model: 'grok-build-0.1',
    userText: 'plan something',
    threadSnapshot: [],
    activeContext: { openTabs: [], chatMode },
  }
}

describe('resolveHarnessTurnMode', () => {
  it('selects plan when chatMode is plan', () => {
    expect(resolveHarnessTurnMode(basePayload('plan'))).toBe('plan')
  })

  it('selects work when chatMode is fast', () => {
    expect(resolveHarnessTurnMode(basePayload('fast'))).toBe('work')
  })
})

describe('resolveHarnessProfile', () => {
  it('returns plan profile for plan mode', () => {
    expect(resolveHarnessProfile(basePayload('plan'))).toEqual(PLAN_PROFILE)
  })

  it('returns work profile for work mode', () => {
    expect(resolveHarnessProfile(basePayload('fast'))).toEqual(WORK_PROFILE)
  })
})

describe('resolveHarnessTurnRouting', () => {
  it('routes plan mode to planning model and planner profile', () => {
    const routing = resolveHarnessTurnRouting(testManifest(), basePayload('plan'))
    expect(routing.modelIntent).toBe('planning')
    expect(routing.modelId).toBe('grok-4.3')
    expect(routing.agentProfileId).toBe('planner')
    expect(routing.harnessProfileKey).toBe('grok_4_3')
  })

  it('routes work mode to default model', () => {
    const routing = resolveHarnessTurnRouting(testManifest(), basePayload('fast'))
    expect(routing.modelIntent).toBe('chat_default')
    expect(routing.modelId).toBe('grok-build-0.1')
    expect(routing.agentProfileId).toBe('default')
  })

  it('routes approve-and-run to execution model and executor profile', () => {
    const routing = resolveHarnessTurnRouting(testManifest(), {
      ...basePayload('fast'),
      isApprovedPlanAutoRun: true,
      modelIntent: 'execution',
      approvedPlanId: '11111111-1111-4111-8111-111111111111',
    })
    expect(routing.modelIntent).toBe('execution')
    expect(routing.modelId).toBe('grok-build-0.1')
    expect(routing.agentProfileId).toBe('executor')
  })
})

describe('resolveHarnessTurnMode (approve-and-run)', () => {
  it('forces work mode when isApprovedPlanAutoRun even if chatMode is plan', () => {
    expect(
      resolveHarnessTurnMode({
        ...basePayload('plan'),
        isApprovedPlanAutoRun: true,
      }),
    ).toBe('work')
  })

  it('returns work profile for approve-and-run', () => {
    expect(
      resolveHarnessProfile({
        ...basePayload('plan'),
        isApprovedPlanAutoRun: true,
      }),
    ).toEqual(WORK_PROFILE)
  })
})