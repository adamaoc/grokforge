/** Line is only a stray closing paren — common when JSX reflow corrupts HTML/JS. */
const ORPHAN_CLOSE_PAREN_LINE = /^\s*\)[;]?\s*$/

export const AGENT_EDIT_CORRUPT_CONTENT_REASON =
  'Proposal content looks corrupted (orphan closing parentheses). Re-read rawContent and try search_replace or a clean rewrite.'

export const AGENT_EDIT_INCOMPLETE_HTML_REASON =
  'Proposal HTML looks incomplete or malformed (missing tags or truncated). Emit a complete document with <!DOCTYPE html>, <html>, <head>, <body>, and closing tags.'

const MIN_ORPHAN_LINES = 3
/** Orphan lines must be a meaningful fraction of the file (avoids tiny snippets). */
const MIN_ORPHAN_RATIO = 0.08

/** Minimum size for a greenfield HTML page (not a one-line stub). */
const MIN_HTML_DOCUMENT_CHARS = 120

export function looksLikeHtmlDocument(content: string): boolean {
  const trimmed = content.trimStart()
  if (/^<!DOCTYPE\s+html/i.test(trimmed)) return true
  if (/^<html[\s>/]/i.test(trimmed)) return true
  return /<html[\s>/]/i.test(content) && /<head[\s>/]/i.test(content)
}

export function detectCorruptSourceLines(content: string): { corrupt: boolean; reason?: string } {
  const lines = content.split(/\r?\n/)
  const nonEmpty = lines.filter((l) => l.trim().length > 0)
  if (nonEmpty.length < MIN_ORPHAN_LINES) return { corrupt: false }

  const orphanCount = nonEmpty.filter((l) => ORPHAN_CLOSE_PAREN_LINE.test(l)).length
  if (orphanCount < MIN_ORPHAN_LINES) return { corrupt: false }

  const ratio = orphanCount / nonEmpty.length
  if (ratio < MIN_ORPHAN_RATIO) return { corrupt: false }

  return {
    corrupt: true,
    reason: AGENT_EDIT_CORRUPT_CONTENT_REASON,
  }
}

export function detectIncompleteHtmlDocument(content: string): {
  incomplete: boolean
  reason?: string
} {
  if (!looksLikeHtmlDocument(content)) return { incomplete: false }
  const trimmed = content.trim()
  const structurallyComplete =
    /<html[\s>/]/i.test(trimmed) &&
    (/<\/body>/i.test(trimmed) || /<\/html>/i.test(trimmed))
  if (trimmed.length < MIN_HTML_DOCUMENT_CHARS && !structurallyComplete) {
    return { incomplete: true, reason: AGENT_EDIT_INCOMPLETE_HTML_REASON }
  }
  // e.g. `<!DOCTYPE html> html lang="en"` without `<html`
  if (/\bhtml\s+lang\b/i.test(trimmed) && !/<html[\s>/]/i.test(trimmed)) {
    return { incomplete: true, reason: AGENT_EDIT_INCOMPLETE_HTML_REASON }
  }
  if (!/<\/body>/i.test(trimmed) && !/<\/html>/i.test(trimmed)) {
    return { incomplete: true, reason: AGENT_EDIT_INCOMPLETE_HTML_REASON }
  }
  return { incomplete: false }
}

/** Combined integrity gate for write_file proposal content (after normalize). */
export function assessProposalWriteContent(content: string): {
  ok: boolean
  reason?: string
} {
  const corrupt = detectCorruptSourceLines(content)
  if (corrupt.corrupt) return { ok: false, reason: corrupt.reason }
  const html = detectIncompleteHtmlDocument(content)
  if (html.incomplete) return { ok: false, reason: html.reason }
  return { ok: true }
}
