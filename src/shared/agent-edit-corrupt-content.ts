import {
  AGENT_EDIT_INCOMPLETE_JSON_MANIFEST_REASON,
  AGENT_EDIT_INVALID_JSON_MANIFEST_REASON,
  assessJsonManifestContent,
} from './agent-bootstrap-manifest'
import {
  hasGluedJavaScriptStatements,
  looksLikeJsxOrTsxSource,
} from './agent-file-content-normalize'

/** Line is only a stray closing paren — common when JSX reflow corrupts HTML/JS. */
const ORPHAN_CLOSE_PAREN_LINE = /^\s*\)[;]?\s*$/

export const AGENT_EDIT_JAMMED_SCRIPT_REASON =
  'Embedded <script> looks crushed (statements glued like }function or });), or code on the same line after //). For an existing file: re-read and use the primary `edit` tool with clean replacement blocks (one statement per line). For new or full-rewrite cases: one propose_file_edits write_file with the complete correct body from rawContent.'

export const AGENT_EDIT_JAMMED_JS_FILE_REASON =
  'JavaScript file looks crushed (statements glued like }function or });), or code on the same line after //). For existing: use `edit` with precise clean newText blocks from rawContent. Only for new paths or explicit full rewrites: propose_file_edits write_file with the **complete** script (one statement per line).'

export const AGENT_EDIT_MALFORMED_JSX_REASON =
  'Proposal JSX/TSX has malformed attributes (escaped className quotes like className=\\"...). Re-read, then use the `edit` tool (preferred for existing) or propose_file_edits with normal UTF-8 quotes and clean one-statement-per-line formatting from rawContent.'

export const AGENT_EDIT_INCOMPLETE_TS_REASON =
  'TypeScript file looks truncated (const/type declaration missing an initializer). Re-read rawContent and use the primary `edit` tool with the missing/complete block, or (for new/large) one propose_file_edits write_file — one statement per line.'

export const AGENT_EDIT_CORRUPT_JS_ORPHAN_PAREN_REASON =
  'JavaScript file looks corrupted (orphan closing parentheses on their own lines). Re-read, then use `edit` (for existing files) with clean contiguous replacement blocks, or one propose_file_edits write_file with the **full** clean script.js body and real line breaks.'

export const AGENT_EDIT_CORRUPT_CONTENT_REASON =
  'Proposal content looks corrupted (orphan closing parentheses). Re-read rawContent and use the primary `edit` tool with precise clean replacements, or a focused clean rewrite via propose_file_edits.'

export const AGENT_EDIT_INCOMPLETE_HTML_REASON =
  'Proposal HTML looks incomplete or malformed (missing tags or truncated). Emit a complete document with <!DOCTYPE html>, <html>, <head>, <body>, and closing tags.'

export const AGENT_EDIT_INCOMPLETE_HTML_TRUNCATED_HINT =
  ' If the model stopped mid-tag, retry with complete file bodies (multi-file proposals are fine when each file is whole).'

export const AGENT_EDIT_CORRUPT_ENCODING_REASON =
  'Proposal content contains corrupted encoding (replacement characters, null bytes, or invalid control characters). Emit clean UTF-8 text with normal quotes — not HTML entities like &#34; or escaped \\u sequences in attributes.'

export const AGENT_EDIT_HTML_ENTITY_ARTIFACT_REASON =
  'Proposal HTML still contains encoded entities or escape artifacts (e.g. lang=&#34;en&#34; or \\u003c). Use real UTF-8 quotes and angle brackets in write_file.content — include `<meta charset="UTF-8">` in new HTML documents.'

