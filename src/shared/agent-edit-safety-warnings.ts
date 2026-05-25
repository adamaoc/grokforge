import { isMarkdownOrPlainTextPath } from './agent-markdown-path'
import {
  hasDominantLiteralEscapedNewlines,
  isCollapsedMultiStatementSource,
  looksLikeJsxOrTsxSource,
  looksLikeMarkdownDocument,
  needsSourceLayoutRepair,
} from './agent-file-content-normalize'

export type AgentEditSafetySeverity = 'ok' | 'caution' | 'severe'

export type AgentEditSafetyIssueCode =
  | 'dramatic_shrink'
  | 'single_line_blob'
  | 'brace_imbalance'
  | 'intent_mostly_deletions'
  | 'literal_escaped_newlines'
  | 'collapsed_single_line_source'
  | 'messy_source_layout'

export type AgentEditSafetyIssue = {
  code: AgentEditSafetyIssueCode
  message: string
}

export type AgentEditSafetyResult = {
  severity: AgentEditSafetySeverity
  issues: AgentEditSafetyIssue[]
  statsLine: string
  hasLiteralEscapedNewlines: boolean
  hasCollapsedSingleLineSource: boolean
  hasMessySourceLayout: boolean
}

const ADD_INTENT_RE = /\b(add|widget|insert|append)\b/i

function countLines(text: string): number {
  if (!text) return 0
  return text.split('\n').length
}

function countChars(text: string): number {
  return text.length
}

function balanceDelta(original: string, modified: string, open: string, close: string): number {
  const count = (s: string, ch: string) => (s.match(new RegExp(`\\${ch}`, 'g')) ?? []).length
  const origBal = count(original, open) - count(original, close)
  const modBal = count(modified, open) - count(modified, close)
  return Math.abs(modBal) - Math.abs(origBal)
}

function formatStatsLine(
  originalLines: number,
  modifiedLines: number,
  status: 'created' | 'modified' | 'deleted',
): string {
  if (status === 'created') {
    return `New file · ${modifiedLines} ${modifiedLines === 1 ? 'line' : 'lines'}`
  }
  if (status === 'deleted') {
    return `${originalLines} ${originalLines === 1 ? 'line' : 'lines'} → deleted`
  }
  if (originalLines === 0) {
    return `${modifiedLines} ${modifiedLines === 1 ? 'line' : 'lines'}`
  }
  const delta = modifiedLines - originalLines
  const pct =
    originalLines > 0 ? Math.round((Math.abs(delta) / originalLines) * 100) : 0
  const sign = delta >= 0 ? '+' : '−'
  if (delta === 0) {
    return `${originalLines} lines (no line count change)`
  }
  return `${originalLines} lines → ${modifiedLines} lines (${sign}${pct}% lines)`
}

function maxSeverity(a: AgentEditSafetySeverity, b: AgentEditSafetySeverity): AgentEditSafetySeverity {
  const rank = { ok: 0, caution: 1, severe: 2 }
  return rank[a] >= rank[b] ? a : b
}

