/**
 * Harness public surface — see {@link README.md}.
 */

export { HARNESS_MAX_TOOL_ITERATIONS } from './runtime/config'
export { runAgentHarnessTurn, type HarnessTurnDeps } from './runtime/run-turn'
export { runHarnessTurnLoop, type HarnessLoopResult } from './runtime/loop'
export { resolveHarnessWorkspace, resolveWithinWorkspace } from './workspace/paths'
export { buildHarnessSystemPrompt, harnessTurnRouting } from './profile/work-profile'
export { resolveHarnessProfileKey, type HarnessProfileKey } from './profile/profile-key'
