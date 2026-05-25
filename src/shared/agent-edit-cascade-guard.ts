import { agentEditPathKey } from './agent-edit-read-guard'
import { isMarkdownOrPlainTextPath } from './agent-markdown-path'
import { analyzeAgentEditSafety } from './agent-edit-safety-warnings'

export { isMarkdownOrPlainTextPath } from './agent-markdown-path'

/** Failed search_replace attempts on a path before blocking destructive full-file proposals. */
export const SEARCH_REPLACE_FAILURES_BEFORE_ESCALATION_GUARD = 2

/** Total failed search_replace calls in one turn before forcing final answer (avoids long thinking stalls). */
export const SEARCH_REPLACE_MAX_FAILURES_PER_TURN_BEFORE_FORCE_FINAL = 6

/** Tool rounds allowed after the escalation nudge before forcing final answer without a proposal. */
export const POST_ESCALATION_MAX_TOOL_ROUNDS = 2

export const AGENT_EDIT_CASCADE_GUARD_REASON =
  'Blocked: multiple search_replace failures on this file, and this proposal would remove a large portion of the file.'

export const FULL_FILE_REWRITE_INTENT_RE =
  /\b(rewrite\s+(the\s+)?(whole|entire)\s+file|replace\s+the\s+whole\s+file|from\s+scratch|redo\s+the\s+whole|full\s+file\s+rewrite)\b/i

/** Small markdown/plain docs — section edits should use propose_file_edits, not cascade shrink blocks. */
export const CASCADE_GUARD_SMALL_MARKDOWN_MAX_LINES = 64

/** Shrink guard applies to code-like or larger docs; not small .md/.txt (overview.md-style). */
export function shouldApplyShrinkCascadeGuard(
  originalOnDisk: string,
  resolvedPath: string,
): boolean {
  const lineCount = originalOnDisk.split(/\r?\n/).length
  if (lineCount < 5) return false
  if (
    isMarkdownOrPlainTextPath(resolvedPath) &&
    lineCount <= CASCADE_GUARD_SMALL_MARKDOWN_MAX_LINES
  ) {
    return false
  }
  return true
}

export function recordSearchReplaceFailure(
  failuresByPath: Map<string, number>,
  resolvedAbsolutePath: string,
): void {
  const key = agentEditPathKey(resolvedAbsolutePath)
  failuresByPath.set(key, (failuresByPath.get(key) ?? 0) + 1)
}

export function searchReplaceFailureCount(
  failuresByPath: ReadonlyMap<string, number> | undefined,
  resolvedAbsolutePath: string,
): number {
  if (!failuresByPath) return 0
  return failuresByPath.get(agentEditPathKey(resolvedAbsolutePath)) ?? 0
}

/** True when any path in the turn has reached the escalation / cascade threshold. */
export function shouldInjectSearchReplaceEscalation(
  failuresByPath: ReadonlyMap<string, number> | undefined,
): boolean {
  if (!failuresByPath) return false
  for (const count of failuresByPath.values()) {
    if (count >= SEARCH_REPLACE_FAILURES_BEFORE_ESCALATION_GUARD) return true
  }
  return false
}

/** Path keys (normalized) at or above the escalation threshold. */
export function pathsAtSearchReplaceEscalationThreshold(
  failuresByPath: ReadonlyMap<string, number> | undefined,
): string[] {
  if (!failuresByPath) return []
  const out: string[] = []
  for (const [pathKey, count] of failuresByPath) {
    if (count >= SEARCH_REPLACE_FAILURES_BEFORE_ESCALATION_GUARD) out.push(pathKey)
  }
  return out
}

export function totalSearchReplaceFailures(
  failuresByPath: ReadonlyMap<string, number> | undefined,
): number {
  if (!failuresByPath) return 0
  let total = 0
  for (const count of failuresByPath.values()) total += count
  return total
}

/** Aligns with dramatic_shrink caution threshold in agent-edit-safety-warnings. */
export function isDestructiveFileShrink(
  original: string,
  modified: string,
  resolvedPath?: string,
): boolean {
  if (!original.trim()) return false
  if (resolvedPath && !shouldApplyShrinkCascadeGuard(original, resolvedPath)) return false
  const originalLines = original.split('\n').length
  const modifiedLines = modified.split('\n').length
  if (originalLines < 5) return false
  const lineRatio = modifiedLines / originalLines
  const charRatio = original.length > 0 ? modified.length / original.length : 1
  return lineRatio < 0.5 || charRatio < 0.5
}

export function formatCascadeShrinkStats(original: string, proposed: string): string {
  const oLines = original.split(/\r?\n/).length
  const pLines = proposed.split(/\r?\n/).length
  return `on-disk ${oLines} lines → proposal ${pLines} lines (${original.length} → ${proposed.length} chars)`
}

export type CascadeGuardAssessment = {
  blocked: boolean
  reason?: string
  path?: string
}

/**
 * After repeated search_replace failures, reject full-file write proposals that would
 * dramatically shrink an existing file (unless the user asked for a full rewrite).
 */
export function assessEditCascadeGuard(input: {
  resolvedPath: string
  originalOnDisk: string | null
  proposedContent: string
  searchReplaceFailuresByPath?: ReadonlyMap<string, number>
  userMessageHint?: string
}): CascadeGuardAssessment {
  if (input.userMessageHint?.trim() && FULL_FILE_REWRITE_INTENT_RE.test(input.userMessageHint)) {
    return { blocked: false }
  }
  const failures = searchReplaceFailureCount(input.searchReplaceFailuresByPath, input.resolvedPath)
  if (failures < SEARCH_REPLACE_FAILURES_BEFORE_ESCALATION_GUARD) {
    return { blocked: false }
  }
  const original = input.originalOnDisk
  if (original === null) return { blocked: false }

  if (!isDestructiveFileShrink(original, input.proposedContent, input.resolvedPath)) {
    return { blocked: false }
  }

  const safety = analyzeAgentEditSafety({
    original,
    modified: input.proposedContent,
    status: 'modified',
    userMessageHint: input.userMessageHint,
  })

  return {
    blocked: true,
    path: input.resolvedPath,
    reason: [
      AGENT_EDIT_CASCADE_GUARD_REASON,
      `(${formatCascadeShrinkStats(original, input.proposedContent)}${safety.statsLine ? `; ${safety.statsLine}` : ''})`,
      'Re-read with read_file and call propose_file_edits with the **complete** rawContent body (all sections), changing only what the user asked.',
      'Do not send only the changed section or a shortened stub.',
    ]
      .filter(Boolean)
      .join(' '),
  }
}
