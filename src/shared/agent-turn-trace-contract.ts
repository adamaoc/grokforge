import { z } from 'zod'

export const AGENT_TURN_TRACE_SCHEMA_VERSION = 1 as const

/** How many completed traces to keep on disk per project (ring buffer by mtime). */
export const AGENT_TURN_TRACE_MAX_FILES = 12

const RetrievedFileTraceSchema = z.object({
  path: z.string(),
  bucket: z.string(),
  score: z.number(),
  reasons: z.array(z.string()),
  dirty: z.boolean(),
  chars: z.number(),
  truncated: z.boolean(),
})

const RetrievalTraceSchema = z.object({
  generatedAt: z.string(),
  retrievedFiles: z.array(RetrievedFileTraceSchema),
  stale: z.boolean(),
  staleReason: z.string().optional(),
  skipped: z.object({
    ignored: z.number(),
    generated: z.number(),
    binary: z.number(),
    sensitive: z.number(),
    large: z.number(),
  }),
  warnings: z.array(z.string()),
  detailLines: z.array(z.string()).max(80),
  contextBodyChars: z.number(),
})

const ToolStepTraceSchema = z.object({
  iteration: z.number().int().nonnegative(),
  toolCallId: z.string(),
  name: z.string(),
  ok: z.boolean(),
  resultChars: z.number().int().nonnegative(),
  truncatedInLoop: z.boolean(),
  displayTitle: z.string().optional(),
  errorSnippet: z.string().max(2000).optional(),
})

export const AgentTurnTraceV1Schema = z.object({
  schemaVersion: z.literal(AGENT_TURN_TRACE_SCHEMA_VERSION),
  traceId: z.string().uuid(),
  projectId: z.string().min(1),
  streamId: z.string().min(1),
  model: z.string().min(1),
  chatMode: z.enum(['fast', 'plan']),
  userText: z.string(),
  startedAt: z.string(),
  completedAt: z.string(),
  durationMs: z.number().nonnegative(),
  outcome: z.enum(['completed', 'cancelled', 'error', 'timeout']),
  errorMessage: z.string().max(4000).optional(),
  threadSnapshot: z.object({
    messageCount: z.number().int().nonnegative(),
    approxTotalChars: z.number().int().nonnegative(),
  }),
  /** Sanitized copy of `activeContext` as sent to tools (selection text may be truncated). */
  activeContext: z.record(z.string(), z.unknown()),
  systemPromptChars: z.number().int().nonnegative().optional(),
  retrieval: RetrievalTraceSchema.optional(),
  toolSteps: z.array(ToolStepTraceSchema),
  editProposalCreated: z.boolean(),
  totalToolCharsAccumulated: z.number().int().nonnegative(),
  assistantStreamChars: z.number().int().nonnegative(),
  maxToolIterationsHit: z.boolean().optional(),
})

export type AgentTurnTraceV1 = z.infer<typeof AgentTurnTraceV1Schema>

export type GetLastAgentTurnTraceResult =
  | { ok: true; trace: AgentTurnTraceV1 | null }
  | { ok: false; error: string }

export type ExportSanitizedAgentTurnTraceResult =
  | { ok: true; json: string }
  | { ok: false; error: string }

export type ReplayAgentRetrievalPreviewResult =
  | {
      ok: true
      count: number
      details: string[]
      stale: boolean
      staleReason?: string
      skipped: {
        ignored: number
        generated: number
        binary: number
        sensitive: number
        large: number
      }
    }
  | { ok: false; error: string }
