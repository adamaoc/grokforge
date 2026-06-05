export type HarnessProfileKey = 'grok_code_fast' | 'grok_4_3' | 'generic'

const MODEL_ID_TO_PROFILE_KEY: Readonly<Record<string, HarnessProfileKey>> = {
  'grok-build-0.1': 'grok_code_fast',
  'grok-code-fast-1': 'grok_code_fast',
  'grok-code-fast': 'grok_code_fast',
  'grok-code-fast-1-0825': 'grok_code_fast',
  'grok-4.3': 'grok_4_3',
}

export function resolveHarnessProfileKey(modelId: string): HarnessProfileKey {
  const trimmed = modelId.trim()
  if (!trimmed) return 'generic'
  return MODEL_ID_TO_PROFILE_KEY[trimmed] ?? 'generic'
}
