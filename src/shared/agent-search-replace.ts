import {
  hasDominantLiteralEscapedNewlines,
  unescapeLiteralNewlinesWhenDominant,
} from './agent-file-content-normalize'
import { applyEdits } from './agent-edit-fuzzy'

const NOT_FOUND_MESSAGE_MAX_CHARS = 500

function countFileLinesWithSubstringMatch(oldString: string, fileContent: string): number {
  const fileLines = fileContent.split(/\r?\n/)
  const fragments = oldString
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 4)
  if (fragments.length === 0) return 0
  return fileLines.filter((fileLine) => fragments.some((frag) => fileLine.includes(frag))).length
}

function findClosestLineHint(oldString: string, fileContent: string): string | null {
  const firstOldLine = oldString.split(/\r?\n/).find((l) => l.trim().length > 0)?.trim()
  if (!firstOldLine || firstOldLine.length < 3) return null

  const fileLines = fileContent.split(/\r?\n/)
  let bestPrefixLen = 0
  let bestLine = ''
  for (const line of fileLines) {
    let prefixLen = 0
    const minLen = Math.min(firstOldLine.length, line.length)
    while (prefixLen < minLen && firstOldLine[prefixLen] === line[prefixLen]) {
      prefixLen += 1
    }
    if (prefixLen > bestPrefixLen && prefixLen >= 8) {
      bestPrefixLen = prefixLen
      bestLine = line
    }
  }
  if (bestLine.length === 0) return null
  const preview = bestLine.length > 120 ? `${bestLine.slice(0, 120)}…` : bestLine
  return `Closest line in file: ${JSON.stringify(preview)}`
}

/** User- and model-facing hint when exact match fails (keep under ~500 chars for tool traces). */
export function buildSearchReplaceNotFoundMessage(oldString: string, fileContent?: string): string {
  const trimmed = oldString.replace(/\s+/g, ' ').trim()
  const preview =
    trimmed.length > 72 ? `${trimmed.slice(0, 48)}…${trimmed.slice(-16)}` : trimmed
  const parts = [
    'old_string was not found in the file.',
    'Copy exact text from read_file rawContent (not the line-numbered content field).',
    preview ? `Starts with: ${JSON.stringify(preview)}` : '',
  ]

  if (fileContent) {
    const substringLineCount = countFileLinesWithSubstringMatch(oldString, fileContent)
    parts.push(
      substringLineCount > 0
        ? `0 exact matches; ${substringLineCount} file line(s) contain part of old_string.`
        : '0 exact matches; no file lines contain a recognizable substring from old_string.',
    )
    const closestLine = findClosestLineHint(oldString, fileContent)
    if (closestLine) parts.push(closestLine)

    const lines = oldString.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    if (lines.length >= 2) {
      const eachLineFound = lines.every((l) => fileContent.includes(l))
      if (eachLineFound && !fileContent.includes(oldString)) {
        parts.push(
          'Each line of old_string appears separately in the file; copy one contiguous excerpt from rawContent (do not merge multiple lines).',
        )
      }
    }
    const bulletParts = oldString.match(/-\s+[^-]+/g) ?? []
    if (bulletParts.length >= 2) {
      const bulletsFound = bulletParts.every((b) => fileContent.includes(b.trim()))
      if (bulletsFound && !fileContent.includes(oldString)) {
        parts.push(
          'Replace one bullet line at a time, or use propose_file_edits with the full rawContent file.',
        )
      }
    }
    if (/\s{2}$/m.test(fileContent) && !oldString.includes('  ')) {
      parts.push(
        'This markdown file uses trailing spaces on some lines (line-break syntax). Include them exactly from rawContent.',
      )
    }
    const trimmedOld = stripTrailingEmptyLines(oldString)
    if (trimmedOld !== oldString && fileContent.includes(trimmedOld)) {
      parts.push(
        'old_string had extra trailing blank lines; copy the contiguous excerpt from rawContent without adding blank lines after the last bullet.',
      )
    }
  }

  if (hasDominantLiteralEscapedNewlines(oldString)) {
    parts.push(
      'old_string contains literal \\n characters instead of real line breaks; copy multi-line text from read_file rawContent.',
    )
  }

  const message = parts.filter(Boolean).join(' ')
  if (message.length <= NOT_FOUND_MESSAGE_MAX_CHARS) return message
  return `${message.slice(0, NOT_FOUND_MESSAGE_MAX_CHARS - 1)}…`
}

/** Count non-overlapping occurrences of `needle` in `haystack`. */
export function countSearchReplaceMatches(haystack: string, needle: string): number {
  if (needle.length === 0) return 0
  let count = 0
  let idx = 0
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count += 1
    idx += needle.length
  }
  return count
}

export type SearchReplaceApplyResult =
  | { ok: true; content: string; matchCount: 1 }
  | { ok: false; error: string; matchCount: number }

/** Matches read_file numbered `content` lines (`     1 | text`). */
const READ_FILE_LINE_PREFIX = /^\s{0,6}\d+\s+\|\s/

export function looksLikeReadFileNumberedContent(text: string): boolean {
  const lines = text.split(/\r?\n/)
  const nonEmpty = lines.filter((l) => l.trim().length > 0)
  if (nonEmpty.length === 0) return false
  return nonEmpty.every((l) => READ_FILE_LINE_PREFIX.test(l))
}

export function stripReadFileLineNumberPrefixes(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => (READ_FILE_LINE_PREFIX.test(line) ? line.replace(READ_FILE_LINE_PREFIX, '') : line))
    .join('\n')
}

