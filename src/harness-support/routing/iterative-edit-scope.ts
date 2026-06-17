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

const PERSISTENCE_RE =
  /\b(localStorage|sessionStorage|persist(?:ence)?|storage|save todos|save to disk)\b/i
const BROAD_RE = /\b(refactor|across the app|entire codebase|whole codebase|every file)\b/i
const STRUCTURAL_BEHAVIOR_RE =
  /\b(remove|delete|undo|handler|event listener|on(click|submit|change)|wire\s+up|change(s)?\s+(how|behavior)|modify\s+existing|update\s+(the\s+)?logic|remove\s+button|delete\s+button)\b/i
const LOCALIZED_EDIT_RE =
  /\b(fix typo|typo|css tweak|color tweak|toggle|dark mode|styling tweak)\b/i
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

function preferFullFileForActiveFile(_lineCount?: number): boolean {
  return false
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
      preferFullFileProposal: false,
      rationale: `Persistence feature — localized edit on save/load block in ${target} after one read_file.`,
    }
  }

  if (STRUCTURAL_BEHAVIOR_RE.test(trimmed) && !hasPersistence) {
    const target =
      pathHints.find((p) => /\.js$/i.test(p)) ??
      (activeBase && /\.js$/i.test(activeBase) ? activeBase : null) ??
      pathHints[0] ??
      activeBase ??
      'script.js'
    const preferFull = preferFullFileForActiveFile(input.activeFileLineCount)
    return {
      kind: 'single_file',
      likelyPaths: [target],
      preferFullFileProposal: preferFull,
      rationale: `Behavior/logic change on ${target} — read once, then edit the function/DOM block from rawContent; include related HTML/CSS in the same turn when needed.`,
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
      rationale: `Short ask with active file ${activeBase} — read once, then edit the target section.`,
    }
  }

  if (LOCALIZED_EDIT_RE.test(trimmed)) {
    const target = pathHints[0] ?? activeBase ?? 'the target file'
    return {
      kind: 'single_file',
      likelyPaths: target === 'the target file' ? [] : [target],
      preferFullFileProposal: false,
      rationale: 'Localized styling or typo fix — edit the target section.',
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
    ? `**one** \`propose_file_edits\` with full \`rawContent\` after **one** \`read_file\` on ${pathHint} (fallback when edit matching cannot work)`
    : scope.kind === 'single_file'
      ? `**edit** on ${pathHint} after **one** \`read_file\` — escalate to \`propose_file_edits\` only for new paths or after failed edit matching`
      : `**edit** or focused proposals on at most **2–3** paths (${pathHint})`

  return [
    ITERATIVE_EDIT_SCOPE_MARKER,
    `**Resolved scope:** ${kindLabel} — ${editShape}.`,
    scope.rationale,
    'Do **not** emit a new `gf-plan` — implement this turn with the edit shape above.',
  ]
}
