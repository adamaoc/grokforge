import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { computeAgentContentHash } from '../agent/content-hash'
import type { HarnessResolvedPath } from '../workspace/paths'
import type { HarnessProposalAccumulator } from './accumulator'
import type { AgentToolWriteOp } from '../../harness-support/tools/contracts/tool-contract'

export type SubmitWriteProposalResult =
  | { ok: true; text: string }
  | { ok: false; text: string }

export async function submitHarnessWriteProposal(input: {
  accumulator: HarnessProposalAccumulator
  resolved: HarnessResolvedPath
  content: string
  /** When converting edit → proposal, preserve the model's read_file hash on the op. */
  expectedContentHashFromModel?: string
}): Promise<SubmitWriteProposalResult> {
  const { accumulator, resolved, content } = input
  const exists = existsSync(resolved.absPath)
  let diskContent: string | null = null
  if (exists) {
    try {
      diskContent = await readFile(resolved.absPath, 'utf-8')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to read file'
      return { ok: false, text: msg }
    }
  }

  const op: AgentToolWriteOp = {
    op: 'write_file',
    path: resolved.absPath,
    content,
    ...(diskContent === null
      ? { expectedOriginalContent: null }
      : {
          expectedOriginalContent: diskContent,
          expectedContentHash:
            input.expectedContentHashFromModel ?? computeAgentContentHash(diskContent),
        }),
  }

  accumulator.submitWriteOp(op)

  const verb = exists ? 'Updated' : 'Prepared'
  return {
    ok: true,
    text:
      `${verb} edit proposal for ${resolved.agentPath} (${content.length} characters). ` +
      'Review and apply in GrokForge — nothing written to disk until you approve.',
  }
}