import type { AgentEditProposalPayload } from '../../shared/agent-chat-contract'
import {
  AGENT_TOOL_MAX_OPS,
  AGENT_TOOL_PROTOCOL_VERSION,
  type AgentToolOperation,
} from '../tools/contracts/tool-contract'

const TURN_MAX_OPS_REASON = 'Turn exceeded max operations per proposal'

/** Path key for merging operations (no Node imports). */
export function agentEditProposalPathKey(path: string): string {
  const trimmed = path.trim().replace(/\\/g, '/')
  if (!trimmed) return ''
  const isWin = /^[A-Za-z]:\//.test(trimmed)
  const parts = trimmed.split('/').filter((p) => p && p !== '.')
  const stack: string[] = []
  for (const p of parts) {
    if (p === '..') {
      if (stack.length) stack.pop()
      continue
    }
    stack.push(p)
  }
  const joined = stack.join('/')
  if (isWin) {
    const drive = trimmed.slice(0, 2).toUpperCase()
    return joined ? `${drive}/${joined}` : drive
  }
  return trimmed.startsWith('/') ? (joined ? `/${joined}` : '/') : joined
}

/** In-turn accumulated write_file body for same-path search_replace chaining. */
export type AccumulatedWriteForPath = {
  content: string
  expectedContentHash?: string
}

/** Latest write_file op for a resolved path in the turn proposal accumulator. */
export function findAccumulatedWriteForPath(
  accumulated: AgentEditProposalPayload | null,
  resolvedPath: string,
): AccumulatedWriteForPath | null {
  if (!accumulated) return null
  const key = agentEditProposalPathKey(resolvedPath)
  for (const op of accumulated.batch.operations) {
    if (op.op !== 'write_file') continue
    if (agentEditProposalPathKey(op.path) !== key) continue
    return {
      content: op.content,
      ...(op.expectedContentHash ? { expectedContentHash: op.expectedContentHash } : {}),
    }
  }
  return null
}

function dedupeRejected(
  rejected: AgentEditProposalPayload['rejected'],
): AgentEditProposalPayload['rejected'] {
  const seen = new Set<string>()
  const out: AgentEditProposalPayload['rejected'] = []
  for (const item of rejected) {
    const key = `${item.path}\0${item.reason}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

/**
 * Merge edit proposals from multiple tool calls in the same agent turn.
 * Same path: incoming replaces accumulated (content should already chain via search_replace).
 * Different paths: operations accumulate.
 */
export function mergeAgentEditProposals(
  accumulated: AgentEditProposalPayload | null,
  incoming: AgentEditProposalPayload,
): AgentEditProposalPayload {
  if (!accumulated) {
    return capProposalOperations(incoming)
  }

  const opByKey = new Map<string, AgentToolOperation>()
  for (const op of accumulated.batch.operations) {
    opByKey.set(agentEditProposalPathKey(op.path), op)
  }
  for (const op of incoming.batch.operations) {
    opByKey.set(agentEditProposalPathKey(op.path), op)
  }

  const rejected = dedupeRejected([...accumulated.rejected, ...incoming.rejected]).filter(
    (item) => !opByKey.has(agentEditProposalPathKey(item.path)),
  )
  const operations = [...opByKey.values()]

  return capProposalOperations({
    batch: { version: AGENT_TOOL_PROTOCOL_VERSION, operations },
    rejected,
    review: incoming.review ?? accumulated.review,
  })
}

function capProposalOperations(proposal: AgentEditProposalPayload): AgentEditProposalPayload {
  const { operations } = proposal.batch
  if (operations.length <= AGENT_TOOL_MAX_OPS) return proposal

  const kept = operations.slice(0, AGENT_TOOL_MAX_OPS)
  const overflow = operations.slice(AGENT_TOOL_MAX_OPS)
  const rejected = dedupeRejected([
    ...proposal.rejected,
    ...overflow.map((op) => ({
      path: op.path,
      reason: TURN_MAX_OPS_REASON,
    })),
  ])

  return {
    batch: { version: AGENT_TOOL_PROTOCOL_VERSION, operations: kept },
    rejected,
    review: proposal.review,
  }
}
