import { describe, expect, it } from 'vitest'
import {
  chatModeDisplayLabel,
  conversationModeLabel,
  shouldDefaultGreenfieldToPlan,
  shouldExitPlanAfterExecuteComplete,
  shouldVelocityExitPlanAfterGfPlan,
} from './conversation-lifecycle'

describe('conversation lifecycle', () => {
  it('defaults greenfield empty thread to Plan', () => {
    expect(shouldDefaultGreenfieldToPlan({ hasConversationHistory: false, isGreenfield: true })).toBe(
      true,
    )
    expect(shouldDefaultGreenfieldToPlan({ hasConversationHistory: true, isGreenfield: true })).toBe(
      false,
    )
    expect(shouldDefaultGreenfieldToPlan({ hasConversationHistory: false, isGreenfield: false })).toBe(
      false,
    )
  })

  it('velocity exits Plan after valid gf-plan when not executing', () => {
    expect(
      shouldVelocityExitPlanAfterGfPlan({
        temperament: 'velocity',
        endedInPlanMode: true,
        hasValidPlan: true,
        isExecutingPlan: false,
      }),
    ).toBe(true)
    expect(
      shouldVelocityExitPlanAfterGfPlan({
        temperament: 'trust',
        endedInPlanMode: true,
        hasValidPlan: true,
        isExecutingPlan: false,
      }),
    ).toBe(false)
    expect(
      shouldVelocityExitPlanAfterGfPlan({
        temperament: 'velocity',
        endedInPlanMode: true,
        hasValidPlan: true,
        isExecutingPlan: true,
      }),
    ).toBe(false)
  })

  it('exits Plan only after approve-and-run writes files (done phase)', () => {
    expect(shouldExitPlanAfterExecuteComplete('done')).toBe(true)
    expect(shouldExitPlanAfterExecuteComplete('failed')).toBe(false)
    expect(shouldExitPlanAfterExecuteComplete('needs_review')).toBe(false)
  })

  it('labels Work vs Plan for UI', () => {
    expect(conversationModeLabel('normal')).toBe('Work')
    expect(conversationModeLabel('plan')).toBe('Plan')
    expect(chatModeDisplayLabel('fast')).toBe('work')
    expect(chatModeDisplayLabel('plan')).toBe('plan')
  })
})
