/**
 * Per-model-step timeout policy for harness v2 tool-loop requests.
 *
 * Late scaffold turns (heavy write_file payloads, large context) get more time
 * without reintroducing legacy multi-minute turn budgets.
 */

/** Base non-streaming xAI request timeout for a single model step. */
export const HARNESS_MODEL_STEP_TIMEOUT_BASE_MS = 180_000

/** Hard cap for any single model step. */
export const HARNESS_MODEL_STEP_TIMEOUT_MAX_MS = 300_000

/** Step index (0-based loop counter) at which late-turn bonus time applies. */
export const HARNESS_MODEL_STEP_TIMEOUT_LATE_STEP_THRESHOLD = 8

/** Extra time once {@link HARNESS_MODEL_STEP_TIMEOUT_LATE_STEP_THRESHOLD} is reached. */
export const HARNESS_MODEL_STEP_TIMEOUT_LATE_STEP_BONUS_MS = 60_000

/** Additional bonus when the turn is deep into the tool loop. */
export const HARNESS_MODEL_STEP_TIMEOUT_DEEP_STEP_THRESHOLD = 12

export const HARNESS_MODEL_STEP_TIMEOUT_DEEP_STEP_BONUS_MS = 60_000

/** Visible message count above which context-size bonus applies. */
export const HARNESS_MODEL_STEP_TIMEOUT_LARGE_CONTEXT_THRESHOLD = 24

export const HARNESS_MODEL_STEP_TIMEOUT_LARGE_CONTEXT_BONUS_MS = 45_000

export type ResolveModelStepTimeoutInput = {
  /** 0-based tool-loop step index for the upcoming model request. */
  step: number
  /** Visible messages sent to the provider on this step. */
  visibleMessageCount?: number
}

/**
 * Resolve the abort timeout for one model step.
 * Capped at {@link HARNESS_MODEL_STEP_TIMEOUT_MAX_MS}.
 */
export function resolveModelStepTimeoutMs(input: ResolveModelStepTimeoutInput): number {
  let timeoutMs = HARNESS_MODEL_STEP_TIMEOUT_BASE_MS

  if (input.step >= HARNESS_MODEL_STEP_TIMEOUT_LATE_STEP_THRESHOLD) {
    timeoutMs += HARNESS_MODEL_STEP_TIMEOUT_LATE_STEP_BONUS_MS
  }
  if (input.step >= HARNESS_MODEL_STEP_TIMEOUT_DEEP_STEP_THRESHOLD) {
    timeoutMs += HARNESS_MODEL_STEP_TIMEOUT_DEEP_STEP_BONUS_MS
  }
  if (
    typeof input.visibleMessageCount === 'number' &&
    input.visibleMessageCount >= HARNESS_MODEL_STEP_TIMEOUT_LARGE_CONTEXT_THRESHOLD
  ) {
    timeoutMs += HARNESS_MODEL_STEP_TIMEOUT_LARGE_CONTEXT_BONUS_MS
  }

  return Math.min(timeoutMs, HARNESS_MODEL_STEP_TIMEOUT_MAX_MS)
}