import { z } from 'zod'

export const AGENT_TURN_RECEIPT_SCHEMA_VERSION = 1 as const

/** Max JSONL lines kept per project (ring buffer on append). */
export const AGENT_TURN_RECEIPT_MAX_LINES = 200

export const TURN_RECOVERY_HINT_MARKER = 'GROKFORGE_TURN_RECOVERY_HINT' as const

export const TurnReceiptStatusSchema = z.enum([
  'in_progress',
  'completed',
  'cancelled',
  'error',
  'interrupted',
])

export type TurnReceiptStatus = z.infer<typeof TurnReceiptStatusSchema>

export const TerminalTurnReceiptStatusSchema = TurnReceiptStatusSchema.exclude(['in_progress'])

export type TerminalTurnReceiptStatus = z.infer<typeof TerminalTurnReceiptStatusSchema>

export const AgentTurnReceiptSchema = z.object({
  schemaVersion: z.literal(AGENT_TURN_RECEIPT_SCHEMA_VERSION),
  streamId: z.string().min(1).max(128),
  status: TurnReceiptStatusSchema,
  endedAt: z.string().datetime(),
  modelId: z.string().min(1).max(128),
  harnessProfileKey: z.enum(['grok_code_fast', 'grok_4_3', 'generic']),
  agentProfileId: z.enum(['default', 'planner', 'executor', 'explorer']),
  toolCallsStarted: z.number().int().nonnegative(),
  toolCallsCompleted: z.number().int().nonnegative(),
})

export type AgentTurnReceipt = z.infer<typeof AgentTurnReceiptSchema>

export const TURN_RECOVERY_SYSTEM_BLOCK_MAX_CHARS = 320

export function resolveReceiptBoundaryStatus(
  receipt: AgentTurnReceipt,
): TurnReceiptStatus | 'interrupted' {
  if (receipt.status === 'in_progress') return 'interrupted'
  return receipt.status
}

export function shouldInjectTurnRecoveryHint(receipt: AgentTurnReceipt): boolean {
  return resolveReceiptBoundaryStatus(receipt) === 'interrupted'
}

export function buildTurnRecoverySystemBlock(receipt: AgentTurnReceipt): string {
  const started = receipt.toolCallsStarted
  const completed = receipt.toolCallsCompleted
  const toolNote =
    started > 0
      ? ` Tool calls: ${completed}/${started} completed before the interruption.`
      : ''
  let text = [
    `## Turn recovery (${TURN_RECOVERY_HINT_MARKER})`,
    'The previous agent turn ended abruptly (app quit or crash). Re-verify workspace state before continuing — especially any in-flight shell commands or partial file edits.',
    toolNote,
  ].join(' ')
  if (text.length > TURN_RECOVERY_SYSTEM_BLOCK_MAX_CHARS) {
    text = `${text.slice(0, TURN_RECOVERY_SYSTEM_BLOCK_MAX_CHARS - 1)}…`
  }
  return text
}
