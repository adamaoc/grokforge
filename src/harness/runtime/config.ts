/**
 * Tool loop cap for Plan mode (read-only discovery).
 * Kept at 25 intentionally — plan turns should emit `gf-plan` after light discovery;
 * loop guards in {@link plan-loop-guard.ts} steer away from tool thrashing before this cap.
 */
export const HARNESS_MAX_TOOL_ITERATIONS_PLAN = 25

/** Tool loop cap for Work / execute turns (scaffold + edits can be long). */
export const HARNESS_MAX_TOOL_ITERATIONS_WORK = 50

/** @deprecated Use {@link resolveHarnessMaxToolIterations}. */
export const HARNESS_MAX_TOOL_ITERATIONS = HARNESS_MAX_TOOL_ITERATIONS_WORK

export function resolveHarnessMaxToolIterations(turnMode: 'plan' | 'work'): number {
  return turnMode === 'plan'
    ? HARNESS_MAX_TOOL_ITERATIONS_PLAN
    : HARNESS_MAX_TOOL_ITERATIONS_WORK
}

/** Non-streaming xAI request timeout for a single model step. */
export const HARNESS_CHAT_SAMPLE_TIMEOUT_MS = 180_000