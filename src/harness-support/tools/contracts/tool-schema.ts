import { z } from 'zod'
import {
  AGENT_TOOL_FENCE_INFO,
  AGENT_TOOL_MAX_CONTENT_CHARS_PER_FILE,
  AGENT_TOOL_MAX_OPS,
  AGENT_TOOL_PROTOCOL_VERSION,
} from './tool-contract'
/** Lenient at parse time; callers decide create-vs-update hash rules. */
const expectedContentHashSchema = z.string().max(128).optional()

const WriteOpSchema = z.object({
  op: z.literal('write_file'),
  path: z.string().min(1).max(4096),
  content: z.string().max(AGENT_TOOL_MAX_CONTENT_CHARS_PER_FILE),
  expectedOriginalContent: z.string().max(AGENT_TOOL_MAX_CONTENT_CHARS_PER_FILE).nullable().optional(),
  expectedContentHash: expectedContentHashSchema.optional(),
})

const DeleteOpSchema = z.object({
  op: z.literal('delete_file'),
  path: z.string().min(1).max(4096),
  expectedOriginalContent: z.string().max(AGENT_TOOL_MAX_CONTENT_CHARS_PER_FILE).nullable().optional(),
  expectedContentHash: expectedContentHashSchema.optional(),
})

export const AgentToolBatchPayloadSchema = z.object({
  version: z.literal(AGENT_TOOL_PROTOCOL_VERSION),
  operations: z.array(z.discriminatedUnion('op', [WriteOpSchema, DeleteOpSchema])).min(1).max(AGENT_TOOL_MAX_OPS),
})

export type ParsedAgentToolBatch = z.infer<typeof AgentToolBatchPayloadSchema>

const escapedFenceInfo = AGENT_TOOL_FENCE_INFO.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Full fenced blocks (possibly multiple); used for chat display only — persisted text stays unchanged. */
const FENCE_STRIP_RE = new RegExp('```\\s*' + escapedFenceInfo + '\\s*\\n[\\s\\S]*?```', 'gm')

/**
 * While the model is still streaming, the closing ``` may be missing — hide the partial fence + JSON tail
 * so users do not watch raw tool JSON appear character by character.
 */
const FENCE_INCOMPLETE_TAIL_RE = new RegExp('(?:^|\\n)```\\s*' + escapedFenceInfo + '\\s*\\n[\\s\\S]*$')

/**
 * Removes legacy grokforge-agent-tools fences from assistant markdown for display, copy, and read-aloud.
 * Does not mutate stored thread content. New turns must use `propose_file_edits`; fences are not applied.
 */
export function stripAgentToolFenceFromAssistantDisplay(text: string): string {
  let out = text.replace(FENCE_STRIP_RE, '')
  out = out.replace(FENCE_INCOMPLETE_TAIL_RE, '')
  return out.replace(/\n{3,}/g, '\n\n').trimEnd()
}
