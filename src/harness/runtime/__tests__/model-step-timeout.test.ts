import { describe, expect, it } from 'vitest'
import {
  HARNESS_MODEL_STEP_TIMEOUT_BASE_MS,
  HARNESS_MODEL_STEP_TIMEOUT_DEEP_STEP_BONUS_MS,
  HARNESS_MODEL_STEP_TIMEOUT_DEEP_STEP_THRESHOLD,
  HARNESS_MODEL_STEP_TIMEOUT_LARGE_CONTEXT_BONUS_MS,
  HARNESS_MODEL_STEP_TIMEOUT_LARGE_CONTEXT_THRESHOLD,
  HARNESS_MODEL_STEP_TIMEOUT_LATE_STEP_BONUS_MS,
  HARNESS_MODEL_STEP_TIMEOUT_LATE_STEP_THRESHOLD,
  HARNESS_MODEL_STEP_TIMEOUT_MAX_MS,
  resolveModelStepTimeoutMs,
} from '../model-step-timeout'

describe('resolveModelStepTimeoutMs', () => {
  it('uses the base timeout for early steps with small context', () => {
    expect(
      resolveModelStepTimeoutMs({
        step: 0,
        visibleMessageCount: 4,
      }),
    ).toBe(HARNESS_MODEL_STEP_TIMEOUT_BASE_MS)
  })

  it('adds late-step bonus once the loop is deep', () => {
    expect(
      resolveModelStepTimeoutMs({
        step: HARNESS_MODEL_STEP_TIMEOUT_LATE_STEP_THRESHOLD,
      }),
    ).toBe(HARNESS_MODEL_STEP_TIMEOUT_BASE_MS + HARNESS_MODEL_STEP_TIMEOUT_LATE_STEP_BONUS_MS)
  })

  it('adds large-context bonus on top of late-step bonus when under the cap', () => {
    expect(
      resolveModelStepTimeoutMs({
        step: HARNESS_MODEL_STEP_TIMEOUT_LATE_STEP_THRESHOLD,
        visibleMessageCount: HARNESS_MODEL_STEP_TIMEOUT_LARGE_CONTEXT_THRESHOLD,
      }),
    ).toBe(
      HARNESS_MODEL_STEP_TIMEOUT_BASE_MS +
        HARNESS_MODEL_STEP_TIMEOUT_LATE_STEP_BONUS_MS +
        HARNESS_MODEL_STEP_TIMEOUT_LARGE_CONTEXT_BONUS_MS,
    )
  })

  it('applies deep-step bonus until the configured maximum', () => {
    expect(
      resolveModelStepTimeoutMs({
        step: HARNESS_MODEL_STEP_TIMEOUT_DEEP_STEP_THRESHOLD,
        visibleMessageCount: HARNESS_MODEL_STEP_TIMEOUT_LARGE_CONTEXT_THRESHOLD,
      }),
    ).toBe(HARNESS_MODEL_STEP_TIMEOUT_MAX_MS)
  })

  it('caps at the configured maximum', () => {
    expect(
      resolveModelStepTimeoutMs({
        step: 40,
        visibleMessageCount: 80,
      }),
    ).toBe(HARNESS_MODEL_STEP_TIMEOUT_MAX_MS)
  })
})