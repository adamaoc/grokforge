import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { TtsReadAloudResult } from '@/types'
import { normalizeTtsVoiceId, TTS_READ_ALOUD_MAX_TEXT_CHARS } from '@/types'
import { stripMinimalMarkdownForSpeech } from '@/lib/strip-minimal-markdown'

function base64ToBlob(b64: string, mime: string): Blob {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)!
  return new Blob([bytes], { type: mime })
}

export function useReadAloud(voiceId: string) {
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null)
  const [loadingMessageId, setLoadingMessageId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const voiceIdRef = useRef(voiceId)
  voiceIdRef.current = voiceId

  const cleanupPlayback = useCallback(() => {
    const a = audioRef.current
    if (a) {
      a.onended = null
      a.onerror = null
      a.pause()
      a.src = ''
      audioRef.current = null
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    setPlayingMessageId(null)
  }, [])

  useEffect(() => () => cleanupPlayback(), [cleanupPlayback])

  const stop = useCallback(() => {
    cleanupPlayback()
  }, [cleanupPlayback])

  const toggleReadAloud = useCallback(
    async (messageId: string, rawContent: string) => {
      const electron = window.electron
      if (!electron?.readAloud) {
        toast.error('Read aloud requires the GrokForge desktop app.')
        return
      }

      if (playingMessageId === messageId && audioRef.current && !audioRef.current.paused) {
        stop()
        return
      }

      const plain = stripMinimalMarkdownForSpeech(rawContent)
      if (!plain) {
        toast.message('Nothing to read')
        return
      }

      let toSend = plain
      if (toSend.length > TTS_READ_ALOUD_MAX_TEXT_CHARS) {
        toSend = toSend.slice(0, TTS_READ_ALOUD_MAX_TEXT_CHARS)
        toast.message('Read aloud truncated', {
          description: `Only the first ${TTS_READ_ALOUD_MAX_TEXT_CHARS.toLocaleString()} characters were sent.`,
        })
      }

      cleanupPlayback()
      setLoadingMessageId(messageId)

      let res: TtsReadAloudResult
      try {
        res = await electron.readAloud({
          text: toSend,
          voiceId: voiceIdRef.current,
        })
      } catch (e) {
        setLoadingMessageId(null)
        toast.error(e instanceof Error ? e.message : 'Read aloud failed')
        return
      }

      setLoadingMessageId(null)

      if (!res.ok) {
        toast.error(res.error)
        return
      }

      try {
        const blob = base64ToBlob(res.base64, res.mimeType)
        const url = URL.createObjectURL(blob)
        objectUrlRef.current = url
        const audio = new Audio(url)
        audioRef.current = audio
        setPlayingMessageId(messageId)

        audio.onended = () => {
          cleanupPlayback()
        }
        audio.onerror = () => {
          toast.error('Could not play audio')
          cleanupPlayback()
        }

        await audio.play().catch((err: unknown) => {
          toast.error(err instanceof Error ? err.message : 'Playback blocked')
          cleanupPlayback()
        })
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Read aloud failed')
        cleanupPlayback()
      }
    },
    [cleanupPlayback, playingMessageId, stop],
  )

  const copyPlainText = useCallback(async (rawContent: string) => {
    const electron = window.electron
    if (!electron?.writeClipboardText) {
      toast.error('Clipboard requires the GrokForge desktop app.')
      return
    }
    const plain = stripMinimalMarkdownForSpeech(rawContent)
    const res = await electron.writeClipboardText(plain)
    if (res.ok) {
      toast.message('Copied')
    } else {
      toast.error(res.error || 'Could not copy')
    }
  }, [])

  return {
    toggleReadAloud,
    stop,
    copyPlainText,
    playingMessageId,
    loadingMessageId,
  }
}

/** Resolve TTS voice from manifest (same names as Voice Agent / custom voices). */
export function readAloudVoiceIdFromManifest(project: { voice: { customVoiceId?: string | null } }): string {
  const c = project.voice.customVoiceId
  if (c != null && String(c).trim().length > 0) return normalizeTtsVoiceId(String(c))
  return 'eve'
}
