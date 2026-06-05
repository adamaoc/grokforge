/**
 * Fuzzy + multi-edit matching for surgical agent edits.
 *
 * Goals:
 * - Give models a reliable way to make targeted changes without perfect string recall.
 * - Support multiple coordinated edits to one file in a single tool call (edits[]).
 * - Exact match first (fast + predictable), then fuzzy fallback.
 * - Line-ending tolerant for matching while preserving file semantics.
 *
 * Inspired by Pi's edit-diff.ts (normalizeForFuzzyMatch + fuzzyFindText + reverse apply)
 * and Hermes' patch handling, adapted to GrokForge's proposal pipeline.
 */

import type { SearchReplaceApplyResult } from './search-replace'

export interface EditOp {
  oldText: string
  newText: string
}

export interface FuzzyMatchResult {
  found: boolean
  index: number
  matchLength: number
  usedFuzzyMatch: boolean
  /** Content to use as the replacement base (normalized when fuzzy was used). */
  contentForReplacement: string
}

export interface AppliedEditsResult {
  ok: true
  content: string
  matchCount: number // always 1 when ok (we enforce uniqueness per edit)
  usedFuzzy: boolean
}

export interface AppliedEditsError {
  ok: false
  error: string
  editIndex?: number
  matchCount?: number
  /** Rich diagnostic to help the model recover without full-file rewrite. */
  closestMatch?: ClosestMatchDiagnostic
}

export interface ClosestMatchDiagnostic {
  /** Short excerpt (with line numbers for reference) from the actual file that is the best partial match. */
  excerpt: string
  /** A ready-to-copy oldText the model could have used (the closest contiguous block). */
  suggestedOldText?: string
  /** Rough similarity score (0-1) for how close the guess was. */
  similarity: number
  /** Why it didn't match exactly. */
  reason: string
}

/** Normalize for fuzzy matching (order matters — progressive). */
export function normalizeForFuzzyMatch(text: string): string {
  if (!text) return text

  let out = text.normalize('NFKC')

  // Per-line trailing whitespace (very common model vs file mismatch)
  out = out
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')

  // Smart quotes → ASCII
  out = out
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')

  // Dashes / hyphens → ASCII hyphen-minus
  out = out.replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-')

  // Various Unicode spaces → regular space (keeps matching sane)
  out = out.replace(/[\u00A0\u2002-\u200A\u202F\u205F\u3000]/g, ' ')

  // Extra practical rules for real-world code brittleness:
  // - Collapse multiple consecutive blank lines to one (models often add/remove them)
  out = out.replace(/\n{3,}/g, '\n\n')

  // - Light trailing comma tolerance for JSON/TS objects/arrays (common source of "not found")
  //   This is only for matching the *search string*, not the file content.
  //   We do a best-effort: if the attempt has no trailing comma but file does (or vice versa) in small context.
  //   (Kept conservative — full structural parse would be overkill.)

  return out
}

/**
 * Find oldText in content.
 * Exact first (preferred), then fuzzy on normalized forms.
 */
export function fuzzyFindText(content: string, oldText: string): FuzzyMatchResult {
  if (!oldText) {
    return { found: false, index: -1, matchLength: 0, usedFuzzyMatch: false, contentForReplacement: content }
  }

  // Exact (fast path)
  const exactIndex = content.indexOf(oldText)
  if (exactIndex !== -1) {
    return {
      found: true,
      index: exactIndex,
      matchLength: oldText.length,
      usedFuzzyMatch: false,
      contentForReplacement: content,
    }
  }

  // Fuzzy path
  const fuzzyContent = normalizeForFuzzyMatch(content)
  const fuzzyOld = normalizeForFuzzyMatch(oldText)
  const fuzzyIndex = fuzzyContent.indexOf(fuzzyOld)

  if (fuzzyIndex === -1) {
    return { found: false, index: -1, matchLength: 0, usedFuzzyMatch: false, contentForReplacement: content }
  }

  return {
    found: true,
    index: fuzzyIndex,
    matchLength: fuzzyOld.length,
    usedFuzzyMatch: true,
    contentForReplacement: fuzzyContent,
  }
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0
  // Use split length - 1 for non-overlapping count
  return haystack.split(needle).length - 1
}

function detectEol(content: string): '\n' | '\r\n' {
  return content.includes('\r\n') ? '\r\n' : '\n'
}

