import { ipcMain } from 'electron'
import { z } from 'zod'
import type {
  AgentCommandApprovalRespondResult,
  AgentCommandApprovalResponse,
} from '../../shared/agent/chat-contract'
import { AGENT_CHAT_MAX_STREAM_ID_LEN } from '../../shared/agent/chat-contract'

type PendingApproval = {
  streamId: string
  resolve: (approved: boolean) => void
}

const pendingCommandApprovals = new Map<string, PendingApproval>()

const ApprovalResponseSchema = z.object({
  streamId: z.string().min(1).max(AGENT_CHAT_MAX_STREAM_ID_LEN),
  requestId: z.string().min(1).max(128),
  approved: z.boolean(),
})

/**
 * Blocks until the user approves/rejects via IPC or the turn abort signal fires.
 */
export function waitForCommandApproval(
  requestId: string,
  streamId: string,
  signal: AbortSignal,
): Promise<boolean> {
  if (signal.aborted) {
    return Promise.reject(signal.reason ?? new Error('Aborted'))
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      signal.removeEventListener('abort', onAbort)
      pendingCommandApprovals.delete(requestId)
    }

    const onAbort = () => {
      cleanup()
      reject(signal.reason ?? new Error('Aborted'))
    }

    pendingCommandApprovals.set(requestId, {
      streamId,
      resolve: (approved) => {
        cleanup()
        resolve(approved)
      },
    })

    signal.addEventListener('abort', onAbort, { once: true })
  })
}

export function registerAgentCommandApprovalIpc(): void {
  ipcMain.handle(
    'agent-command-approval-respond',
    async (_, raw: unknown): Promise<AgentCommandApprovalRespondResult> => {
      const parsed = ApprovalResponseSchema.safeParse(raw)
      if (!parsed.success) return { ok: false, error: parsed.error.message }

      const payload: AgentCommandApprovalResponse = parsed.data
      const pending = pendingCommandApprovals.get(payload.requestId)
      if (!pending || pending.streamId !== payload.streamId) {
        return { ok: false, error: 'Approval request is no longer active.' }
      }

      pending.resolve(payload.approved)
      return { ok: true }
    },
  )
}