/** Normalize tool args before matching (line-number prefixes, literal \\n, etc.). */
export function normalizeSearchReplaceStrings(
  oldString: string,
  newString: string,
): { oldString: string; newString: string } {
  let old = oldString
  let neu = newString
  if (looksLikeReadFileNumberedContent(old)) {
    old = stripReadFileLineNumberPrefixes(old)
  }
  if (hasDominantLiteralEscapedNewlines(old)) {
    old = unescapeLiteralNewlinesWhenDominant(old)
    neu = unescapeLiteralNewlinesWhenDominant(neu)
  }
  return { oldString: old, newString: neu }
}

function detectEol(content: string): '\n' | '\r\n' {
  return content.includes('\r\n') ? '\r\n' : '\n'
}

/** Models often add extra trailing blank lines that are not in rawContent. */
export function stripTrailingEmptyLines(text: string): string {
  const lines = text.split(/\r?\n/)
  while (lines.length > 0 && (lines[lines.length - 1] ?? '').trim() === '') {
    lines.pop()
  }
  return lines.join('\n')
}

function charOffsetForLine(lines: string[], lineIndex: number, eol: '\n' | '\r\n'): number {
  if (lineIndex <= 0) return 0
  return lines.slice(0, lineIndex).join(eol).length + eol.length
}

/**
 * Match a multi-line block when the model omitted markdown trailing spaces on each line.
 * Only used when exact match fails and match is unique.
 */
function applySearchReplaceMarkdownTrimEnd(
  content: string,
  oldString: string,
  newString: string,
): SearchReplaceApplyResult | null {
  const oldLines = stripTrailingEmptyLines(oldString).split(/\r?\n/)
  if (oldLines.length < 2) return null
  const fileLines = content.split(/\r?\n/)
  const hitLines: number[] = []
  for (let start = 0; start <= fileLines.length - oldLines.length; start += 1) {
    let matches = true
    for (let j = 0; j < oldLines.length; j += 1) {
      if ((fileLines[start + j] ?? '').trimEnd() !== (oldLines[j] ?? '').trimEnd()) {
        matches = false
        break
      }
    }
    if (matches) hitLines.push(start)
  }
  if (hitLines.length === 0) return null
  if (hitLines.length > 1) {
    return {
      ok: false,
      error: `old_string matched ${hitLines.length} regions after ignoring trailing spaces; narrow old_string.`,
      matchCount: hitLines.length,
    }
  }
  const eol = detectEol(content)
  const start = charOffsetForLine(fileLines, hitLines[0], eol)
  const end = charOffsetForLine(fileLines, hitLines[0] + oldLines.length, eol)
  const matched = content.slice(start, end)
  const matchCount = countSearchReplaceMatches(content, matched)
  if (matchCount !== 1) return null
  return {
    ok: true,
    content: content.slice(0, start) + newString + content.slice(end),
    matchCount: 1,
  }
}

function applySearchReplaceExact(
  content: string,
  oldString: string,
  newString: string,
): SearchReplaceApplyResult {
  const matchCount = countSearchReplaceMatches(content, oldString)
  if (matchCount === 0) {
    return {
      ok: false,
      error: buildSearchReplaceNotFoundMessage(oldString, content),
      matchCount: 0,
    }
  }
  if (matchCount > 1) {
    return {
      ok: false,
      error: `old_string matched ${matchCount} times; it must match exactly once.`,
      matchCount,
    }
  }
  return {
    ok: true,
    content: content.replace(oldString, newString),
    matchCount: 1,
  }
}

/**
 * Apply a single exact `old_string` → `new_string` replacement when `old_string` occurs exactly once.
 * Now uses the stronger fuzzy engine (agent-edit-fuzzy) as a fallback while preserving
 * all the rich human-facing diagnostics from the original exact path.
 */
export function applySearchReplace(
  content: string,
  oldString: string,
  newString: string,
): SearchReplaceApplyResult {
  const normalized = normalizeSearchReplaceStrings(oldString, newString)
  const trimmedOld = stripTrailingEmptyLines(normalized.oldString)
  const trimmedNew = stripTrailingEmptyLines(normalized.newString)

  // Fast path: try the original exact + markdown trim logic first (unchanged behavior for perfect matches)
  const attempts: Array<{ old: string; neu: string }> = [
    { old: normalized.oldString, neu: normalized.newString },
    { old: trimmedOld, neu: trimmedNew },
  ]
  if (trimmedOld !== normalized.oldString) {
    attempts.push({ old: trimmedOld, neu: normalized.newString })
  }
  for (const { old, neu } of attempts) {
    const exact = applySearchReplaceExact(content, old, neu)
    if (exact.ok || exact.matchCount > 0) return exact
  }

  const markdownTrim = applySearchReplaceMarkdownTrimEnd(content, trimmedOld, trimmedNew)
  if (markdownTrim) return markdownTrim

  // New fuzzy path (non-destructive). If fuzzy succeeds we return success.
  const fuzzyResult = applyEdits(content, [{ oldText: trimmedOld, newText: trimmedNew }], 'file')

  if (fuzzyResult.ok) {
    return {
      ok: true,
      content: fuzzyResult.content,
      matchCount: 1,
    }
  }

  // Fuzzy failed — it now includes rich closest-match guidance + suggestedOldText in the error.
  // Prefer this over the pure exact error for much better model recoverability.
  if (fuzzyResult.error && fuzzyResult.error.includes('Closest region in the actual file')) {
    return {
      ok: false,
      error: fuzzyResult.error,
      matchCount: 0,
    }
  }

  // Final fallback to the original exact rich diagnostics
  return applySearchReplaceExact(content, normalized.oldString, normalized.newString)
}
