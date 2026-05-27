/**
 * Iterative Work edit scope heuristics (story 136).
 * Proactive detection: infer single-file vs broad scope from user text + UI context.
 */

function basenameFromPath(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? path
}

/** Stable marker for eval/tests when scope section appears in harness prompt. */
export const ITERATIVE_EDIT_SCOPE_MARKER = '## Iterative edit scope (harness 136)'

/** Mid-turn nudge when model picks wrong edit shape (distinct from 135 thrash marker). */
export const ITERATIVE_EDIT_SCOPE_SHAPE_NUDGE_MARKER = 'Harness: iterative edit scope'

export type IterativeEditScopeKind = 'single_file' | 'few_files' | 'broad'

export type IterativeEditScope = {
  kind: IterativeEditScopeKind
  likelyPaths: readonly string[]
  preferFullFileProposal: boolean
  rationale: string
}

export type ResolveIterativeEditScopeInput = {
  userText: string
  activeFilePath?: string | null
  /** From last successful read_file JSON lineCount when available. */
  activeFileLineCount?: number
}

export type IterativeScopeShapeNudgeKind = 'prefer_propose' | 'too_many_reads'

const PERSISTENCE_RE =
  /\b(localStorage|sessionStorage|persist(?:ence)?|storage|save todos|save to disk)\b/i
const BROAD_RE = /\b(refactor|across the app|entire codebase|whole codebase|every file)\b/i
const LOCALIZED_EDIT_RE =
  /\b(fix typo|typo|add button|css tweak|color tweak|toggle|dark mode|styling tweak)\b/i
const PATH_LIKE_RE =
  /\b(?:[\w.-]+\/)*[\w.-]+\.(?:js|jsx|ts|tsx|html|css|vue|svelte)\b/gi

function uniqueBasenames(paths: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of paths) {
    const base = basenameFromPath(p.trim())
    if (base.length === 0 || seen.has(base)) continue
    seen.add(base)
    out.push(base)
  }
  return out
}

function extractPathHintsFromText(text: string): string[] {
  const matches = text.match(PATH_LIKE_RE) ?? []
  return uniqueBasenames(matches.map((m) => m.replace(/^\/+/, '')))
}

function preferFullFileForActiveFile(lineCount?: number): boolean {
  return lineCount === undefined || lineCount < 200
}

export function resolveIterativeEditScope(input: ResolveIterativeEditScopeInput): IterativeEditScope {
  const trimmed = input.userText.trim()
  const pathHints = extractPathHintsFromText(trimmed)
  const activeBase = input.activeFilePath?.trim()
    ? basenameFromPath(input.activeFilePath.trim())
    : null
  if (activeBase && !pathHints.includes(activeBase)) {
    pathHints.unshift(activeBase)
  }

  if (BROAD_RE.test(trimmed) || pathHints.length >= 3) {
    return {
      kind: 'broad',
      likelyPaths: pathHints.slice(0, 5),
      preferFullFileProposal: false,
      rationale: 'User message suggests multi-file or broad refactor scope.',
    }
  }

  const hasPersistence = PERSISTENCE_RE.test(trimmed)

  if (hasPersistence) {
    const target =
      pathHints.find((p) => p === 'script.js') ??
      pathHints.find((p) => /\.js$/i.test(p)) ??
      (activeBase && /\.js$/i.test(activeBase) ? activeBase : 'script.js')
    return {
      kind: 'single_file',
      likelyPaths: [target],
      preferFullFileProposal: /\.js$/i.test(target),
      rationale: `Persistence feature — prefer one full-file proposal on ${target}.`,
    }
  }

  if (
    activeBase &&
    trimmed.length < 120 &&
    !BROAD_RE.test(trimmed) &&
    pathHints.length <= 1
  ) {
    const preferFull = preferFullFileForActiveFile(input.activeFileLineCount)
    return {
      kind: 'single_file',
      likelyPaths: [activeBase],
      preferFullFileProposal: preferFull,
      rationale: preferFull
        ? `Short ask with active file ${activeBase} — prefer one read then one proposal.`
        : `Active file ${activeBase} is large — localized patches are OK.`,
    }
  }

  if (LOCALIZED_EDIT_RE.test(trimmed)) {
    const target = pathHints[0] ?? activeBase ?? 'the target file'
    return {
      kind: 'single_file',
      likelyPaths: target === 'the target file' ? [] : [target],
      preferFullFileProposal: false,
      rationale: 'Localized UI or typo fix — search_replace on the target section is OK.',
    }
  }

  return {
    kind: 'few_files',
    likelyPaths: pathHints.slice(0, 3),
    preferFullFileProposal: false,
    rationale: 'Typical incremental edit — up to a few paths this turn.',
  }
}

