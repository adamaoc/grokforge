import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import { z } from 'zod'
import type {
  GrokStreamCapabilitiesResult,
  GrokStreamEventPayload,
  GrokStreamStartPayload,
  GrokStreamStartResult,
} from './types'
import { getResolvedXaiApiKey, hasConfiguredXaiApiKey } from './key-store'

const DEFAULT_CHAT_URL = 'https://api.x.ai/v1/chat/completions'
const STREAM_TIMEOUT_MS = 120_000
const MAX_MESSAGES = 80
const MAX_MESSAGE_CHARS = 100_000
const MAX_STREAM_ID_LEN = 128
const MAX_MODEL_LEN = 128

const MessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().max(MAX_MESSAGE_CHARS),
})

const StartPayloadSchema = z.object({
  streamId: z.string().min(1).max(MAX_STREAM_ID_LEN),
  model: z.string().min(1).max(MAX_MODEL_LEN),
  messages: z.array(MessageSchema).min(1).max(MAX_MESSAGES),
})

const activeStreams = new Map<string, AbortController>()

/** Distinct abort reasons so we can tell user cancel vs timeout vs fetch errors. */
const ABORT_USER = 'gf:user-cancel'
const ABORT_TIMEOUT = 'gf:timeout'

let targetWindow: BrowserWindow | null = null

export function setGrokStreamTargetWindow(win: BrowserWindow | null): void {
  targetWindow = win
}

function emit(payload: GrokStreamEventPayload): void {
  targetWindow?.webContents.send('grok-stream-event', payload)
}

/**
 * Resolved xAI API key: **in-app saved key** (Settings) overrides
 * `XAI_API_KEY` / `GROKFORGE_XAI_API_KEY` when present.
 */
export function getXaiApiKey(): string | undefined {
  return getResolvedXaiApiKey()
}

export function getChatCompletionsUrl(): string {
  const u = process.env.GROKFORGE_XAI_CHAT_COMPLETIONS_URL?.trim()
  return u && u.length > 0 ? u : DEFAULT_CHAT_URL
}

/** Exported for unit tests: extract assistant delta text from one SSE `data: {...}` JSON payload. */
export function extractDeltaFromChatCompletionChunk(jsonLine: string): string {
  try {
    const data = JSON.parse(jsonLine) as {
      choices?: Array<{ delta?: { content?: string | null } }>
    }
    const content = data.choices?.[0]?.delta?.content
    return typeof content === 'string' ? content : ''
  } catch {
    return ''
  }
}

async function consumeSseStream(
  streamId: string,
  body: ReadableStream<Uint8Array> | null,
  signal: AbortSignal,
): Promise<void> {
  if (!body) {
    emit({ streamId, phase: 'error', error: 'No response body' })
    return
  }
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finished = false
  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n')
      buffer = parts.pop() ?? ''
      for (const rawLine of parts) {
        const line = rawLine.replace(/\r$/, '')
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trimStart()
        if (data === '[DONE]') {
          finished = true
          emit({ streamId, phase: 'done' })
          return
        }
        const delta = extractDeltaFromChatCompletionChunk(data)
        if (delta) emit({ streamId, phase: 'chunk', delta })
      }
    }
    if (!finished) emit({ streamId, phase: 'done' })
  } finally {
    reader.releaseLock()
  }
}

async function runStreamJob(streamId: string, payload: GrokStreamStartPayload): Promise<void> {
  const ac = activeStreams.get(streamId)
  if (!ac) return

  const timeout = setTimeout(() => {
    ac.abort(ABORT_TIMEOUT)
  }, STREAM_TIMEOUT_MS)

  try {
    const key = getXaiApiKey()
    if (!key) {
      emit({
        streamId,
        phase: 'error',
        error: 'Missing API key. Add it in Settings or set XAI_API_KEY / GROKFORGE_XAI_API_KEY.',
      })
      return
    }

    const res = await fetch(getChatCompletionsUrl(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: payload.model,
        messages: payload.messages,
        stream: true,
      }),
      signal: ac.signal,
    })

    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      emit({
        streamId,
        phase: 'error',
        error: `HTTP ${res.status}: ${errBody.slice(0, 800)}`,
      })
      return
    }

    await consumeSseStream(streamId, res.body, ac.signal)
  } catch (e) {
    if (ac.signal.aborted) {
      if (ac.signal.reason === ABORT_USER) {
        emit({ streamId, phase: 'cancelled' })
        return
      }
      if (ac.signal.reason === ABORT_TIMEOUT) {
        emit({ streamId, phase: 'error', error: 'Request timed out' })
        return
      }
    }
    const msg = e instanceof Error ? e.message : 'Network error'
    emit({ streamId, phase: 'error', error: msg })
  } finally {
    clearTimeout(timeout)
    activeStreams.delete(streamId)
  }
}

export function registerGrokStreamIpc(): void {
  ipcMain.handle('grok-stream-capabilities', (): GrokStreamCapabilitiesResult => ({
    apiKeyConfigured: hasConfiguredXaiApiKey(),
  }))

  ipcMain.handle('grok-stream-start', async (_, raw: unknown): Promise<GrokStreamStartResult> => {
    const parsed = StartPayloadSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: parsed.error.message }
    }
    const payload = parsed.data
    if (!getXaiApiKey()) {
      return {
        ok: false,
        error: 'Missing XAI API key. Add it in Settings or set XAI_API_KEY / GROKFORGE_XAI_API_KEY (e.g. .env for dev).',
      }
    }
    if (activeStreams.has(payload.streamId)) {
      return { ok: false, error: 'streamId already in use' }
    }
    const ac = new AbortController()
    activeStreams.set(payload.streamId, ac)
    void runStreamJob(payload.streamId, payload)
    return { ok: true, streamId: payload.streamId }
  })

  ipcMain.handle('grok-stream-cancel', async (_, streamId: unknown): Promise<{ ok: boolean }> => {
    if (typeof streamId !== 'string' || !streamId.trim()) return { ok: false }
    const ac = activeStreams.get(streamId)
    if (!ac) return { ok: true }
    ac.abort(ABORT_USER)
    return { ok: true }
  })
}
