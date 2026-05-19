import WebSocket from 'ws'
import { app, type BrowserWindow } from 'electron'
import type { GrokProjectManifest } from './manifest'
import { getModelForIntent } from './model-router'
import { getXaiApiKey } from './grok-stream'
import { buildChatSystemPrompt } from './agent-context'
import { buildVoiceHarnessAppendix } from '../shared/agent-harness-profile'
import { resolveHarnessProfileKey } from '../shared/agent-harness-profile-contract'
import { VOICE_THREAD_SUMMARY_EFFECTIVE_MAX } from '../shared/voice-session-contract'
import { normalizeTtsVoiceId } from '../shared/tts-read-aloud-contract'

const PCM_SAMPLE_RATE = 24_000

export type VoiceSessionStartResult = { ok: true } | { ok: false; error: string }

/** Forwarded to renderer as JSON; shape follows xAI Voice Agent realtime + `gf:*` hints. */
export type VoiceRealtimeServerEvent = Record<string, unknown>

let socket: WebSocket | null = null

function realtimeBaseUrl(): string {
  const u = process.env.GROKFORGE_XAI_REALTIME_URL?.trim()
  if (u) return u.replace(/\/$/, '')
  return 'wss://api.x.ai/v1/realtime'
}

function forwardToRenderer(win: BrowserWindow, msg: VoiceRealtimeServerEvent) {
  if (!win.isDestroyed()) {
    win.webContents.send('voice-realtime-event', msg)
  }
}

function isDevMode(): boolean {
  return process.env.NODE_ENV === 'development'
}

function buildSessionUpdatePayload(manifest: GrokProjectManifest, opts?: { threadSummary?: string }): string {
  const voiceModelId = getModelForIntent(manifest, 'voice', { logSelection: true })
  const harnessProfileKey = resolveHarnessProfileKey(voiceModelId)
  if (isDevMode()) {
    console.debug('[GrokForge voice] harness routing', { voiceModelId, harnessProfileKey })
  }

  let instructions =
    manifest.context.customInstructions?.trim() ||
    'You are GrokForge, a concise voice coding assistant for a multi-root workspace.'
  try {
    const { systemPrompt, warnings } = buildChatSystemPrompt(manifest)
    const summary = opts?.threadSummary?.trim()
    const summaryBlock =
      summary && summary.length > 0
        ? [
            '',
            '## Recent text chat (for continuity)',
            'The user may switch between voice and typed agent chat in one thread. Summarized recent messages:',
            summary.slice(0, VOICE_THREAD_SUMMARY_EFFECTIVE_MAX),
          ].join('\n')
        : ''
    instructions = [
      systemPrompt.slice(0, 31_000),
      '',
      buildVoiceHarnessAppendix(harnessProfileKey),
      summaryBlock,
    ].join('\n')
    if (warnings.length > 0) {
      console.warn('[GrokForge voice] context warnings:', warnings.slice(0, 3).join(' · '))
    }
  } catch (e) {
    console.warn('[GrokForge voice] instructions fallback:', e)
  }

  const voiceName =
    manifest.voice.customVoiceId != null && String(manifest.voice.customVoiceId).trim().length > 0
      ? normalizeTtsVoiceId(String(manifest.voice.customVoiceId))
      : 'eve'

  /** Full-duplex uses server VAD; push-to-talk / off still use VAD for this pipeline (PTT UX is story follow-up). */
  const turnDetection = { type: 'server_vad' as const }

  const session = {
    type: 'session.update',
    session: {
      voice: voiceName,
      instructions,
      turn_detection: turnDetection,
      audio: {
        input: { format: { type: 'audio/pcm', rate: PCM_SAMPLE_RATE } },
        output: { format: { type: 'audio/pcm', rate: PCM_SAMPLE_RATE } },
      },
    },
  }
  return JSON.stringify(session)
}

/**
 * Opens xAI Voice Agent WebSocket (Bearer auth in main only), configures session, then resolves.
 * Forwards all server JSON events to `voice-realtime-event` on `win`.
 */
