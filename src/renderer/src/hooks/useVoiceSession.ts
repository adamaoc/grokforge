import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type {
  GrokProjectManifest,
  PersistedChatLineV1,
  Root,
  VoiceRealtimeServerEvent,
  VoiceSessionStartResult,
} from '@/types'
import { CHAT_STORE_SCHEMA_VERSION, getModelForIntent } from '@/types'
import { publishChatThreadLine } from '@/lib/chat-thread-bus'
import { publishVoiceUserDraft } from '@/lib/voice-user-draft-bus'
import { registerVoiceCaptureWorklet } from '@/lib/voice-capture-worklet'
import { buildVoiceTurnContext } from '@/lib/chat-turn-context'

export type VoiceUiStatus =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'transcribing'
  | 'thinking'
  | 'reading'
  | 'waiting_approval'
  | 'speaking'
  | 'error'

const PLAYBACK_RATE = 24_000

function resampleFloat32Mono(input: Float32Array, inputRate: number, outputRate: number): Float32Array {
  if (inputRate === outputRate) return Float32Array.from(input)
  const ratio = inputRate / outputRate
  const outLen = Math.max(1, Math.floor(input.length / ratio))
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const srcPos = i * ratio
    const j0 = Math.min(Math.floor(srcPos), input.length - 1)
    const j1 = Math.min(j0 + 1, input.length - 1)
    const t = srcPos - j0
    out[i] = input[j0]! * (1 - t) + input[j1]! * t
  }
  return out
}

function float32ToBase64Pcm16(samples: Float32Array): string {
  const pcm = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!))
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  const bytes = new Uint8Array(pcm.buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary)
}

function base64Pcm16ToFloat32(b64: string): Float32Array {
  try {
    const binary = atob(b64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)!
    if (bytes.byteLength < 2 || bytes.byteLength % 2 !== 0) return new Float32Array(0)
    const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2)
    const float32 = new Float32Array(pcm.length)
    for (let i = 0; i < pcm.length; i++) float32[i] = pcm[i]! / 32768.0
    return float32
  } catch {
    return new Float32Array(0)
  }
}

function mapMicError(e: unknown): string {
  if (typeof e === 'object' && e !== null && 'name' in e) {
    const name = String((e as DOMException).name)
    if (name === 'NotAllowedError') {
      return 'Microphone access denied — enable it in System Settings → Privacy → Microphone.'
    }
    if (name === 'NotFoundError') return 'No microphone detected.'
    if (name === 'NotReadableError') return 'Microphone is in use by another app.'
    if (name === 'OverconstrainedError') return 'Audio constraints not satisfied.'
  }
  return e instanceof Error ? e.message : 'Microphone access failed'
}

function getResponseId(msg: VoiceRealtimeServerEvent): string {
  const id = msg.response_id
  return typeof id === 'string' && id.length > 0 ? id : '_unknown'
}

function extractUserTranscript(msg: VoiceRealtimeServerEvent): string | null {
  const tr = msg.transcript
  if (typeof tr === 'string' && tr.trim()) return tr.trim()
  const item = msg.item
  if (typeof item === 'object' && item !== null) {
    const o = item as Record<string, unknown>
    if (typeof o.transcript === 'string' && o.transcript.trim()) return o.transcript.trim()
    const content = o.content
    if (Array.isArray(content)) {
      for (const part of content) {
        if (typeof part === 'object' && part !== null) {
          const p = part as Record<string, unknown>
          if (typeof p.transcript === 'string' && p.transcript.trim()) return p.transcript.trim()
        }
      }
    }
  }
  return null
}

function formatVoiceServerError(msg: VoiceRealtimeServerEvent): string {
  const errObj = msg.error
  if (typeof errObj === 'object' && errObj !== null && 'message' in errObj) {
    const message = String((errObj as { message?: unknown }).message ?? 'Voice error')
    const code =
      'code' in errObj && errObj.code !== undefined && errObj.code !== null
        ? String((errObj as { code?: unknown }).code)
        : ''
    return code ? `${message} (${code})` : message
  }
  if (typeof msg.message === 'string') return msg.message
  return 'Voice session error'
}

/** Merge streaming / repeated ASR segments into one utterance buffer. */
function mergeUserVoiceTranscript(buffer: string, next: string): string {
  const a = buffer.trim()
  const b = next.trim()
  if (!a) return b
  if (!b) return a
  if (b.startsWith(a)) return b
  if (a.startsWith(b)) return a
  return `${a} ${b}`
}

