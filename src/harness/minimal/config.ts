/**
 * Feature flag for the ampnet-style minimal harness.
 * When enabled, `runAgentTurn` delegates to `runMinimalAgentTurn` instead of the legacy loop.
 */

export function isMinimalHarnessEnabled(): boolean {
  const raw = process.env.GROKFORGE_MINIMAL_HARNESS?.trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes'
}

/** Tool loop cap (ampnet default). */
export const MINIMAL_MAX_TOOL_ITERATIONS = 25