export function startVoiceRealtime(
  win: BrowserWindow,
  manifest: GrokProjectManifest,
  opts?: { threadSummary?: string },
): Promise<VoiceSessionStartResult> {
  const apiKey = getXaiApiKey()
  if (!apiKey) {
    return Promise.resolve({
      ok: false,
      error: 'Add your API key in GrokForge Settings or set XAI_API_KEY / GROKFORGE_XAI_API_KEY (see .env.example).',
    })
  }

  stopVoiceRealtime()

  const model = getModelForIntent(manifest, 'voice', { logSelection: true })
  const url = `${realtimeBaseUrl()}?model=${encodeURIComponent(model)}`

  return new Promise((resolve) => {
    const targetWin = win
    let settled = false
    const done = (r: VoiceSessionStartResult) => {
      if (settled) return
      settled = true
      resolve(r)
    }

    let sessionUpdateSent = false
    const sendSessionUpdateOnce = (wsConn: WebSocket) => {
      if (sessionUpdateSent) return
      sessionUpdateSent = true
      wsConn.send(buildSessionUpdatePayload(manifest, opts))
      forwardToRenderer(win, { type: 'gf:session_update_sent', at: Date.now() })
    }

    const ws = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })
    socket = ws

    let warnTimer: ReturnType<typeof setTimeout> | undefined
    const failTimeout = setTimeout(() => {
      if (!settled) {
        stopVoiceRealtime()
        done({ ok: false, error: 'Voice realtime: timed out waiting for session.updated' })
      }
    }, 25_000)

    const clearSessionTimers = () => {
      clearTimeout(failTimeout)
      if (warnTimer !== undefined) clearTimeout(warnTimer)
    }

    if (!app.isPackaged) {
      warnTimer = setTimeout(() => {
        if (!settled) {
          console.warn('[GrokForge voice] still waiting for session.updated after 10s')
        }
      }, 10_000)
    }

    const fail = (err: string) => {
      clearSessionTimers()
      stopVoiceRealtime()
      done({ ok: false, error: err })
    }

    ws.on('open', () => {
      /** If the server omits `session.created`, still configure the session. */
      setTimeout(() => {
        if (socket === ws && !sessionUpdateSent) {
          sendSessionUpdateOnce(ws)
        }
      }, 800)
    })

    ws.on('error', (e: Error) => {
      fail(e.message || 'WebSocket error')
    })

    ws.on('close', () => {
      clearSessionTimers()
      if (!settled) {
        fail('Connection closed before the voice session was ready')
      } else {
        forwardToRenderer(targetWin, { type: 'gf:connection_lost' })
      }
    })

    ws.on('message', (data) => {
      const raw = typeof data === 'string' ? data : Buffer.isBuffer(data) ? data.toString('utf8') : String(data)
      let msg: VoiceRealtimeServerEvent
      try {
        msg = JSON.parse(raw) as VoiceRealtimeServerEvent
      } catch {
        return
      }

      forwardToRenderer(win, msg)

      const type = typeof msg.type === 'string' ? msg.type : ''

      if (type === 'error') {
        const errObj = msg.error
        const message =
          typeof errObj === 'object' && errObj !== null && 'message' in errObj
            ? String((errObj as { message?: unknown }).message ?? 'error')
            : JSON.stringify(msg.error ?? msg)
        if (!app.isPackaged && typeof errObj === 'object' && errObj !== null) {
          const code = 'code' in errObj ? String((errObj as { code?: unknown }).code ?? '') : ''
          const param = 'param' in errObj ? String((errObj as { param?: unknown }).param ?? '') : ''
          console.warn('[GrokForge voice] server error', { code, param, message })
        }
        if (!settled) {
          fail(message)
          return
        }
      }

      if (type === 'session.created') {
        sendSessionUpdateOnce(ws)
      }

      if (type === 'session.updated' && !settled) {
        clearSessionTimers()
        done({ ok: true })
      }
    })
  })
}

/** Append one chunk of little-endian PCM16 (base64) to the realtime input buffer. */
export function sendVoiceAudioAppendBase64(base64: string): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) return
  if (typeof base64 !== 'string' || base64.length === 0) return
  if (base64.length > 512 * 1024) return
  const payload = JSON.stringify({
    type: 'input_audio_buffer.append',
    audio: base64,
  })
  socket.send(payload)
}

export function stopVoiceRealtime(): void {
  if (socket) {
    try {
      socket.removeAllListeners()
      socket.close()
    } catch {
      /* ignore */
    }
    socket = null
  }
}

export function isVoiceRealtimeSocketOpen(): boolean {
  return socket !== null && socket.readyState === WebSocket.OPEN
}
