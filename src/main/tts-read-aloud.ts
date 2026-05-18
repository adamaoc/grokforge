import { z } from 'zod'
import {
  normalizeTtsVoiceId,
  ttsLanguageForVoiceId,
  TTS_READ_ALOUD_MAX_TEXT_CHARS,
  type TtsReadAloudRequest,
  type TtsReadAloudResult,
  type TtsVerifyVoiceResult,
} from '../shared/tts-read-aloud-contract'
import { getXaiApiKey } from './grok-stream'

const DEFAULT_TTS_URL = 'https://api.x.ai/v1/tts'

function ttsUrl(): string {
  const u = process.env.GROKFORGE_XAI_TTS_URL?.trim()
  return u && u.length > 0 ? u.replace(/\/$/, '') : DEFAULT_TTS_URL
}

function ttsVoicesUrl(): string {
  return `${ttsUrl()}/voices`
}

function customVoicesUrl(): string {
  const url = new URL(ttsUrl())
  url.pathname = url.pathname.replace(/\/tts\/?$/, '/custom-voices')
  return url.toString().replace(/\/$/, '')
}

const PayloadSchema = z.object({
  text: z.string().max(TTS_READ_ALOUD_MAX_TEXT_CHARS),
  voiceId: z.string().min(1).max(256),
})

export function parseTtsReadAloudPayload(data: unknown): TtsReadAloudRequest | null {
  const r = PayloadSchema.safeParse(data)
  if (!r.success) return null
  const text = r.data.text.trim()
  if (!text) return null
  return { text, voiceId: normalizeTtsVoiceId(r.data.voiceId) }
}

function formatTtsFailure(status: number, detail: string, voiceId: string): string {
  const suffix = detail ? `: ${detail}` : ''
  if (status === 404) {
    return `TTS voice "${voiceId}" was not found, or the TTS endpoint is unavailable. In Settings → Voice, use a listed voice or leave it blank for "eve".${suffix}`
  }
  return `TTS request failed (${status})${suffix}`
}

async function postTtsRequest(url: string, apiKey: string, text: string, voiceId: string): Promise<Response> {
  const body = {
    text,
    voice_id: voiceId,
    language: ttsLanguageForVoiceId(voiceId),
    output_format: {
      codec: 'mp3' as const,
      sample_rate: 24_000,
    },
  }

  return fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

async function readTtsErrorDetail(res: Response): Promise<string> {
  try {
    const errJson = (await res.json()) as { error?: { message?: string }; message?: string }
    return errJson.error && typeof errJson.error === 'object' && 'message' in errJson.error
      ? String(errJson.error.message ?? '')
      : typeof errJson.message === 'string'
        ? errJson.message
        : ''
  } catch {
    return (await res.text().catch(() => '')).slice(0, 500)
  }
}

/**
 * POST xAI TTS; Bearer auth in main only. Returns base64 audio for renderer playback.
 */
export async function invokeTtsReadAloud(payload: unknown): Promise<TtsReadAloudResult> {
  const parsed = parseTtsReadAloudPayload(payload)
  if (!parsed) {
    return { ok: false, error: 'Invalid read-aloud request' }
  }

  const apiKey = getXaiApiKey()
  if (!apiKey) {
    return {
      ok: false,
      error: 'Add your API key in GrokForge Settings or set XAI_API_KEY / GROKFORGE_XAI_API_KEY (see .env.example).',
    }
  }

  const url = ttsUrl()

  try {
    const res = await postTtsRequest(url, apiKey, parsed.text, parsed.voiceId)

    if (!res.ok) {
      const detail = await readTtsErrorDetail(res)
      return { ok: false, error: formatTtsFailure(res.status, detail, parsed.voiceId) }
    }

    const arrayBuf = await res.arrayBuffer()
    const mimeType =
      res.headers.get('content-type')?.split(';')[0]?.trim() || 'audio/mpeg'
    const base64 = Buffer.from(arrayBuf).toString('base64')
    return { ok: true, mimeType, base64 }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'TTS network error'
    return { ok: false, error: msg }
  }
}

function parseVoiceInfo(data: unknown, fallbackVoiceId: string): { voice_id: string; name: string | null } {
  if (!data || typeof data !== 'object') return { voice_id: fallbackVoiceId, name: null }
  const item = data as { voice_id?: unknown; name?: unknown }
  return {
    voice_id:
      typeof item.voice_id === 'string' && item.voice_id.trim()
        ? item.voice_id.trim()
        : fallbackVoiceId,
    name: typeof item.name === 'string' ? item.name : null,
  }
}

export async function verifyTtsVoice(rawVoiceId: unknown): Promise<TtsVerifyVoiceResult> {
  if (typeof rawVoiceId !== 'string' || !rawVoiceId.trim()) {
    return { ok: false, error: 'Enter a voice id.' }
  }
  const voiceId = normalizeTtsVoiceId(rawVoiceId)

  const apiKey = getXaiApiKey()
  if (!apiKey) {
    return {
      ok: false,
      error: 'Add your API key in GrokForge Settings or set XAI_API_KEY / GROKFORGE_XAI_API_KEY (see .env.example).',
    }
  }

  try {
    const builtIn = await fetch(`${ttsVoicesUrl()}/${encodeURIComponent(voiceId)}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (builtIn.ok) {
      return { ok: true, voice: parseVoiceInfo(await builtIn.json(), voiceId) }
    }

    if (builtIn.status !== 404) {
      const detail = await readTtsErrorDetail(builtIn)
      const suffix = detail ? `: ${detail}` : ''
      return { ok: false, error: `Could not verify voice "${voiceId}" (${builtIn.status})${suffix}` }
    }

    const custom = await fetch(`${customVoicesUrl()}/${encodeURIComponent(voiceId)}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (custom.ok) {
      return { ok: true, voice: parseVoiceInfo(await custom.json(), voiceId) }
    }

    if (custom.status === 404) {
      return { ok: false, error: `Voice "${voiceId}" was not found.` }
    }

    const detail = await readTtsErrorDetail(custom)
    const suffix = detail ? `: ${detail}` : ''
    return { ok: false, error: `Could not verify voice "${voiceId}" (${custom.status})${suffix}` }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'TTS voice verification network error'
    return { ok: false, error: msg }
  }
}