const DISALLOWED_CONTROL_CHAR_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/
const HTML_ENTITY_ARTIFACT_RE = /=\s*(?:&#(?:\d+|x[0-9a-f]+);|&(?:quot|apos|lt|gt|amp);)/i
const JSON_UNICODE_ARTIFACT_RE = /\\u[0-9a-fA-F]{4}/

export const AGENT_EDIT_EMPTY_WRITE_REASON =
  'write_file.content is empty. Emit the full runnable file body in propose_file_edits — for script.js include init, state, handlers, and DOM logic; opening the path in the editor before Apply does not create the file on disk.'

/** Used by the early raw-content pre-validation gate (story 146) for propose_file_edits. */
export const AGENT_EDIT_RAW_CRUSHED_PREVALIDATION_REASON =
  'Proposal content looks obviously crushed or minified on first inspection (glued statements, extremely long lines, or very high statement density with almost no line breaks). Re-read the relevant section(s) from `read_file` `rawContent` and emit clean, properly formatted multi-line source with one statement per line.'

const MIN_ORPHAN_LINES = 3
/** Orphan lines must be a meaningful fraction of the file (avoids tiny snippets). */
const MIN_ORPHAN_RATIO = 0.08

/** Minimum size for a greenfield HTML page (not a one-line stub). */
const MIN_HTML_DOCUMENT_CHARS = 120

/** Failed incomplete-HTML proposals on a path before injecting a harness nudge. */
export const INCOMPLETE_HTML_FAILURES_BEFORE_NUDGE = 1

export function recordIncompleteHtmlProposalFailure(
  map: Map<string, number>,
  resolvedPath: string,
): void {
  const key = resolvedPath.replace(/\\/g, '/')
  map.set(key, (map.get(key) ?? 0) + 1)
}

export function shouldInjectIncompleteHtmlProposalNudge(
  map: ReadonlyMap<string, number>,
): boolean {
  for (const count of map.values()) {
    if (count >= INCOMPLETE_HTML_FAILURES_BEFORE_NUDGE) return true
  }
  return false
}

export function pathsAtIncompleteHtmlNudgeThreshold(
  map: ReadonlyMap<string, number>,
): string[] {
  return [...map.entries()]
    .filter(([, count]) => count >= INCOMPLETE_HTML_FAILURES_BEFORE_NUDGE)
    .map(([path]) => path)
}

export function isIncompleteHtmlProposalError(error: string | undefined): boolean {
  if (!error) return false
  return error.includes(AGENT_EDIT_INCOMPLETE_HTML_REASON.slice(0, 40))
}

/** Failed crushed/corrupt `.js` proposals on a path before a follow-up harness nudge. */
export const CRUSHED_JS_FAILURES_BEFORE_NUDGE = 2

export function isJavaScriptProposalPath(path: string): boolean {
  return /\.(m?js|cjs)$/i.test(path.replace(/\\/g, '/'))
}

export function isCrushedJavaScriptProposalError(reason: string | undefined): boolean {
  if (!reason) return false
  if (reason.includes(AGENT_EDIT_JAMMED_JS_FILE_REASON.slice(0, 24))) return true
  if (reason.includes(AGENT_EDIT_CORRUPT_JS_ORPHAN_PAREN_REASON.slice(0, 24))) return true
  return false
}

export function recordCrushedJavaScriptProposalFailure(
  map: Map<string, number>,
  path: string,
): void {
  if (!isJavaScriptProposalPath(path)) return
  const key = path.replace(/\\/g, '/')
  map.set(key, (map.get(key) ?? 0) + 1)
}

export function shouldInjectCrushedJavaScriptProposalNudge(
  map: ReadonlyMap<string, number>,
): boolean {
  for (const [path, count] of map.entries()) {
    if (isJavaScriptProposalPath(path) && count >= CRUSHED_JS_FAILURES_BEFORE_NUDGE) {
      return true
    }
  }
  return false
}

export function pathsAtCrushedJavaScriptNudgeThreshold(
  map: ReadonlyMap<string, number>,
): string[] {
  return [...map.entries()]
    .filter(
      ([path, count]) =>
        isJavaScriptProposalPath(path) && count >= CRUSHED_JS_FAILURES_BEFORE_NUDGE,
    )
    .map(([path]) => path)
}

/** Failed integrity proposals on a path not yet on disk before incremental recovery nudge. */
export const CREATION_INTEGRITY_FAILURES_BEFORE_NUDGE = 2

export function recordCreationIntegrityProposalFailure(
  map: Map<string, number>,
  resolvedPath: string,
  reason: string | undefined,
  fileExistsOnDisk: boolean,
): void {
  if (fileExistsOnDisk) return
  if (!isPartialBatchIntegrityRejection(reason)) return
  const key = resolvedPath.replace(/\\/g, '/')
  map.set(key, (map.get(key) ?? 0) + 1)
}

export function shouldInjectCreationIncrementalRecoveryNudge(
  map: ReadonlyMap<string, number>,
): boolean {
  for (const count of map.values()) {
    if (count >= CREATION_INTEGRITY_FAILURES_BEFORE_NUDGE) return true
  }
  return false
}

export function pathsAtCreationIncrementalRecoveryThreshold(
  map: ReadonlyMap<string, number>,
): string[] {
  return [...map.entries()]
    .filter(([, count]) => count >= CREATION_INTEGRITY_FAILURES_BEFORE_NUDGE)
    .map(([path]) => path)
}

/** Total failed incomplete-HTML proposals in one turn before forcing final answer. */
export const INCOMPLETE_HTML_MAX_FAILURES_PER_TURN_BEFORE_FORCE_FINAL = 4

export function totalIncompleteHtmlFailures(
  failuresByPath: ReadonlyMap<string, number> | undefined,
): number {
  if (!failuresByPath) return 0
  let total = 0
  for (const count of failuresByPath.values()) total += count
  return total
}

export function looksLikeHtmlDocument(content: string): boolean {
  const trimmed = content.trimStart()
  if (/^<!DOCTYPE\s+html/i.test(trimmed)) return true
  if (/^<html[\s>/]/i.test(trimmed)) return true
  return /<html[\s>/]/i.test(content) && /<head[\s>/]/i.test(content)
}

function isJavaScriptFilePath(resolvedPath: string | undefined): boolean {
  if (!resolvedPath) return false
  return /\.(m?js|cjs)$/i.test(resolvedPath.replace(/\\/g, '/'))
}

function isTypeScriptSourcePath(resolvedPath: string | undefined): boolean {
  if (!resolvedPath) return false
  return /\.tsx?$/i.test(resolvedPath.replace(/\\/g, '/'))
}

export function detectCorruptSourceLines(
  content: string,
  options?: { resolvedPath?: string },
): { corrupt: boolean; reason?: string } {
  const lines = content.split(/\r?\n/)
  const nonEmpty = lines.filter((l) => l.trim().length > 0)
  if (nonEmpty.length < MIN_ORPHAN_LINES) return { corrupt: false }

  const orphanCount = nonEmpty.filter((l) => ORPHAN_CLOSE_PAREN_LINE.test(l)).length
  if (orphanCount < MIN_ORPHAN_LINES) return { corrupt: false }

  const ratio = orphanCount / nonEmpty.length
  if (ratio < MIN_ORPHAN_RATIO) return { corrupt: false }

  const reason =
    isJavaScriptFilePath(options?.resolvedPath)
      ? AGENT_EDIT_CORRUPT_JS_ORPHAN_PAREN_REASON
      : AGENT_EDIT_CORRUPT_CONTENT_REASON

  return {
    corrupt: true,
    reason,
  }
}

function balanceDelta(content: string, open: string, close: string): number {
  const esc = (ch: string) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const opens = (content.match(new RegExp(esc(open), 'g')) ?? []).length
  const closes = (content.match(new RegExp(esc(close), 'g')) ?? []).length
  return opens - closes
}

/** HTML shell can look complete while an inline `<script>` was cut off by max_tokens (browser: Unexpected end of input). */
export function detectTruncatedEmbeddedScript(html: string): {
  truncated: boolean
  reason?: string
} {
  if (!looksLikeHtmlDocument(html)) return { truncated: false }
  const scriptOpens = (html.match(/<script\b/gi) ?? []).length
  const scriptCloses = (html.match(/<\/script>/gi) ?? []).length
  if (scriptOpens > scriptCloses) {
    return {
      truncated: true,
      reason:
        AGENT_EDIT_INCOMPLETE_HTML_REASON +
        ' Missing </script> — inline JavaScript was likely cut off before the model finished.',
    }
  }

  const scriptRe = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi
  for (const match of html.matchAll(scriptRe)) {
    const body = (match[2] ?? '').trim()
    if (!body || body.length < 24) continue
    const brace = balanceDelta(body, '{', '}')
    const paren = balanceDelta(body, '(', ')')
    if (brace !== 0 || Math.abs(paren) > 1) {
      return {
        truncated: true,
        reason:
          AGENT_EDIT_INCOMPLETE_HTML_REASON +
          ' Embedded <script> has unbalanced `{`/`(` — HTML tags may close but JS is incomplete. Prefer separate index.html + script.js or a shorter script.',
      }
    }
  }

  return { truncated: false }
}

const HTML_SCRIPT_BLOCK_RE = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi

/** True when JS looks crushed (`renderfunction`, `}););`, or code after `//` on one line). */
export function isJammedJavaScriptSource(source: string): boolean {
  if (!source || source.length < 80) return false
  if (/[a-z0-9](function\s+\w+\s*\()/i.test(source)) return true
  if (/\}\)\s*;\s*\)/.test(source)) return true
  if (/\}\)\s*\/\//.test(source)) return true
  if (/;\}\)\s*\/\//.test(source)) return true
  if (/updateCount\(\);\s*\}\)(?!;)/.test(source)) return true
  if (/[^\n]\/\/[^\n]{4,}?\s+(?:document\.|window\.|function\s|const\s|let\s|var\s)/.test(source)) {
    return true
  }
  if (hasGluedJavaScriptStatements(source)) return true
  return false
}

