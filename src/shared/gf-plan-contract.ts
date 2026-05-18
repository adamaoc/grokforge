import { z } from 'zod'

/** Fenced markdown language tag — must not collide with `grokforge-agent-tools`. */
export const GF_PLAN_FENCE = 'gf-plan'

export const GF_PLAN_SCHEMA_VERSION = 1 as const

export const GfPlanV1Schema = z.object({
  schemaVersion: z.literal(GF_PLAN_SCHEMA_VERSION),
  summary: z.string().min(1).max(12_000),
  filesLikelyTouched: z.array(z.string().max(4096)).max(64),
  risksUnknowns: z.array(z.string().max(4000)).max(40),
  steps: z
    .array(
      z.object({
        id: z.string().min(1).max(128),
        title: z.string().min(1).max(800),
      }),
    )
    .min(1)
    .max(48),
  verification: z.string().min(1).max(8000),
})

export type GfPlanV1 = z.infer<typeof GfPlanV1Schema>

const FENCE_BODY_RE = /```\s*gf-plan\s*\n([\s\S]*?)```/im
const FENCE_STRIP_RE = /```\s*gf-plan\s*\n[\s\S]*?```/gim
/** Streaming: closing ``` may be missing — hide partial fence + JSON tail. */
const FENCE_INCOMPLETE_TAIL_RE = /(?:^|\n)```\s*gf-plan\s*\n[\s\S]*$/i

export function parseGfPlanFromAssistantContent(content: string): GfPlanV1 | null {
  const m = content.match(FENCE_BODY_RE)
  if (!m?.[1]) return null
  try {
    const json = JSON.parse(m[1].trim()) as unknown
    const parsed = GfPlanV1Schema.safeParse(json)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/**
 * Removes `gf-plan` fences from assistant markdown for display, copy, and read-aloud.
 * Does not mutate persisted thread lines.
 */
export function stripGfPlanFenceFromAssistantDisplay(text: string): string {
  let out = text.replace(FENCE_STRIP_RE, '')
  out = out.replace(FENCE_INCOMPLETE_TAIL_RE, '')
  return out.replace(/\n{3,}/g, '\n\n').trimEnd()
}
