/**
 * Harness profile keys (story 102). Profile *content* ships in story 103.
 */

export type HarnessProfileKey = 'grok_code_fast' | 'grok_4_3' | 'generic'

/** xAI ids that share the fast agentic coding harness profile (story 121). */
export const GROK_BUILD_MODEL_IDS = [
  'grok-build-0.1',
  'grok-code-fast-1',
  'grok-code-fast',
  'grok-code-fast-1-0825',
] as const

const MODEL_ID_TO_PROFILE_KEY: Readonly<Record<string, HarnessProfileKey>> = {
  'grok-build-0.1': 'grok_code_fast',
  'grok-code-fast-1': 'grok_code_fast',
  'grok-code-fast': 'grok_code_fast',
  'grok-code-fast-1-0825': 'grok_code_fast',
  'grok-4.3': 'grok_4_3',
}

/**
 * Maps an xAI model id from manifest / routing to a harness profile key.
 * Unknown ids resolve to `generic` until 103 adds more profiles.
 */
export function resolveHarnessProfileKey(modelId: string): HarnessProfileKey {
  const trimmed = modelId.trim()
  if (!trimmed) return 'generic'
  return MODEL_ID_TO_PROFILE_KEY[trimmed] ?? 'generic'
}
