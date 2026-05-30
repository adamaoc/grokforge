/**
 * Post-edit (post-generation) hooks for proposals.
 *
 * These run *after* the model has generated edit content (e.g. after normalization)
 * but before the proposal is accepted and shown to the user.
 *
 * Goal: Stronger structural + lint-like checks that can be extended over time
 * (simple JS/TS checks today, real linters or type checks later if desired).
 *
 * This is intentionally lightweight and does not require a full workspace or LSP.
 */

import { looksLikeJsxOrTsxSource } from './agent-file-content-normalize'

export interface PostEditCheckResult {
  ok: boolean
  reason?: string
  severity?: 'warning' | 'error'
}

/**
 * Registry of post-generation checks.
 * New checks can be registered here for easy extension.
 */
const postEditChecks: Array<(content: string, resolvedPath: string) => PostEditCheckResult> = []

/**
 * Register a new post-edit check.
 * Checks should be fast and side-effect free.
 */
export function registerPostEditCheck(
  check: (content: string, resolvedPath: string) => PostEditCheckResult
) {
  postEditChecks.push(check)
}

/**
 * Run all registered post-edit checks on generated content.
 * Returns the first hard failure (or warning if configured that way).
 */
export function runPostEditChecks(
  normalizedContent: string,
  resolvedPath: string
): PostEditCheckResult {
  for (const check of postEditChecks) {
    const result = check(normalizedContent, resolvedPath)
    if (!result.ok) {
      return result
    }
  }
  return { ok: true }
}

/** Basic structural check: detect obviously unbalanced braces in JS/TS-like files. */
function basicBraceBalanceCheck(content: string, resolvedPath: string): PostEditCheckResult {
  const isJsLike =
    /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(resolvedPath) ||
    looksLikeJsxOrTsxSource(content)

  if (!isJsLike) return { ok: true }

  let braceDelta = 0
  let parenDelta = 0

  for (const ch of content) {
    if (ch === '{') braceDelta++
    if (ch === '}') braceDelta--
    if (ch === '(') parenDelta++
    if (ch === ')') parenDelta--
  }

  if (braceDelta !== 0 || parenDelta !== 0) {
    return {
      ok: false,
      reason: 'Generated code has unbalanced braces or parentheses. This usually indicates a minified or incorrectly concatenated edit. Re-read the original section and produce clean, properly structured replacements.',
      severity: 'error',
    }
  }

  return { ok: true }
}

// Register built-in checks
registerPostEditCheck(basicBraceBalanceCheck)

// Future extension points (examples for later):
// - registerPostEditCheck(simpleImportConsistencyCheck)
// - registerPostEditCheck(reactHookRulesOfHooksHeuristic)
// - registerPostEditCheck(duplicateIdOrClassInHtml)

/**
 * Convenience: Run post-edit checks and return a rejection reason if any fail hard.
 */
export function getPostEditRejection(
  normalizedContent: string,
  resolvedPath: string
): string | null {
  const result = runPostEditChecks(normalizedContent, resolvedPath)
  if (!result.ok && result.severity !== 'warning') {
    return result.reason || 'Proposal failed post-generation structural checks.'
  }
  return null
}
