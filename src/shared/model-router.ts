/**
 * Shared model routing helper. Keep this free of Node/Electron imports so renderer code can import it at runtime.
 */

export type ModelIntent = 'chat_default' | 'planning' | 'execution' | 'reasoning' | 'voice'

export type ModelRoutingManifest = {
  models: {
    default: string
    planning: string
    execution: string
    reasoning: string
    voice: string
  }
}

/** Single map of intent -> manifest `models` field (documented in AGENTS.md). */
export const MODEL_INTENT_MANIFEST_KEYS: Record<ModelIntent, keyof ModelRoutingManifest['models']> = {
  chat_default: 'default',
  planning: 'planning',
  execution: 'execution',
  reasoning: 'reasoning',
  voice: 'voice',
}

const FALLBACK_MODELS: Record<ModelIntent, string> = {
  chat_default: 'grok-code-fast-1',
  planning: 'grok-4.3',
  execution: 'grok-code-fast-1',
  reasoning: 'grok-4.20-reasoning',
  voice: 'grok-voice-think-fast-1.0',
}

export type GetModelForIntentOptions = {
  /** When true, logs `[GrokForge model-router] intent -> model` in development (main + renderer). */
  logSelection?: boolean
}

function isDevMode(): boolean {
  return typeof process !== 'undefined' && process.env.NODE_ENV === 'development'
}

/**
 * Resolves the xAI model id for a product intent from the workspace manifest, with per-intent fallbacks
 * if a value is missing or blank (defensive; Zod-valid manifests normally fill every key).
 */
export function getModelForIntent(
  manifest: ModelRoutingManifest,
  intent: ModelIntent,
  opts?: GetModelForIntentOptions,
): string {
  const manifestKey = MODEL_INTENT_MANIFEST_KEYS[intent]
  const raw = manifest.models[manifestKey]
  const trimmed = typeof raw === 'string' ? raw.trim() : ''
  const model = trimmed.length > 0 ? trimmed : FALLBACK_MODELS[intent]

  if (opts?.logSelection && isDevMode()) {
    console.debug(`[GrokForge model-router] ${intent} -> ${model} (manifest key: ${String(manifestKey)})`)
  }

  return model
}