type UseVoiceSessionArgs = {
  project: GrokProjectManifest | null
  projectId: string | null
  activeRoot?: Root | null
  activeFilePath?: string | null
  /** Last text-chat summary injected into voice session instructions on connect. */
  getThreadSummaryForVoice?: () => string
}

export function useVoiceSession({
  project,
  projectId,
  activeRoot = null,
  activeFilePath = null,
  getThreadSummaryForVoice,
}: UseVoiceSessionArgs) {
  const [isActive, setIsActive] = useState(false)
  const [status, setStatus] = useState<VoiceUiStatus>('idle')
  const [lastError, setLastError] = useState<string | null>(null)

  const mediaStreamRef = useRef<MediaStream | null>(null)
  const captureCtxRef = useRef<AudioContext | null>(null)
  const workletRef = useRef<AudioWorkletNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const playbackCtxRef = useRef<AudioContext | null>(null)
  const nextPlayTimeRef = useRef(0)
  const speakResponsesRef = useRef(true)
  const speakResponsesLoggedRef = useRef(false)
  const voiceModelRef = useRef('')
  const assistantTranscriptBufRef = useRef<Map<string, string>>(new Map())
  const activeRootRef = useRef<Root | null>(null)
  const activeFilePathRef = useRef<string | null>(null)

  const userVoiceDraftIdRef = useRef<string | null>(null)
  const userVoiceAccumRef = useRef('')
  const userVoiceFlushTimerRef = useRef<number | null>(null)
  const getThreadSummaryForVoiceRef = useRef(getThreadSummaryForVoice)
  getThreadSummaryForVoiceRef.current = getThreadSummaryForVoice

  useEffect(() => {
    activeRootRef.current = activeRoot ?? null
  }, [activeRoot])

  useEffect(() => {
    activeFilePathRef.current = activeFilePath?.trim() ? activeFilePath : null
  }, [activeFilePath])

  useEffect(() => {
    speakResponsesRef.current = project?.voice.speakResponses ?? true
  }, [project])

  useEffect(() => {
    if (project) {
      voiceModelRef.current = getModelForIntent(project, 'voice')
    }
  }, [project])

  const clearUserVoiceFlushTimer = useCallback(() => {
    if (userVoiceFlushTimerRef.current !== null) {
      window.clearTimeout(userVoiceFlushTimerRef.current)
      userVoiceFlushTimerRef.current = null
    }
  }, [])

  const persistVoiceLine = useCallback(
    async (args: { role: 'user' | 'assistant'; content: string; id?: string }) => {
      const content = args.content.trim()
      if (!content) return
      const electron = window.electron
      if (!electron?.appendChatMessage) return
      const proj = project
      const line: PersistedChatLineV1 = {
        schemaVersion: CHAT_STORE_SCHEMA_VERSION,
        id: args.id ?? crypto.randomUUID(),
        role: args.role,
        content,
        timestamp: new Date().toISOString(),
        model: voiceModelRef.current,
        ...(proj
          ? {
              turnContext: buildVoiceTurnContext({
                project: proj,
                activeRoot: activeRootRef.current,
                activeFilePath: activeFilePathRef.current,
              }),
            }
          : {}),
      }
      const res = await electron.appendChatMessage(line)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      publishChatThreadLine(line)
    },
    [project],
  )

  const persistVoiceLineRef = useRef(persistVoiceLine)
  persistVoiceLineRef.current = persistVoiceLine

  const flushUserVoiceAccumulated = useCallback(async () => {
    clearUserVoiceFlushTimer()
    const id = userVoiceDraftIdRef.current
    const text = userVoiceAccumRef.current.trim()
    publishVoiceUserDraft({ kind: 'clear' })
    if (!text || !id) {
      userVoiceDraftIdRef.current = null
      userVoiceAccumRef.current = ''
      return
    }
    userVoiceDraftIdRef.current = null
    userVoiceAccumRef.current = ''
    await persistVoiceLineRef.current({ role: 'user', content: text, id })
  }, [clearUserVoiceFlushTimer])

  const stopMic = useCallback(async () => {
    workletRef.current?.disconnect()
    workletRef.current = null
    sourceRef.current?.disconnect()
    sourceRef.current = null
    if (captureCtxRef.current) {
      await captureCtxRef.current.close().catch(() => {})
      captureCtxRef.current = null
    }
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop())
    mediaStreamRef.current = null
  }, [])

  const stopPlayback = useCallback(async () => {
    if (playbackCtxRef.current) {
      await playbackCtxRef.current.close().catch(() => {})
      playbackCtxRef.current = null
    }
    nextPlayTimeRef.current = 0
  }, [])

  const stopRemote = useCallback(async () => {
    await window.electron?.voiceSessionStop?.().catch(() => {})
  }, [])

  const stopAll = useCallback(async () => {
    assistantTranscriptBufRef.current.clear()
    await stopMic()
    await stopPlayback()
    await stopRemote()
  }, [stopMic, stopPlayback, stopRemote])

  const resetUserVoiceDraftState = useCallback(() => {
    clearUserVoiceFlushTimer()
    publishVoiceUserDraft({ kind: 'clear' })
    userVoiceDraftIdRef.current = null
    userVoiceAccumRef.current = ''
  }, [clearUserVoiceFlushTimer])

  useEffect(
    () => () => {
      void stopAll()
    },
    [stopAll],
  )

  useEffect(() => {
    if (!project || !projectId) {
      void stopAll()
      resetUserVoiceDraftState()
      setIsActive(false)
      setStatus('idle')
      setLastError(null)
    }
  }, [project, projectId, resetUserVoiceDraftState, stopAll])

  const schedulePlayBase64Pcm16 = useCallback((b64: string) => {
    if (!speakResponsesRef.current) return
    let ctx = playbackCtxRef.current
    if (!ctx || ctx.state === 'closed') {
      ctx = new AudioContext({ sampleRate: PLAYBACK_RATE })
      playbackCtxRef.current = ctx
      nextPlayTimeRef.current = ctx.currentTime
    }
    const float = base64Pcm16ToFloat32(b64)
    if (float.length === 0) return
    const buf = ctx.createBuffer(1, float.length, PLAYBACK_RATE)
    buf.copyToChannel(new Float32Array(float), 0)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    const startAt = Math.max(nextPlayTimeRef.current, ctx.currentTime)
    src.start(startAt)
    nextPlayTimeRef.current = startAt + buf.duration
  }, [])

  const flushAssistantTranscript = useCallback(
    (responseId: string) => {
      const map = assistantTranscriptBufRef.current
      const raw = map.get(responseId)
      map.delete(responseId)
      const text = raw?.trim() ?? ''
      if (text) void persistVoiceLine({ role: 'assistant', content: text })
    },
    [persistVoiceLine],
  )

  const onVoiceEvent = useCallback(
    (msg: VoiceRealtimeServerEvent) => {
      const t = typeof msg.type === 'string' ? msg.type : ''

      if (t === 'gf:session_update_sent' && import.meta.env.DEV) {
        const at = msg.at
        console.debug('[GrokForge voice] session.update sent', typeof at === 'number' ? new Date(at).toISOString() : '')
      }

      if (t === 'response.created') {
        setStatus('thinking')
      }

      if (t === 'input_audio_buffer.speech_started') {
        setStatus('listening')
        void (async () => {
          await flushUserVoiceAccumulated()
          userVoiceDraftIdRef.current = crypto.randomUUID()
          userVoiceAccumRef.current = ''
        })()
      }

      if (t === 'input_audio_buffer.speech_stopped') {
        setStatus('transcribing')
        clearUserVoiceFlushTimer()
        userVoiceFlushTimerRef.current = window.setTimeout(() => {
          void flushUserVoiceAccumulated()
        }, 360)
      }

      if (t === 'response.output_audio.delta') {
        const d =
          typeof msg.delta === 'string'
            ? msg.delta
            : typeof msg.audio === 'string'
              ? msg.audio
              : ''
        if (d) {
          setStatus('speaking')
          schedulePlayBase64Pcm16(d)
        }
      }

      if (t === 'response.output_audio_transcript.delta') {
        const delta = typeof msg.delta === 'string' ? msg.delta : ''
        const rid = getResponseId(msg)
        const cur = assistantTranscriptBufRef.current.get(rid) ?? ''
        assistantTranscriptBufRef.current.set(rid, cur + delta)
      }

      if (t === 'response.output_audio_transcript.done') {
        flushAssistantTranscript(getResponseId(msg))
      }

      if (t === 'conversation.item.input_audio_transcription.completed') {
        const text = extractUserTranscript(msg)
        if (text) {
          if (!userVoiceDraftIdRef.current) {
            userVoiceDraftIdRef.current = crypto.randomUUID()
          }
          userVoiceAccumRef.current = mergeUserVoiceTranscript(userVoiceAccumRef.current, text)
          publishVoiceUserDraft({
            kind: 'update',
            id: userVoiceDraftIdRef.current,
            content: userVoiceAccumRef.current,
          })
          clearUserVoiceFlushTimer()
          userVoiceFlushTimerRef.current = window.setTimeout(() => {
            void flushUserVoiceAccumulated()
          }, 420)
        }
        setStatus('thinking')
      }

      if (t === 'response.done') {
        setStatus('listening')
        const rid = typeof msg.response_id === 'string' ? msg.response_id : null
        if (rid && assistantTranscriptBufRef.current.has(rid)) {
          flushAssistantTranscript(rid)
        }
      }

      if (t === 'gf:connection_lost') {
        toast.message('Voice connection ended')
        void stopRemote()
        void stopMic()
        void stopPlayback()
        assistantTranscriptBufRef.current.clear()
        resetUserVoiceDraftState()
        setIsActive(false)
        setStatus('idle')
        setLastError(null)
      }

      if (t === 'error') {
        const message = formatVoiceServerError(msg)
        toast.error(message)
        setLastError(message)
        setStatus('error')
      }
    },
    [
      clearUserVoiceFlushTimer,
      flushAssistantTranscript,
      flushUserVoiceAccumulated,
      resetUserVoiceDraftState,
      schedulePlayBase64Pcm16,
      stopMic,
      stopPlayback,
      stopRemote,
    ],
  )

  useEffect(() => {
    if (!isActive) return
    const unsub = window.electron?.onVoiceRealtimeEvent?.((msg) => {
      onVoiceEvent(msg as VoiceRealtimeServerEvent)
    })
    return () => {
      unsub?.()
    }
  }, [isActive, onVoiceEvent])

  const startMic = useCallback(async () => {
    if (!window.electron?.voiceSendAudioChunk) return

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
    } catch (e) {
      throw new Error(mapMicError(e), { cause: e })
    }

    mediaStreamRef.current = stream
    const ctx = new AudioContext({ sampleRate: PLAYBACK_RATE })
    captureCtxRef.current = ctx
    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => {})
    }

    await registerVoiceCaptureWorklet(ctx)

    const source = ctx.createMediaStreamSource(stream)
    sourceRef.current = source

    const worklet = new AudioWorkletNode(ctx, 'gf-voice-capture', {
      numberOfInputs: 1,
      numberOfOutputs: 0,
    })
    workletRef.current = worklet

    worklet.port.onmessage = (ev: MessageEvent<ArrayBuffer>) => {
      const pcm = new Int16Array(ev.data)
      if (pcm.length === 0) return
      const float = new Float32Array(pcm.length)
      for (let i = 0; i < pcm.length; i++) float[i] = pcm[i]! / 32768.0
      const resampled =
        ctx.sampleRate === PLAYBACK_RATE ? float : resampleFloat32Mono(float, ctx.sampleRate, PLAYBACK_RATE)
      const b64 = float32ToBase64Pcm16(resampled)
      window.electron?.voiceSendAudioChunk?.(b64)
    }

    source.connect(worklet)
  }, [])

  const stop = useCallback(async () => {
    resetUserVoiceDraftState()
    assistantTranscriptBufRef.current.clear()
    await stopAll()
    setIsActive(false)
    setStatus('idle')
    setLastError(null)
    speakResponsesLoggedRef.current = false
  }, [resetUserVoiceDraftState, stopAll])

  const toggle = useCallback(async () => {
    if (!project) return
    if (!window.electron?.voiceSessionStart) {
      toast.error('Voice requires the GrokForge desktop app.')
      return
    }

    if (isActive && status !== 'error') {
      await stop()
      return
    }

    setStatus('connecting')
    setLastError(null)

    try {
      await stop()
      speakResponsesLoggedRef.current = false

      const summary = getThreadSummaryForVoiceRef.current?.()?.trim()
      const res = (await window.electron.voiceSessionStart(
        summary ? { threadSummary: summary } : {},
      )) as VoiceSessionStartResult
      if (!res.ok) {
        toast.error(res.error)
        setStatus('error')
        setLastError(res.error)
        return
      }

      if (import.meta.env.DEV && speakResponsesRef.current === false && !speakResponsesLoggedRef.current) {
        speakResponsesLoggedRef.current = true
        console.info('[GrokForge voice] speakResponses=false — audio dropped, transcript still rendered.')
      }

      try {
        await startMic()
      } catch (e) {
        const msg = e instanceof Error ? e.message : mapMicError(e)
        toast.error(msg)
        await stopRemote()
        setStatus('error')
        setLastError(msg)
        return
      }

      setIsActive(true)
      setStatus('listening')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to start voice'
      toast.error(msg)
      await stop()
      setStatus('error')
      setLastError(msg)
    }
  }, [isActive, project, startMic, status, stop, stopRemote])

  return { isActive, status, lastError, toggle, stop }
}