export function analyzeAgentEditSafety(args: {
  original: string | null
  modified: string
  status?: 'created' | 'modified' | 'deleted'
  userMessageHint?: string
  /** When set, markdown/plain-text docs skip JSX-style “crushed layout” cautions. */
  resolvedPath?: string
}): AgentEditSafetyResult {
  const status =
    args.status ??
    (args.original === null ? 'created' : args.modified === '' ? 'deleted' : 'modified')
  const original = args.original ?? ''
  const modified = args.modified ?? ''
  const originalLines = countLines(original)
  const modifiedLines = countLines(modified)
  const originalChars = countChars(original)
  const modifiedChars = countChars(modified)

  const issues: AgentEditSafetyIssue[] = []
  let severity: AgentEditSafetySeverity = 'ok'

  const statsLine = formatStatsLine(originalLines, modifiedLines, status)
  const hasLiteralEscapedNewlines = hasDominantLiteralEscapedNewlines(modified)
  const hasCollapsedSingleLineSource = isCollapsedMultiStatementSource(modified)
  const skipMessyLayoutForMarkdown =
    Boolean(args.resolvedPath && isMarkdownOrPlainTextPath(args.resolvedPath)) &&
    looksLikeMarkdownDocument(modified) &&
    !looksLikeJsxOrTsxSource(modified)
  const hasMessySourceLayout =
    !hasCollapsedSingleLineSource &&
    !skipMessyLayoutForMarkdown &&
    needsSourceLayoutRepair(modified)

  if (hasLiteralEscapedNewlines) {
    issues.push({
      code: 'literal_escaped_newlines',
      message:
        'Proposed content has many literal \\n sequences instead of real line breaks. Try “Normalize line breaks” before applying.',
    })
    severity = maxSeverity(severity, 'caution')
  }

  if (hasCollapsedSingleLineSource) {
    issues.push({
      code: 'collapsed_single_line_source',
      message:
        'Proposed content is one long line with many statements. A // comment on that line can comment out the rest of the file. Try “Normalize line breaks” before applying.',
    })
    severity = maxSeverity(severity, 'severe')
  } else if (hasMessySourceLayout) {
    issues.push({
      code: 'messy_source_layout',
      message:
        'Proposed content still has very long lines or too few line breaks (crushed JSX/statements). Try “Normalize line breaks” before applying.',
    })
    severity = maxSeverity(severity, 'caution')
  }

  if (status === 'modified' && originalLines > 0) {
    const lineRatio = modifiedLines / originalLines
    const charRatio = originalChars > 0 ? modifiedChars / originalChars : 1

    if (lineRatio < 0.5 || charRatio < 0.5) {
      issues.push({
        code: 'dramatic_shrink',
        message: `File shrinks substantially (${statsLine}). Applying may remove large sections unintentionally.`,
      })
      severity = maxSeverity(severity, 'caution')
    }

    if (
      (lineRatio < 0.2 || charRatio < 0.2 || modifiedLines <= 2) &&
      originalLines >= 10
    ) {
      issues.push({
        code: 'dramatic_shrink',
        message: `Severe shrink: most of the original file would be removed (${statsLine}).`,
      })
      severity = maxSeverity(severity, 'severe')
    }

    if (originalLines >= 5 && modifiedLines <= 2) {
      issues.push({
        code: 'single_line_blob',
        message:
          'Proposed content is only a line or two while the original file is much larger. This often breaks the file.',
      })
      severity = maxSeverity(severity, 'severe')
    }

    const braceDrop =
      balanceDelta(original, modified, '{', '}') + balanceDelta(original, modified, '(', ')')
    if (braceDrop >= 2) {
      issues.push({
        code: 'brace_imbalance',
        message:
          'Brace or parenthesis balance changed significantly compared to the original. Check for missing closing tokens.',
      })
      severity = maxSeverity(severity, 'caution')
    }

    const netLineDelta = modifiedLines - originalLines
    const hint = args.userMessageHint?.trim() ?? ''
    if (ADD_INTENT_RE.test(hint) && netLineDelta < -Math.max(3, Math.floor(originalLines * 0.25))) {
      issues.push({
        code: 'intent_mostly_deletions',
        message:
          'Your request sounds additive, but this proposal removes more lines than it adds. Review the diff carefully.',
      })
      severity = maxSeverity(severity, 'caution')
    }
  }

  return {
    severity,
    issues,
    statsLine,
    hasLiteralEscapedNewlines,
    hasCollapsedSingleLineSource,
    hasMessySourceLayout,
  }
}

export function mergeAgentEditSafetyResults(
  results: AgentEditSafetyResult[],
): AgentEditSafetyResult {
  if (results.length === 0) {
    return {
      severity: 'ok',
      issues: [],
      statsLine: '',
      hasLiteralEscapedNewlines: false,
      hasCollapsedSingleLineSource: false,
      hasMessySourceLayout: false,
    }
  }

  let severity: AgentEditSafetySeverity = 'ok'
  const issues: AgentEditSafetyIssue[] = []
  let hasLiteralEscapedNewlines = false
  let hasCollapsedSingleLineSource = false
  let hasMessySourceLayout = false
  const statsParts: string[] = []

  for (const r of results) {
    severity = maxSeverity(severity, r.severity)
    issues.push(...r.issues)
    if (r.hasLiteralEscapedNewlines) hasLiteralEscapedNewlines = true
    if (r.hasCollapsedSingleLineSource) hasCollapsedSingleLineSource = true
    if (r.hasMessySourceLayout) hasMessySourceLayout = true
    if (r.statsLine) statsParts.push(r.statsLine)
  }

  const seen = new Set<string>()
  const dedupedIssues = issues.filter((issue) => {
    const key = `${issue.code}:${issue.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return {
    severity,
    issues: dedupedIssues,
    statsLine: statsParts.join(' · '),
    hasLiteralEscapedNewlines,
    hasCollapsedSingleLineSource,
    hasMessySourceLayout,
  }
}
