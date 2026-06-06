import type { HarnessTemperament } from './harness-temperament'
export {
  chatModeDisplayLabel,
  conversationModeLabel,
} from '../../../shared/conversation/mode-contract'

export function shouldDefaultGreenfieldToPlan(input: {
  hasConversationHistory: boolean
  isGreenfield: boolean
}): boolean {
  return !input.hasConversationHistory && input.isGreenfield
}

export function shouldVelocityExitPlanAfterGfPlan(input: {
  temperament: HarnessTemperament
  endedInPlanMode: boolean
  hasValidPlan: boolean
  isExecutingPlan: boolean
}): boolean {
  return (
    input.temperament === 'velocity' &&
    input.endedInPlanMode &&
    input.hasValidPlan &&
    !input.isExecutingPlan
  )
}

import type { PlanExecuteRunPhase } from './plan-execute-outcome'

/** After approve-and-run finishes with files applied, composer returns to Work (both temperaments). */
export function shouldExitPlanAfterExecuteComplete(runPhase: PlanExecuteRunPhase): boolean {
  return runPhase === 'done'
}