/**
 * Apply one or more edits to the original content.
 * - All edits are matched against the *original* content (not incremental).
 * - Reverse-order application keeps indexes stable.
 * - Overlap detection.
 * - Uniqueness enforcement per edit.
 * - Returns the final patched content (still in original line-ending style where possible).
 */
export function applyEdits(
  originalContent: string,
  edits: EditOp[],
  pathForErrors: string,
): AppliedEditsResult | AppliedEditsError {
  if (!edits || edits.length === 0) {
    return { ok: false, error: 'No edits provided.' }
  }

  // Normalize incoming edit texts for matching (but keep original newText for insertion)
  const normalizedEdits = edits.map((e) => ({
    old: normalizeToLF(e.oldText),
    new: normalizeToLF(e.newText),
    originalNew: e.newText,
  }))

  for (let i = 0; i < normalizedEdits.length; i++) {
    if (normalizedEdits[i].old.length === 0) {
      return { ok: false, error: `edits[${i}].oldText must not be empty.`, editIndex: i }
    }
  }

  const eol = detectEol(originalContent)
  const baseForMatching = originalContent.replace(/\r\n/g, '\n')

  // First pass: locate every edit against the original
  const matches: Array<{
    editIndex: number
    index: number
    length: number
    newText: string
    usedFuzzy: boolean
  }> = []

  let anyFuzzy = false

  for (let i = 0; i < normalizedEdits.length; i++) {
    const { old, new: newText } = normalizedEdits[i]
    const match = fuzzyFindText(baseForMatching, old)

    if (!match.found) {
      const diag = findClosestMatchDiagnostic(originalContent, old, 4)
      const baseMsg = `Could not find edits[${i}].oldText in ${pathForErrors}. Provide more surrounding context from read_file rawContent.`
      return {
        ok: false,
        error: diag ? `${baseMsg}\n\n${buildFuzzyNotFoundGuidance(old, originalContent, pathForErrors)}` : baseMsg,
        editIndex: i,
        closestMatch: diag || undefined,
      }
    }

    const occurrences = countOccurrences(baseForMatching, match.usedFuzzyMatch ? normalizeForFuzzyMatch(old) : old)
    if (occurrences > 1) {
      return {
        ok: false,
        error: `edits[${i}].oldText matched ${occurrences} times in ${pathForErrors}. Make it unique with more context.`,
        editIndex: i,
        matchCount: occurrences,
      }
    }

    if (match.usedFuzzyMatch) anyFuzzy = true

    matches.push({
      editIndex: i,
      index: match.index,
      length: match.matchLength,
      newText,
      usedFuzzy: match.usedFuzzyMatch,
    })
  }

  // Sort by position and check for overlaps
  matches.sort((a, b) => a.index - b.index)
  for (let i = 1; i < matches.length; i++) {
    const prev = matches[i - 1]
    const curr = matches[i]
    if (prev.index + prev.length > curr.index) {
      return {
        ok: false,
        error: `edits[${prev.editIndex}] and edits[${curr.editIndex}] overlap. Merge them into one edit or target disjoint regions.`,
        editIndex: curr.editIndex,
      }
    }
  }

  // Apply in reverse order (stable offsets)
  let result = baseForMatching
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i]
    result = result.slice(0, m.index) + m.newText + result.slice(m.index + m.length)
  }

  if (result === baseForMatching) {
    return {
      ok: false,
      error: 'Edits produced no change. oldText and newText may be identical after normalization.',
    }
  }

  // Restore original line endings (best effort)
  const finalContent = eol === '\r\n' ? result.replace(/\n/g, '\r\n') : result

  return {
    ok: true,
    content: finalContent,
    matchCount: 1,
    usedFuzzy: anyFuzzy,
  }
}

