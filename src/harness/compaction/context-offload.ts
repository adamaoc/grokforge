/**
 * Context offload policy for large agent tool results (story 107).
 * No Node/fs — main process writes blobs; runner replaces provider-facing content with pointers.
 */

export const AGENT_CONTEXT_OFFLOAD = {
  /** UTF-8 byte length above which a tool result is offloaded to disk. */
  minUtf8Bytes: 12_000,
  /** Estimated token count above which offload triggers (chars / 4). */
  minTokenEstimate: 3_000,
  /** Max lines included in the pointer preview. */
  previewMaxLines: 40,
  /** Max chars for preview text inside the pointer JSON (keep total pointer under ~2k). */
  previewMaxChars: 900,
  /** Stale offload files older than this are pruned (7 days). */
  pruneMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
} as const

export type AgentToolOffloadPointer = {
  ok: true
  offloaded: true
  offloadPath: string
  lineCount: number
  sha256: string
  preview: string
  originalChars: number
  hint: string
}

/** UTF-8 byte length (ASCII-safe for JSON tool payloads). */
export function estimateUtf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length
}

/** Rough token estimate for offload threshold (no tokenizer dependency). */
export function estimateTokensFromChars(charCount: number): number {
  return Math.ceil(charCount / 4)
}

export function shouldOffloadToolResult(content: string): boolean {
  const bytes = estimateUtf8Bytes(content)
  if (bytes > AGENT_CONTEXT_OFFLOAD.minUtf8Bytes) return true
  const tokens = estimateTokensFromChars(content.length)
  return tokens > AGENT_CONTEXT_OFFLOAD.minTokenEstimate
}

export function buildPreviewLines(content: string): { preview: string; lineCount: number } {
  const lines = content.split(/\r?\n/)
  const lineCount = lines.length
  const head = lines.slice(0, AGENT_CONTEXT_OFFLOAD.previewMaxLines)
  let preview = head.join('\n')
  if (preview.length > AGENT_CONTEXT_OFFLOAD.previewMaxChars) {
    preview = `${preview.slice(0, AGENT_CONTEXT_OFFLOAD.previewMaxChars)}\n[…preview truncated…]`
  }
  if (lineCount > AGENT_CONTEXT_OFFLOAD.previewMaxLines) {
    preview = `${preview}\n[…${lineCount - AGENT_CONTEXT_OFFLOAD.previewMaxLines} more lines on disk…]`
  }
  return { preview, lineCount }
}

export function buildOffloadPointer(input: {
  offloadPath: string
  lineCount: number
  sha256: string
  preview: string
  originalChars: number
}): string {
  const pointer: AgentToolOffloadPointer = {
    ok: true,
    offloaded: true,
    offloadPath: input.offloadPath,
    lineCount: input.lineCount,
    sha256: input.sha256,
    preview: input.preview,
    originalChars: input.originalChars,
    hint:
      'Full tool output was offloaded to disk to save context. Call read_file with offloadPath to load the complete text.',
  }
  return JSON.stringify(pointer, null, 2)
}

/** Detect offloaded tool message JSON for budget reporting. */
export function parseOffloadedToolOriginalChars(toolContent: string): number | null {
  if (!toolContent.includes('"offloaded"')) return null
  try {
    const parsed = JSON.parse(toolContent) as { offloaded?: unknown; originalChars?: unknown }
    if (parsed.offloaded !== true) return null
    if (typeof parsed.originalChars === 'number' && parsed.originalChars >= 0) {
      return parsed.originalChars
    }
  } catch {
    return null
  }
  return null
}
