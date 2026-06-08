import { normalizeAgentWriteFileContent } from './legacy-agent/proposal'
import type { ParsedAgentToolBatch } from './legacy-agent/tools'

/** Normalize write_file bodies before diff review or disk apply (crushed one-line HTML/JS). */
export function normalizeProposalBatch(batch: ParsedAgentToolBatch): ParsedAgentToolBatch {
  return {
    ...batch,
    operations: batch.operations.map((op) =>
      op.op === 'write_file'
        ? { ...op, content: normalizeAgentWriteFileContent(op.content ?? '') }
        : op,
    ),
  }
}