/**
 * Very lightweight, regex-only pre-validation for raw write_file content.
 * Intended to run extremely early (before any normalization) on propose_file_edits only.
 * Catches the most obvious "the model just dumped minified garbage" cases.
 */
export function detectObviousCrushedRawContent(
  rawContent: string,
  resolvedPath?: string
): { crushed: boolean; reason?: string } {
  if (!rawContent || rawContent.trim().length === 0) {
    return { crushed: false }
  }

  const isJsLike =
    isJavaScriptFilePath(resolvedPath) ||
    isTypeScriptSourcePath(resolvedPath) ||
    looksLikeJsxOrTsxSource(rawContent)

  const lineCount = (rawContent.match(/\n/g) ?? []).length + 1
  const charCount = rawContent.length

  // 1. Extremely long single line (common in fully minified dumps)
  if (charCount > 1800 && lineCount <= 3) {
    return {
      crushed: true,
      reason: AGENT_EDIT_RAW_CRUSHED_PREVALIDATION_REASON,
    }
  }

  // 2. Glued statements (reuse existing cheap detector)
  if (isJsLike && hasGluedJavaScriptStatements(rawContent)) {
    return {
      crushed: true,
      reason: AGENT_EDIT_RAW_CRUSHED_PREVALIDATION_REASON,
    }
  }

  // 3. Very high statement density (many ; { } ) relative to newlines)
  if (isJsLike && charCount > 600) {
    const statementTokens = (rawContent.match(/[;{}]/g) ?? []).length
    const density = statementTokens / Math.max(lineCount, 1)
    // Heuristic: > ~1.8 statement tokens per line on larger content is suspicious
    if (density > 1.8 && lineCount < 40) {
      return {
        crushed: true,
        reason: AGENT_EDIT_RAW_CRUSHED_PREVALIDATION_REASON,
      }
    }
  }

  // 4. Many orphan close parens (reuse existing logic)
  const orphanCheck = detectCorruptSourceLines(rawContent, { resolvedPath })
  if (orphanCheck.corrupt) {
    return {
      crushed: true,
      reason: AGENT_EDIT_RAW_CRUSHED_PREVALIDATION_REASON,
    }
  }

  // 5. Basic brace/paren imbalance on JS-like files (very cheap, not a full parser)
  if (isJsLike && charCount > 400) {
    const braceDelta = balanceDelta(rawContent, '{', '}')
    const parenDelta = balanceDelta(rawContent, '(', ')')
    // Large imbalance relative to size is a strong smell of minified or broken output
    if (Math.abs(braceDelta) > 12 || Math.abs(parenDelta) > 18) {
      return {
        crushed: true,
        reason: AGENT_EDIT_RAW_CRUSHED_PREVALIDATION_REASON,
      }
    }
  }

  // 6. Code after // comment on the same line (very common crush pattern)
  if (isJsLike) {
    if (/[^\n]\/\/[^\n]{3,}?[a-zA-Z0-9_({]/.test(rawContent)) {
      return {
        crushed: true,
        reason: AGENT_EDIT_RAW_CRUSHED_PREVALIDATION_REASON,
      }
    }
  }

  return { crushed: false }
}

export function detectIncompleteTypeScriptSource(
  content: string,
  resolvedPath?: string,
): { incomplete: boolean; reason?: string } {
  const path = resolvedPath?.replace(/\\/g, '/') ?? ''
  if (!isTypeScriptSourcePath(resolvedPath) && !/\.tsx?$/i.test(path)) {
    return { incomplete: false }
  }
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim()
    if (/^const\s+\w+\s*:\s*\{?\s*$/.test(t)) {
      return { incomplete: true, reason: AGENT_EDIT_INCOMPLETE_TS_REASON }
    }
    if (/^const\s+\w+\s*:\s*[A-Za-z_[\]<>, |]+\s*$/.test(t) && !t.includes('=')) {
      return { incomplete: true, reason: AGENT_EDIT_INCOMPLETE_TS_REASON }
    }
  }
  return { incomplete: false }
}

export function detectMalformedJsxAttributes(
  content: string,
  resolvedPath?: string,
): { malformed: boolean; reason?: string } {
  if (!content.trim()) return { malformed: false }
  const tsx =
    isTypeScriptSourcePath(resolvedPath) || looksLikeJsxOrTsxSource(content)
  if (!tsx) return { malformed: false }
  if (/className\s*=\s*\\["'{]/.test(content)) {
    return { malformed: true, reason: AGENT_EDIT_MALFORMED_JSX_REASON }
  }
  if (/className\s*=\s*"[^"]*\\"/.test(content)) {
    return { malformed: true, reason: AGENT_EDIT_MALFORMED_JSX_REASON }
  }
  return { malformed: false }
}

export function detectJammedEmbeddedScript(html: string): {
  jammed: boolean
  reason?: string
} {
  if (!looksLikeHtmlDocument(html)) return { jammed: false }
  for (const match of html.matchAll(HTML_SCRIPT_BLOCK_RE)) {
    const body = (match[2] ?? '').trim()
    if (body.length >= 80 && isJammedJavaScriptSource(body)) {
      return { jammed: true, reason: AGENT_EDIT_JAMMED_SCRIPT_REASON }
    }
  }
  return { jammed: false }
}

export function detectJammedJavaScriptFile(
  content: string,
  resolvedPath?: string,
): { jammed: boolean; reason?: string } {
  const path = resolvedPath?.replace(/\\/g, '/') ?? ''
  const isJsOrTs =
    isJavaScriptFilePath(resolvedPath) || isTypeScriptSourcePath(resolvedPath)
  if (!isJsOrTs) return { jammed: false }
  if (content.length < 40) return { jammed: false }
  if (hasGluedJavaScriptStatements(content)) {
    const reason = /\.tsx?$/i.test(path)
      ? AGENT_EDIT_JAMMED_JS_FILE_REASON.replace('JavaScript file', 'TypeScript file')
      : AGENT_EDIT_JAMMED_JS_FILE_REASON
    return { jammed: true, reason }
  }
  if (content.length >= 80 && isJammedJavaScriptSource(content)) {
    return { jammed: true, reason: AGENT_EDIT_JAMMED_JS_FILE_REASON }
  }
  return { jammed: false }
}

export function isPartialBatchIntegrityRejection(reason: string | undefined): boolean {
  if (!reason) return false
  if (reason.includes(AGENT_EDIT_INCOMPLETE_HTML_REASON.slice(0, 40))) return true
  if (reason.includes(AGENT_EDIT_JAMMED_SCRIPT_REASON.slice(0, 24))) return true
  if (reason.includes(AGENT_EDIT_JAMMED_JS_FILE_REASON.slice(0, 24))) return true
  if (reason.includes(AGENT_EDIT_CORRUPT_JS_ORPHAN_PAREN_REASON.slice(0, 24))) return true
  if (reason.includes(AGENT_EDIT_CORRUPT_CONTENT_REASON.slice(0, 24))) return true
  if (reason.includes(AGENT_EDIT_CORRUPT_ENCODING_REASON.slice(0, 24))) return true
  if (reason.includes(AGENT_EDIT_HTML_ENTITY_ARTIFACT_REASON.slice(0, 24))) return true
  if (reason.includes(AGENT_EDIT_MALFORMED_JSX_REASON.slice(0, 24))) return true
  if (reason.includes(AGENT_EDIT_EMPTY_WRITE_REASON.slice(0, 20))) return true
  if (reason.includes(AGENT_EDIT_INVALID_JSON_MANIFEST_REASON.slice(0, 24))) return true
  if (reason.includes(AGENT_EDIT_INCOMPLETE_JSON_MANIFEST_REASON.slice(0, 24))) return true
  return false
}

function isHtmlLikeContent(content: string, resolvedPath?: string): boolean {
  return looksLikeHtmlDocument(content) || /\.html?$/i.test(resolvedPath?.replace(/\\/g, '/') ?? '')
}

/** Detect unrecoverable encoding corruption after normalize passes. */
export function detectCorruptEncoding(content: string): {
  corrupt: boolean
  reason?: string
} {
  if (!content) return { corrupt: false }
  if (content.includes('\uFFFD')) {
    return { corrupt: true, reason: AGENT_EDIT_CORRUPT_ENCODING_REASON }
  }
  if (content.includes('\u0000')) {
    return { corrupt: true, reason: AGENT_EDIT_CORRUPT_ENCODING_REASON }
  }
  if (DISALLOWED_CONTROL_CHAR_RE.test(content)) {
    return { corrupt: true, reason: AGENT_EDIT_CORRUPT_ENCODING_REASON }
  }
  return { corrupt: false }
}

/** HTML still has entity/escape artifacts that render as garbage in browsers. */
export function detectHtmlEncodingArtifacts(
  content: string,
  resolvedPath?: string,
): { artifact: boolean; reason?: string } {
  if (!isHtmlLikeContent(content, resolvedPath)) return { artifact: false }
  if (HTML_ENTITY_ARTIFACT_RE.test(content)) {
    return { artifact: true, reason: AGENT_EDIT_HTML_ENTITY_ARTIFACT_REASON }
  }
  if (JSON_UNICODE_ARTIFACT_RE.test(content)) {
    return { artifact: true, reason: AGENT_EDIT_HTML_ENTITY_ARTIFACT_REASON }
  }
  if (/\bhtml\s+lang\s*=\s*&#/i.test(content)) {
    return { artifact: true, reason: AGENT_EDIT_HTML_ENTITY_ARTIFACT_REASON }
  }
  return { artifact: false }
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
    const reason =
      trimmed.length >= 80 && /<html[\s>/]/i.test(trimmed)
        ? AGENT_EDIT_INCOMPLETE_HTML_REASON + AGENT_EDIT_INCOMPLETE_HTML_TRUNCATED_HINT
        : AGENT_EDIT_INCOMPLETE_HTML_REASON
    return { incomplete: true, reason }
  }
  return { incomplete: false }
}

/** Combined integrity gate for write_file proposal content (after normalize). */
export function assessProposalWriteContent(
  content: string,
  options?: { resolvedPath?: string; isNewFile?: boolean },
): {
  ok: boolean
  reason?: string
} {
  if (!content.trim()) {
    return { ok: false, reason: AGENT_EDIT_EMPTY_WRITE_REASON }
  }
  const manifest = assessJsonManifestContent(content, {
    resolvedPath: options?.resolvedPath,
    isNewFile: options?.isNewFile,
  })
  if (!manifest.ok) return { ok: false, reason: manifest.reason }
  const encoding = detectCorruptEncoding(content)
  if (encoding.corrupt) return { ok: false, reason: encoding.reason }
  const htmlArtifacts = detectHtmlEncodingArtifacts(content, options?.resolvedPath)
  if (htmlArtifacts.artifact) return { ok: false, reason: htmlArtifacts.reason }
  const corrupt = detectCorruptSourceLines(content, options)
  if (corrupt.corrupt) return { ok: false, reason: corrupt.reason }
  const html = detectIncompleteHtmlDocument(content)
  if (html.incomplete) return { ok: false, reason: html.reason }
  const script = detectTruncatedEmbeddedScript(content)
  if (script.truncated) return { ok: false, reason: script.reason }
  const jammedHtml = detectJammedEmbeddedScript(content)
  if (jammedHtml.jammed) return { ok: false, reason: jammedHtml.reason }
  const jammedJs = detectJammedJavaScriptFile(content, options?.resolvedPath)
  if (jammedJs.jammed) return { ok: false, reason: jammedJs.reason }
  const incompleteTs = detectIncompleteTypeScriptSource(content, options?.resolvedPath)
  if (incompleteTs.incomplete) return { ok: false, reason: incompleteTs.reason }
  const jsxArtifacts = detectMalformedJsxAttributes(content, options?.resolvedPath)
  if (jsxArtifacts.malformed) return { ok: false, reason: jsxArtifacts.reason }
  return { ok: true }
}
