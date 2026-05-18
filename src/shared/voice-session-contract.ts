import { z } from 'zod'

/** Max chars of recent text chat injected into voice session instructions (main slices further if needed). */
export const VOICE_SESSION_START_THREAD_SUMMARY_MAX = 12_000

export const VoiceSessionStartPayloadSchema = z.object({
  threadSummary: z.string().max(VOICE_SESSION_START_THREAD_SUMMARY_MAX).optional(),
})

export type VoiceSessionStartPayload = z.infer<typeof VoiceSessionStartPayloadSchema>
