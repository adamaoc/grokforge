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

/** Apply a single exact `old_string` → `new_string` replacement when `old_string` occurs exactly once. */
export function applySearchReplace(
  content: string,
  oldString: string,
  newString: string,
): SearchReplaceApplyResult {
  const matchCount = countSearchReplaceMatches(content, oldString)
  if (matchCount === 0) {
    return { ok: false, error: 'old_string was not found in the file.', matchCount: 0 }
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
