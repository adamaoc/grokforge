import {
  findAccumulatedWriteForPath,
  mergeAgentEditProposals,
} from '../../harness-support/diff/edit-proposal-merge'
import type {
  AgentEditProposalPayload,
  AgentEditProposalRejectedFile,
} from '../../shared/agent/chat-contract'
import {
  AGENT_TOOL_PROTOCOL_VERSION,
  type AgentToolWriteOp,
} from '../../harness-support/tools/contracts/tool-contract'

export type HarnessProposalEmit = (proposal: AgentEditProposalPayload) => void

/**
 * Per-turn proposal accumulator — merges write_file / edit ops and streams
 * `edit_proposal` to the renderer. Nothing hits disk until the user applies.
 */
export class HarnessProposalAccumulator {
  private accumulated: AgentEditProposalPayload | null = null

  constructor(private readonly emit: HarnessProposalEmit) {}

  getSnapshot(): AgentEditProposalPayload | null {
    return this.accumulated
  }

  /** Latest proposed full-file body for in-turn edit chaining (same path). */
  findWriteContentForPath(absPath: string): { content: string; expectedContentHash?: string } | null {
    return findAccumulatedWriteForPath(this.accumulated, absPath)
  }

  submitWriteOp(
    op: AgentToolWriteOp,
    rejected: AgentEditProposalRejectedFile[] = [],
  ): AgentEditProposalPayload {
    const incoming: AgentEditProposalPayload = {
      batch: { version: AGENT_TOOL_PROTOCOL_VERSION, operations: [op] },
      rejected,
    }
    this.accumulated = mergeAgentEditProposals(this.accumulated, incoming)
    this.emit(this.accumulated)
    return this.accumulated
  }
}