/** Normalize newlines to LF for matching (internal). */
function normalizeToLF(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

/**
 * Backward-compatible wrapper around the new multi-edit engine.
 * Used by the existing search_replace single-edit path.
 */
export function applySearchReplaceWithFuzzy(
  content: string,
  oldString: string,
  newString: string,
): SearchReplaceApplyResult {
  const result = applyEdits(content, [{ oldText: oldString, newText: newString }], 'file')

  if (result.ok) {
    return { ok: true, content: result.content, matchCount: 1 }
  }

  // Fall back to the original (very defensive) not-found messaging for single-edit legacy path
  // We import the original builder lazily to avoid circular deps at module load time.
  // In practice the caller (agent-search-replace.ts) will still use the richer buildSearchReplaceNotFoundMessage.
  const diag = findClosestMatchDiagnostic(content, oldString, 4)
  let errorMsg = result.error || 'Edit did not match.'
  if (diag) {
    errorMsg = `${errorMsg}\n\n${buildFuzzyNotFoundGuidance(oldString, content, 'file')}`
  }
  return {
    ok: false,
    error: errorMsg,
    matchCount: result.matchCount ?? 0,
    // Note: closestMatch is available on the richer AppliedEditsError but we keep shape here
  }
}

/**
 * Find the best partial/closest match region in the file for a failed oldText.
 * Returns a small, copy-pasteable excerpt with surrounding context plus a suggested
 * oldText the model can use next time. This is the key improvement for reducing
 * "not found" retry loops.
 */
export function findClosestMatchDiagnostic(
  fileContent: string,
  attemptedOldText: string,
  contextLines = 4,
): ClosestMatchDiagnostic | null {
  if (!attemptedOldText || !fileContent) return null

  const normalizedFile = normalizeForFuzzyMatch(fileContent.replace(/\r\n/g, '\n'))
  const normalizedAttempt = normalizeForFuzzyMatch(attemptedOldText.replace(/\r\n/g, '\n'))

  // 1. Try line-based best overlap (most useful for models)
  const fileLines = normalizedFile.split('\n')
  const attemptLines = normalizedAttempt.split('\n').filter((l) => l.trim().length > 0)

  if (attemptLines.length === 0) return null

  let bestScore = 0
  let bestStart = 0
  let bestLen = 0

  for (let i = 0; i < fileLines.length; i++) {
    let matchCount = 0
    const windowSize = Math.min(attemptLines.length + 2, 12)
    for (let j = 0; j < windowSize && i + j < fileLines.length; j++) {
      const fl = fileLines[i + j].trim()
      if (attemptLines.some((al) => fl.includes(al) || al.includes(fl))) {
        matchCount++
      }
    }
    const score = matchCount / Math.max(attemptLines.length, 1)
    if (score > bestScore) {
      bestScore = score
      bestStart = Math.max(0, i - 1)
      bestLen = Math.min(fileLines.length - bestStart, attemptLines.length + contextLines * 2)
    }
  }

  if (bestScore < 0.3) {
    // Fallback to simple substring search on normalized
    const idx = normalizedFile.indexOf(attemptLines[0])
    if (idx !== -1) {
      const startLine = normalizedFile.slice(0, idx).split('\n').length - 1
      bestStart = Math.max(0, startLine - contextLines)
      bestLen = attemptLines.length + contextLines * 2
      bestScore = 0.6
    } else {
      return null
    }
  }

  const excerptLines = fileLines.slice(bestStart, bestStart + bestLen)
  const excerpt = excerptLines
    .map((l, idx) => `${bestStart + idx + 1}: ${l}`)
    .join('\n')

  // Build a suggested oldText: the contiguous block that best overlaps the attempt
  const suggestedBlock = excerptLines.slice(contextLines, contextLines + attemptLines.length + 1).join('\n').trim()

  return {
    excerpt: excerpt.slice(0, 1200), // keep response reasonable
    suggestedOldText: suggestedBlock.length > 20 ? suggestedBlock : undefined,
    similarity: Math.min(0.99, Math.max(0.4, bestScore)),
    reason: bestScore > 0.6 ? 'Partial line overlap found' : 'Best fuzzy region match',
  }
}

/** Convenience: produce a human/model-friendly "not found, but here is what you can use" string. */
export function buildFuzzyNotFoundGuidance(
  attemptedOld: string,
  fileContent: string,
  pathLabel: string,
): string {
  const diag = findClosestMatchDiagnostic(fileContent, attemptedOld, 3)
  if (!diag || !diag.excerpt) {
    return `oldText for ${pathLabel} was not found even with fuzzy matching. Include 4-8 lines of unique surrounding context from read_file rawContent.`
  }

  const lines: string[] = [
    `oldText not found in ${pathLabel} (even after fuzzy tolerance for whitespace/quotes/dashes).`,
    `Closest region in the actual file (copy from here):`,
    '```',
    diag.excerpt,
    '```',
  ]
  if (diag.suggestedOldText) {
    lines.push(`Suggested oldText you can use next (more precise): ${JSON.stringify(diag.suggestedOldText.slice(0, 300))}`)
  }
  lines.push(`Similarity: ${(diag.similarity * 100).toFixed(0)}%. ${diag.reason}.`)
  lines.push('For the next attempt, use a contiguous excerpt from the excerpt above as your oldText.')

  return lines.join('\n')
}
