import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  derivePlanUiPhase,
  getPlanInteraction,
  isStreamingGfPlanFenceContent,
  patchPlanInteraction,
  planUiPhaseLabel,
  resolvePlanWorkflowPhase,
  setPlanRunPhase,
  supersedePendingPlansBeforeNewUserMessage,
} from './plan-interaction-storage'

const PROJECT = 'test-proj-098'

function createStorage() {
  const store: Record<string, string> = {}
  return {
    getItem(key: string) {
      return store[key] ?? null
    },
    setItem(key: string, value: string) {
      store[key] = value
    },
    removeItem(key: string) {
      delete store[key]
    },
    clear() {
      for (const key of Object.keys(store)) delete store[key]
    },
  }
}

describe('plan-interaction-storage', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage())
  })

  it('defaults to pending without runPhase', () => {
    const st = getPlanInteraction(PROJECT, 'msg-1', 3)
    expect(st.status).toBe('pending')
    expect(st.runPhase).toBeUndefined()
    expect(derivePlanUiPhase(st, {})).toBe('pending')
  })

  it('patches runPhase through setPlanRunPhase', () => {
    patchPlanInteraction(PROJECT, 'msg-1', { status: 'approved' }, 2)
    const executing = setPlanRunPhase(PROJECT, 'msg-1', 'executing', 2)
    expect(executing.runPhase).toBe('executing')
    expect(derivePlanUiPhase(executing, { isExecutingThisPlan: true })).toBe('executing')
    expect(derivePlanUiPhase(executing, { isExecutingThisPlan: false })).toBe('approved_idle')
    expect(
      derivePlanUiPhase(executing, {
        isExecutingThisPlan: false,
        staleExecutingRunPhase: true,
      }),
    ).toBe('needs_review')

    const done = setPlanRunPhase(PROJECT, 'msg-1', 'done', 2)
    expect(derivePlanUiPhase(done, {})).toBe('done')

    const needsReview = setPlanRunPhase(PROJECT, 'msg-1', 'needs_review', 2)
    expect(derivePlanUiPhase(needsReview, {})).toBe('needs_review')
    expect(planUiPhaseLabel('needs_review')).toBe('Review changes')
  })

  it('labels awaiting_plan for composer idle', () => {
    expect(planUiPhaseLabel('awaiting_plan')).toBe('Ready to plan')
  })

  it('derives planning when global planning turn is active', () => {
    const st = getPlanInteraction(PROJECT, 'msg-1', 2)
    expect(derivePlanUiPhase(st, { globalPlanningTurn: true })).toBe('planning')
  })

  it('derives approved_idle after approve without runPhase', () => {
    const st = patchPlanInteraction(PROJECT, 'msg-1', { status: 'approved' }, 2)
    expect(derivePlanUiPhase(st, {})).toBe('approved_idle')
  })

  it('resolvePlanWorkflowPhase returns awaiting_plan with no plan in thread', () => {
    expect(
      resolvePlanWorkflowPhase({
        conversationMode: 'plan',
        busy: false,
        executingPlanMessageId: null,
        projectId: PROJECT,
        messages: [{ id: 'u1', role: 'user', content: 'build a todo app' }],
      }),
    ).toBe('awaiting_plan')
  })

  it('resolvePlanWorkflowPhase returns planning while busy in plan mode', () => {
    expect(
      resolvePlanWorkflowPhase({
        conversationMode: 'plan',
        busy: true,
        liveChatMode: 'plan',
        executingPlanMessageId: null,
        projectId: PROJECT,
        messages: [],
      }),
    ).toBe('planning')
  })

  it('resolvePlanWorkflowPhase prefers executing over stale plan-mode busy during approve-and-run', () => {
    const planContent =
      '```gf-plan\n{"schemaVersion":1,"summary":"s","filesLikelyTouched":[],"risksUnknowns":[],"steps":[{"id":"1","title":"t"}],"verification":"v"}\n```'
    patchPlanInteraction(PROJECT, 'a1', { status: 'approved' }, 1)
    setPlanRunPhase(PROJECT, 'a1', 'executing', 1)
    expect(
      resolvePlanWorkflowPhase({
        conversationMode: 'plan',
        busy: true,
        liveChatMode: 'plan',
        executingPlanMessageId: 'a1',
        executingPlanStepCount: 1,
        projectId: PROJECT,
        messages: [{ id: 'a1', role: 'assistant', content: planContent }],
      }),
    ).toBe('executing')
  })

  it('resolvePlanWorkflowPhase returns planning for streaming gf-plan fence', () => {
    expect(
      resolvePlanWorkflowPhase({
        conversationMode: 'plan',
        busy: false,
        isStreamingPlanFence: true,
        executingPlanMessageId: null,
        projectId: PROJECT,
        messages: [],
      }),
    ).toBe('planning')
  })

  it('resolvePlanWorkflowPhase shows done on plan card after execute when composer is Work', () => {
    const planContent =
      '```gf-plan\n{"schemaVersion":1,"summary":"s","filesLikelyTouched":[],"risksUnknowns":[],"steps":[{"id":"1","title":"t"}],"verification":"v"}\n```'
    patchPlanInteraction(PROJECT, 'a1', { status: 'approved' }, 1)
    setPlanRunPhase(PROJECT, 'a1', 'done', 1)
    expect(
      resolvePlanWorkflowPhase({
        conversationMode: 'normal',
        busy: false,
        executingPlanMessageId: null,
        projectId: PROJECT,
        messages: [{ id: 'a1', role: 'assistant', content: planContent }],
      }),
    ).toBe('done')
  })

  it('resolvePlanWorkflowPhase returns pending only after plan exists and idle', () => {
    const planContent =
      '```gf-plan\n{"schemaVersion":1,"summary":"s","filesLikelyTouched":[],"risksUnknowns":[],"steps":[{"id":"1","title":"t"}],"verification":"v"}\n```'
    expect(
      resolvePlanWorkflowPhase({
        conversationMode: 'plan',
        busy: false,
        executingPlanMessageId: null,
        projectId: PROJECT,
        messages: [{ id: 'a1', role: 'assistant', content: planContent }],
      }),
    ).toBe('pending')
  })

  it('resolvePlanWorkflowPhase treats stale executing runPhase as needs_review when idle', () => {
    const planContent =
      '```gf-plan\n{"schemaVersion":1,"summary":"s","filesLikelyTouched":[],"risksUnknowns":[],"steps":[{"id":"1","title":"t"}],"verification":"v"}\n```'
    patchPlanInteraction(PROJECT, 'a1', { status: 'approved' }, 1)
    setPlanRunPhase(PROJECT, 'a1', 'executing', 1)
    expect(
      resolvePlanWorkflowPhase({
        conversationMode: 'normal',
        busy: false,
        executingPlanMessageId: 'a1',
        executingPlanStepCount: 1,
        projectId: PROJECT,
        messages: [{ id: 'a1', role: 'assistant', content: planContent }],
      }),
    ).toBe('needs_review')
  })

  it('isStreamingGfPlanFenceContent is true before JSON validates', () => {
    expect(isStreamingGfPlanFenceContent('```gf-plan\n{"schemaVersion":1')).toBe(true)
    expect(
      isStreamingGfPlanFenceContent(
        '```gf-plan\n{"schemaVersion":1,"summary":"s","filesLikelyTouched":[],"risksUnknowns":[],"steps":[{"id":"1","title":"t"}],"verification":"v"}\n```',
      ),
    ).toBe(false)
  })

  it('supersedes pending plans on new user message', () => {
    patchPlanInteraction(PROJECT, 'plan-a', { status: 'pending' }, 1)
    patchPlanInteraction(PROJECT, 'plan-b', { status: 'approved' }, 1)
    supersedePendingPlansBeforeNewUserMessage(PROJECT, [
      {
        id: 'plan-a',
        role: 'assistant',
        content: '```gf-plan\n{"schemaVersion":1,"summary":"s","filesLikelyTouched":[],"risksUnknowns":[],"steps":[{"id":"1","title":"t"}],"verification":"v"}\n```',
      },
      {
        id: 'plan-b',
        role: 'assistant',
        content: '```gf-plan\n{"schemaVersion":1,"summary":"s","filesLikelyTouched":[],"risksUnknowns":[],"steps":[{"id":"1","title":"t"}],"verification":"v"}\n```',
      },
    ])
    expect(getPlanInteraction(PROJECT, 'plan-a', 1).status).toBe('superseded')
    expect(getPlanInteraction(PROJECT, 'plan-b', 1).status).toBe('approved')
  })
})
