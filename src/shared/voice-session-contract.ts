import { z } from 'zod'

/** Max chars accepted on voice-session-start IPC for threadSummary. */
export const VOICE_SESSION_START_THREAD_SUMMARY_MAX = 12_000

/** Effective cap used when building the renderer summary ref and when main injects into session instructions. */
export const VOICE_THREAD_SUMMARY_EFFECTIVE_MAX = 10_000

export const VoiceSessionStartPayloadSchema = z.object({
  threadSummary: z.string().max(VOICE_SESSION_START_THREAD_SUMMARY_MAX).optional(),
})

export type VoiceSessionStartPayload = z.infer<typeof VoiceSessionStartPayloadSchema>
