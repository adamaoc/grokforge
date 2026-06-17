/**
 * Harness public surface — see {@link README.md}.
 */

export {
  HARNESS_MAX_TOOL_ITERATIONS,
  HARNESS_MAX_TOOL_ITERATIONS_PLAN,
  HARNESS_MAX_TOOL_ITERATIONS_WORK,
  resolveHarnessMaxToolIterations,
} from './runtime/config'
export { runAgentHarnessTurn, type HarnessTurnDeps } from './runtime/run-turn'
export { runHarnessTurnLoop, type HarnessLoopResult } from './runtime/loop'
export {
  resolveHarnessWorkspace,
  resolveWithinWorkspace,
  type HarnessToolEnv,
} from './workspace/paths'
export { buildHarnessPlanSystemPrompt, PLAN_PROFILE } from './profile/plan-profile'
export { buildHarnessSystemPrompt, harnessTurnRouting } from './profile/work-profile'
export {
  resolveHarnessTurnRouting,
  resolveHarnessTurnMode,
  resolveHarnessProfile,
} from './profile/turn-routing'
export { resolveHarnessProfileKey, type HarnessProfileKey } from './profile/profile-key'
