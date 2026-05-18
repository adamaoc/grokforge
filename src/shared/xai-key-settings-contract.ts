/** xAI API key source after resolution: in-app store wins over env when present. */
export type XaiKeySource = 'stored' | 'env' | 'none'

export interface XaiKeyStatusPayload {
  configured: boolean
  source: XaiKeySource
  /** Last four chars hint when a key is saved in-app (never full secret). */
  maskedHint?: string
  /** True when OS cannot encrypt (e.g. some Linux); saving from Settings will fail until fixed. */
  canPersistKey: boolean
}

export type SetXaiApiKeyResult = { ok: true } | { ok: false; error: string }

export type ClearXaiApiKeyResult = { ok: true } | { ok: false; error: string }

/** Max length for pasted API keys (reasonable bound). */
export const XAI_API_KEY_MAX_LEN = 512
