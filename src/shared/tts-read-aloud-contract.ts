/**
 * `tts-read-aloud` IPC contract (no Node). Main implementation: `src/main/tts-read-aloud.ts`.
 */

/** xAI TTS max input length (see REST docs). */
export const TTS_READ_ALOUD_MAX_TEXT_CHARS = 15_000

export const TTS_VOICE_PRESETS = [
  { id: 'eve', label: 'Eve', detail: 'Default', language: 'auto' },
  { id: '96819d0bd28d', label: 'Daniel', detail: 'Male · English', language: 'en' },
  { id: '78a495fdbb39', label: 'James', detail: 'Male · English', language: 'en' },
  { id: 'f15c6a6a', label: 'Henry', detail: 'Male · British English', language: 'en' },
  { id: 'a7b78b05', label: 'Sean', detail: 'Male · English (Ireland)', language: 'en' },
  { id: '6a41d324', label: 'Liam', detail: 'Male · American English', language: 'en' },
  { id: '5d695b41', label: 'Marc', detail: 'Male · English (South Africa)', language: 'en' },
] as const

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
