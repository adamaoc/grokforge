/**
 * Harness profile keys (story 102). Profile *content* ships in story 103.
 */

export type HarnessProfileKey = 'grok_code_fast' | 'grok_4_3' | 'generic'

const MODEL_ID_TO_PROFILE_KEY: Readonly<Record<string, HarnessProfileKey>> = {
  'grok-code-fast-1': 'grok_code_fast',
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
