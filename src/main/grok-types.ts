/** Role strings accepted by xAI chat/completions (OpenAI-compatible). */
export type GrokApiRole = 'system' | 'user' | 'assistant'

export type GrokApiMessage = {
  role: GrokApiRole
  content: string
}

export type GrokStreamStartPayload = {
  /** Client-generated id used for cancel + event correlation. */
  streamId: string
  model: string
  messages: GrokApiMessage[]
}

export type GrokStreamStartResult =
  | { ok: true; streamId: string }
  | { ok: false; error: string }

export type GrokStreamCapabilitiesResult = {
  /** True when a key is available from Settings (stored) and/or env (`XAI_API_KEY` / `GROKFORGE_XAI_API_KEY`). */
  apiKeyConfigured: boolean
}

export type GrokStreamEventPayload =
  | { streamId: string; phase: 'chunk'; delta: string }
  | { streamId: string; phase: 'done' }
  | { streamId: string; phase: 'error'; error: string }
  | { streamId: string; phase: 'cancelled' }
