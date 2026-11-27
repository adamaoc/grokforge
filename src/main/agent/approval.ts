import { ipcMain } from 'electron'
import { z } from 'zod'
import type {
  AgentApprovalDecision,
  AgentApprovalRespondResult,
  AgentApprovalResponse,
} from '../../shared/agent/chat-contract'
import { AGENT_CHAT_MAX_STREAM_ID_LEN } from '../../shared/agent/chat-contract'

type PendingApproval = {
  streamId: string
  resolve: (decision: AgentApprovalDecision) => void
}

const pendingApprovals = new Map<string, PendingApproval>()

const ApprovalResponseSchema = z.object({
  streamId: z.string().min(1).max(AGENT_CHAT_MAX_STREAM_ID_LEN),
  requestId: z.string().min(1).max(128),
  approved: z.boolean(),
  scope: z.enum(['once', 'turn']).optional(),
})

/**
 * Blocks until the user answers an approval card via IPC, or the turn abort signal fires.
 */
export function waitForApprovalDecision(
  requestId: string,
  streamId: string,
  signal: AbortSignal,
): Promise<AgentApprovalDecision> {
  if (signal.aborted) {
    return Promise.reject(signal.reason ?? new Error('Aborted'))
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      signal.removeEventListener('abort', onAbort)
      pendingApprovals.delete(requestId)
    }

    const onAbort = () => {
      cleanup()
      reject(signal.reason ?? new Error('Aborted'))
    }

    pendingApprovals.set(requestId, {
      streamId,
      resolve: (decision) => {
        cleanup()
        resolve(decision)
      },
    })

    signal.addEventListener('abort', onAbort, { once: true })
  })
}

export function registerAgentApprovalIpc(): void {
  ipcMain.handle(
    'agent-approval-respond',
    async (_, raw: unknown): Promise<AgentApprovalRespondResult> => {
      const parsed = ApprovalResponseSchema.safeParse(raw)
      if (!parsed.success) return { ok: false, error: parsed.error.message }

      const payload: AgentApprovalResponse = parsed.data
      const pending = pendingApprovals.get(payload.requestId)
      if (!pending || pending.streamId !== payload.streamId) {
        return { ok: false, error: 'Approval request is no longer active.' }
      }

      pending.resolve({ approved: payload.approved, scope: payload.scope ?? 'once' })
      return { ok: true }
    },
  )
}