export function buildIterativeEditScopeSections(scope: IterativeEditScope): readonly string[] {
  const pathHint =
    scope.likelyPaths.length > 0
      ? scope.likelyPaths.map((p) => `\`${p}\``).join(', ')
      : 'the target file'
  const kindLabel =
    scope.kind === 'single_file'
      ? 'single-file'
      : scope.kind === 'broad'
        ? 'broad'
        : 'few-files'

  const editShape = scope.preferFullFileProposal
    ? `**one** \`propose_file_edits\` with full \`rawContent\` after **one** \`read_file\` on ${pathHint}`
    : scope.kind === 'single_file'
      ? `localized \`search_replace\` or **one** \`propose_file_edits\` on ${pathHint} after **one** \`read_file\``
      : `focused edits on at most **2–3** paths (${pathHint})`

  return [
    ITERATIVE_EDIT_SCOPE_MARKER,
    `**Resolved scope:** ${kindLabel} — ${editShape}.`,
    scope.rationale,
    'Do **not** emit a new `gf-plan` — implement this turn with the edit shape above.',
  ]
}

export function iterativeScopeShapeNudgeActivityDetail(kind: IterativeScopeShapeNudgeKind): string {
  switch (kind) {
    case 'prefer_propose':
      return 'Single-file scope prefers one full-file propose_file_edits — not search_replace.'
    case 'too_many_reads':
      return 'Single-file scope — stop reading unrelated paths and edit the target file.'
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }
}

export function buildIterativeEditScopeShapeNudge(
  kind: IterativeScopeShapeNudgeKind,
  scope: IterativeEditScope,
): string {
  const pathHint =
    scope.likelyPaths.length > 0 ? `\`${scope.likelyPaths[0]}\`` : 'the scoped file'
  const header = `## ${ITERATIVE_EDIT_SCOPE_SHAPE_NUDGE_MARKER}`
  switch (kind) {
    case 'prefer_propose':
      return [
        header,
        `Resolved scope is **single-file** with **full-file proposal** preferred for ${pathHint}.`,
        'You already `read_file` this path — use **one** `propose_file_edits` with complete `rawContent` instead of `search_replace`.',
        scope.rationale,
      ].join('\n')
    case 'too_many_reads':
      return [
        header,
        `Resolved scope is **single-file** (${pathHint}) but you read **multiple** paths this turn.`,
        `Focus on ${pathHint} only — use **one** \`read_file\` + **one** edit proposal; drop unrelated paths.`,
        scope.rationale,
      ].join('\n')
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }
}

export type PickIterativeScopeShapeNudgeInput = {
  scope: IterativeEditScope
  issued: boolean
  pathsReadThisTurn: ReadonlySet<string>
  lastRoundSearchReplaceOnScopedPath: boolean
  searchReplaceCountByPath: ReadonlyMap<string, number>
  proposeFileEditsAttempted: boolean
  editProposalCreated: boolean
}

function pathMatchesScope(path: string, scope: IterativeEditScope): boolean {
  const base = basenameFromPath(path)
  if (scope.likelyPaths.length === 0) return true
  return scope.likelyPaths.some((hint) => hint === base || path.endsWith(hint))
}

function scopedPathWasRead(input: PickIterativeScopeShapeNudgeInput): boolean {
  if (input.pathsReadThisTurn.size === 0) return false
  if (input.scope.likelyPaths.length === 0) return input.pathsReadThisTurn.size >= 1
  for (const readPath of input.pathsReadThisTurn) {
    if (pathMatchesScope(readPath, input.scope)) return true
  }
  return false
}

function maxSearchReplaceOnScopedPath(
  searchReplaceCountByPath: ReadonlyMap<string, number>,
  scope: IterativeEditScope,
): number {
  let max = 0
  for (const [path, count] of searchReplaceCountByPath) {
    if (pathMatchesScope(path, scope)) max = Math.max(max, count)
  }
  return max
}

/** At most one shape nudge per turn; priority: prefer_propose → too_many_reads. */
export function pickIterativeScopeShapeNudge(
  input: PickIterativeScopeShapeNudgeInput,
): IterativeScopeShapeNudgeKind | null {
  if (input.issued || input.editProposalCreated) return null

  const scopedSrCount = maxSearchReplaceOnScopedPath(input.searchReplaceCountByPath, input.scope)

  if (
    input.scope.preferFullFileProposal &&
    !input.proposeFileEditsAttempted &&
    input.lastRoundSearchReplaceOnScopedPath &&
    scopedSrCount === 1 &&
    scopedPathWasRead(input)
  ) {
    return 'prefer_propose'
  }

  if (
    input.scope.kind === 'single_file' &&
    input.pathsReadThisTurn.size >= 2 &&
    !input.proposeFileEditsAttempted
  ) {
    return 'too_many_reads'
  }

  return null
}
