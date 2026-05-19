import { z } from 'zod'

export const AGENT_CONTEXT_PINS_SCHEMA_VERSION = 1 as const
export const AGENT_CONTEXT_MAX_PINS_PER_PROJECT = 8
export const AGENT_CONTEXT_PIN_PATH_MAX_LEN = 4096

export type AgentContextPin = {
  type: 'file' | 'folder'
  path: string
}

export const AgentContextPinSchema = z.object({
  type: z.enum(['file', 'folder']),
  path: z.string().min(1).max(AGENT_CONTEXT_PIN_PATH_MAX_LEN),
})

export const AgentContextPinsFileSchema = z.object({
  schemaVersion: z.literal(AGENT_CONTEXT_PINS_SCHEMA_VERSION),
  pins: z.array(AgentContextPinSchema).max(AGENT_CONTEXT_MAX_PINS_PER_PROJECT),
})

export type AgentContextPinsFile = z.infer<typeof AgentContextPinsFileSchema>

export type GetProjectContextPinsResult =
  | { ok: true; pins: AgentContextPin[] }
  | { ok: false; error: string }

export type SetProjectContextPinsResult =
  | { ok: true; pins: AgentContextPin[] }
  | { ok: false; error: string }
