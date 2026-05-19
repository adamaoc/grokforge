import { z } from 'zod'

export const AGENT_THREAD_MEMORY_SCHEMA_VERSION = 1 as const
export const AGENT_THREAD_MEMORY_MAX_FILES_READ = 24
export const AGENT_THREAD_MEMORY_MAX_DECISIONS = 12
export const AGENT_THREAD_MEMORY_MAX_CHARS = 2_000

export const AgentThreadMemoryV1Schema = z.object({
  schemaVersion: z.literal(AGENT_THREAD_MEMORY_SCHEMA_VERSION),
  filesRead: z.array(z.string().max(4096)).max(AGENT_THREAD_MEMORY_MAX_FILES_READ),
  decisions: z.array(z.string().max(512)).max(AGENT_THREAD_MEMORY_MAX_DECISIONS),
  updatedAt: z.string(),
})

export type AgentThreadMemoryV1 = z.infer<typeof AgentThreadMemoryV1Schema>
