import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  derivePlanUiPhase,
  getPlanInteraction,
  patchPlanInteraction,
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

    const done = setPlanRunPhase(PROJECT, 'msg-1', 'done', 2)
    expect(derivePlanUiPhase(done, {})).toBe('done')
  })

  it('derives planning when global planning turn is active', () => {
    const st = getPlanInteraction(PROJECT, 'msg-1', 2)
    expect(derivePlanUiPhase(st, { globalPlanningTurn: true })).toBe('planning')
  })

  it('derives approved_idle after approve without runPhase', () => {
    const st = patchPlanInteraction(PROJECT, 'msg-1', { status: 'approved' }, 2)
    expect(derivePlanUiPhase(st, {})).toBe('approved_idle')
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
