/**
 * `tts-read-aloud` IPC contract (no Node). Main implementation: `src/main/voice/tts-read-aloud.ts`.
 */

/** xAI TTS max input length (see REST docs). */
export const TTS_READ_ALOUD_MAX_TEXT_CHARS = 15_000

/** Documented built-in voices (story 121). Legacy hash ids remain valid via custom voice id. */
export const TTS_VOICE_PRESETS = [
  { id: 'eve', label: 'Eve', detail: 'Default', language: 'auto' },
  { id: 'ara', label: 'Ara', detail: 'Built-in', language: 'auto' },
  { id: 'rex', label: 'Rex', detail: 'Built-in', language: 'auto' },
  { id: 'sal', label: 'Sal', detail: 'Built-in', language: 'auto' },
  { id: 'leo', label: 'Leo', detail: 'Built-in', language: 'auto' },
] as const

/** Legacy name aliases → hash voice ids (still accepted by xAI; not shown in primary picker). */
const TTS_VOICE_ALIASES: Record<string, string> = {
  daniel: '96819d0bd28d',
  james: '78a495fdbb39',
  henry: 'f15c6a6a',
  sean: 'a7b78b05',
  liam: '6a41d324',
  marc: '5d695b41',
}

export function normalizeTtsVoiceId(raw: string): string {
  const id = raw.trim().toLowerCase()
  return TTS_VOICE_ALIASES[id] ?? id
}

export function ttsLanguageForVoiceId(raw: string): string {
  const id = normalizeTtsVoiceId(raw)
  return TTS_VOICE_PRESETS.find((voice) => voice.id === id)?.language ?? 'auto'
}

export type TtsReadAloudRequest = {
  /** Plain text (renderer strips markdown before send). */
  text: string
  /** Built-in name (`eve`) or custom voice id from manifest. */
  voiceId: string
}

export type TtsVoiceInfo = {
  voice_id: string
  name?: string | null
}

export type TtsReadAloudOkResult = {
  ok: true
  mimeType: string
  base64: string
}

export type TtsReadAloudErrorResult = {
  ok: false
  error: string
}

export type TtsReadAloudResult = TtsReadAloudOkResult | TtsReadAloudErrorResult

export type TtsVerifyVoiceResult =
  | { ok: true; voice: TtsVoiceInfo }
  | { ok: false; error: string }
