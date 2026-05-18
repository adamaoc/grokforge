import type { GrokProjectManifest } from './manifest'
import { shouldIgnoreFsEntry } from './ignore-globs'
import { isPathWithinWorkspaceRoots } from './workspace-path-guard'
import { isLikelySensitivePath, resolveAgentWorkspacePath } from './agent-workspace-tools'
import type { AgentChatActiveContext, AgentEditProposalPayload } from '../shared/agent-chat-contract'
import { AGENT_TOOL_PROTOCOL_VERSION, type AgentToolBatchPayload } from '../shared/agent-tool-contract'
import { AgentToolBatchPayloadSchema } from '../shared/agent-tool-schema'

export function validateAgentEditProposal(
  rawArgs: unknown,
  env: {
    projectId: string
    manifest: GrokProjectManifest
    activeContext: AgentChatActiveContext
    signal: AbortSignal
  },
): { ok: true; proposal: AgentEditProposalPayload } | { ok: false; error: string; proposal?: AgentEditProposalPayload } {
  const parsed = AgentToolBatchPayloadSchema.safeParse(rawArgs)
  if (!parsed.success) return { ok: false, error: parsed.error.message }

  const operations: AgentToolBatchPayload['operations'] = []
  const rejected: AgentEditProposalPayload['rejected'] = []
  const roots = env.manifest.roots
  const ignore = env.manifest.ignore ?? []

  for (const op of parsed.data.operations) {
    const resolved = resolveAgentWorkspacePath(op.path, env)
    if (!resolved || !isPathWithinWorkspaceRoots(resolved, roots)) {
      rejected.push({ path: op.path, reason: 'Path outside workspace roots' })
      continue
    }
    if (shouldIgnoreFsEntry(resolved, roots, ignore)) {
      rejected.push({ path: op.path, reason: 'Path matches manifest ignore rules' })
      continue
    }
    if (isLikelySensitivePath(resolved)) {
      rejected.push({ path: op.path, reason: 'Path looks sensitive and is excluded from agent edit proposals' })
      continue
    }
    operations.push(
      op.op === 'write_file'
        ? { op: 'write_file', path: resolved, content: op.content }
        : { op: 'delete_file', path: resolved },
    )
  }

  const proposal: AgentEditProposalPayload = {
    batch: { version: AGENT_TOOL_PROTOCOL_VERSION, operations },
    rejected,
  }
  if (operations.length === 0) return { ok: false, error: 'No proposal operations passed workspace validation.', proposal }
  return { ok: true, proposal }
}
