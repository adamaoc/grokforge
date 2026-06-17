/**
 * Per-turn context for harness tools that need main-process services (command approval).
 * File tools ignore this; {@link executeRunCommandHarnessTool} requires it.
 */

import type { GrokProjectManifest } from '../../main/project/manifest'
import type {
  AgentChatActiveContext,
  AgentChatEventPayload,
  AgentCommandApprovalRequest,
} from '../../shared/agent/chat-contract'

export type HarnessCommandApprovalGate = {
  requestApproval(input: {
    requestId: string
    request: Omit<AgentCommandApprovalRequest, 'streamId' | 'requestId'>
  }): Promise<boolean>
}

export type HarnessToolActivityUpdate = {
  id: string
  title?: string
  detail?: string
  status?: 'running' | 'done' | 'error' | 'awaiting_approval' | 'rejected' | 'timeout'
}

export type HarnessToolRunContext = {
  projectId: string
  streamId: string
  manifest: GrokProjectManifest
  activeContext: AgentChatActiveContext
  activeRootId: string
  signal: AbortSignal
  commandApproval: HarnessCommandApprovalGate
  emit: (payload: AgentChatEventPayload) => void
  updateToolActivity: (update: HarnessToolActivityUpdate) => void
}