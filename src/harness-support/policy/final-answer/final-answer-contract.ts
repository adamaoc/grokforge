import type { AgentProfileId } from '../../profiles/agent-profile'
import type { HarnessProfileKey } from '../../profiles/contracts/harness-profile-key'
import { EXECUTOR_FROM_PLAN_FINAL_ANSWER_POINTER } from '../../profiles/harness-profile'
import type {
  ScaffoldConflictKind,
  ScaffoldStrategy,
} from '../../routing/scaffold-strategy'
import { SCAFFOLD_STRATEGY_NUDGE_MARKER } from '../../routing/scaffold-strategy'
import { POST_SCAFFOLD_VERIFICATION_HONESTY_MARKER, POST_SCAFFOLD_VERIFICATION_MARKER } from '../../tools/helpers/scaffold-command'
import { buildGfPlanFinalAnswerContract } from '../../plan/contracts/gf-plan-contract'
import { isPartialBatchIntegrityRejection, totalIncompleteHtmlFailures } from '../../diff/edit-corrupt-content'
import { totalSearchReplaceFailures } from '../edit/cascade-guard'
import { basenameForProposalRejectionPath } from '../../../shared/legacy/agent-proposal-rejection-loop'
import { getCodeQualityContractBlock } from '../quality/code-quality-contract'

export const EDIT_INTENT_RE =
  /\b(add|apply|build|change|create|delete|edit|fix|implement|make|move|patch|refactor|remove|rename|replace|update|write)\b/i

/** Marker in harness nudge when a fast-mode edit turn sampled zero tools (eval/tests). */
export const EDIT_INTENT_TOOL_NUDGE_MARKER = 'Harness: edit tools required'

/** Marker when search_replace failed repeatedly and the harness steers recovery (eval/tests). */
export const EDIT_SEARCH_REPLACE_ESCALATION_MARKER = 'Harness: search_replace escalation'

/** Sub-marker for iterative Work stricter S&R escalation (story 138). */
export const EDIT_ITERATIVE_SEARCH_REPLACE_ESCALATION_MARKER =
  'Harness: iterative search_replace escalation 138'

/** Marker when propose_file_edits HTML was rejected as incomplete (eval/tests). */
export const EDIT_INCOMPLETE_HTML_NUDGE_MARKER = 'Harness: incomplete HTML proposal'

/** Marker when a multi-file proposal accepted some paths and rejected others (story 124). */
export const EDIT_PARTIAL_BATCH_NUDGE_MARKER = 'Harness: partial batch proposal recovery'

/** Marker when `.js` proposals failed crushed/corrupt validation twice (follow-up nudge). */
export const EDIT_CRUSHED_JS_NUDGE_MARKER = 'Harness: crushed JavaScript proposal'

/** Marker when repeated integrity failures on a path not yet on disk — switch to incremental build-up. */
export const EDIT_CREATION_INCREMENTAL_RECOVERY_MARKER =
  'Harness: creation path incremental recovery'

/** Sub-marker when single-file HTML intent uses shell-first then `edit` (story 162). */
export const EDIT_SINGLE_FILE_HTML_CREATION_RECOVERY_MARKER =
  'Harness: single-file HTML creation recovery 162'

/** Marker in final answer when creation incremental recovery was required but unmet (story 153). */
export const CREATION_INCREMENTAL_RECOVERY_HONESTY_MARKER =
  'Harness: creation incremental recovery honesty'

/** Marker in final answer when rejected paths remain in the pending proposal (story 124). */
export const PARTIAL_BATCH_PROPOSAL_HONESTY_MARKER = 'Harness: partial batch proposal honesty'

/** Marker when multiple edit tools merged into one diff review (story 119). */
export const MERGED_EDIT_PROPOSAL_HONESTY_MARKER = 'Harness: merged edit proposal honesty'

/** Marker when plan verify/install intent skipped run_command on first tool sample (story 126). */
export const PLAN_VERIFY_COMMAND_NUDGE_MARKER = 'Harness: plan verify command required'

/** Marker when discovery read-only rounds exceed budget without an edit proposal (story 129). */
export const DISCOVERY_SATURATION_NUDGE_MARKER = 'Harness: discovery saturation'

export { SCAFFOLD_STRATEGY_NUDGE_MARKER } from '../../routing/scaffold-strategy'

/** Marker in final answer when scaffold strategy conflict nudge fired (story 128). */
export const SCAFFOLD_STRATEGY_HONESTY_MARKER = 'Harness: scaffold strategy honesty'

/** Marker in final answer when command tools failed or were rejected (story 126). */
export const COMMAND_TOOLS_FAILED_HONESTY_MARKER = 'Harness: command tools failed honesty'

/** Marker when edit tools failed with no accepted proposal — final answer honesty (story 152). */
export const FAILED_EDIT_FINAL_ANSWER_HONESTY_MARKER = 'Harness: failed edit final answer honesty'

/** Max lines for an optional unapplied reference snippet in a failed-edit final answer (story 152). */
export const FAILED_EDIT_FINAL_ANSWER_MAX_REFERENCE_LINES = 30

/** Max UTF-8 chars for an optional unapplied reference snippet in a failed-edit final answer (story 152). */
export const FAILED_EDIT_FINAL_ANSWER_MAX_REFERENCE_CHARS = 2000

export type EditAttemptOutcome = 'none' | 'not_attempted' | 'failed'

export type EditFinalAnswerHonestyContext = {
  editAttemptOutcome: EditAttemptOutcome
  failedEditPaths: readonly string[]
  /** True when edit was attempted and tools failed with no accepted proposal (story 152). */
  editToolsFailed: boolean
}

export type ResolveEditFinalAnswerHonestyContextInput = {
  userText: string
  editProposalCreated: boolean
  executeFromApprovedPlan?: boolean
  searchReplaceFailuresByPath: ReadonlyMap<string, number>
  incompleteHtmlFailuresByPath: ReadonlyMap<string, number>
  proposalRejectionsByPath: ReadonlyMap<string, number>
}

function collectFailedEditPathLabels(input: {
  searchReplaceFailuresByPath: ReadonlyMap<string, number>
  incompleteHtmlFailuresByPath: ReadonlyMap<string, number>
  proposalRejectionsByPath: ReadonlyMap<string, number>
}): string[] {
  const labels = new Set<string>()
  const add = (resolvedPath: string) => {
    const label = basenameForProposalRejectionPath(resolvedPath)
    if (label) labels.add(label)
  }
  for (const [path, count] of input.searchReplaceFailuresByPath) {
    if (count > 0) add(path)
  }
  for (const [path, count] of input.incompleteHtmlFailuresByPath) {
    if (count > 0) add(path)
  }
  for (const [path, count] of input.proposalRejectionsByPath) {
    if (count > 0) add(path)
  }
  return [...labels]
}

function hasAnyEditToolFailure(input: {
  searchReplaceFailuresByPath: ReadonlyMap<string, number>
  incompleteHtmlFailuresByPath: ReadonlyMap<string, number>
  proposalRejectionsByPath: ReadonlyMap<string, number>
}): boolean {
  if (totalSearchReplaceFailures(input.searchReplaceFailuresByPath) > 0) return true
  if (totalIncompleteHtmlFailures(input.incompleteHtmlFailuresByPath) > 0) return true
  for (const count of input.proposalRejectionsByPath.values()) {
    if (count > 0) return true
  }
  return false
}

/** Single source of truth for failed-edit final-answer contract inputs (story 152). */
export function resolveEditFinalAnswerHonestyContext(
  input: ResolveEditFinalAnswerHonestyContextInput,
): EditFinalAnswerHonestyContext {
  if (input.editProposalCreated) {
    return { editAttemptOutcome: 'none', failedEditPaths: [], editToolsFailed: false }
  }
  const editIntent = input.executeFromApprovedPlan === true || isLikelyEditIntent(input.userText)
  if (!editIntent) {
    return { editAttemptOutcome: 'none', failedEditPaths: [], editToolsFailed: false }
  }
  const failureMaps = {
    searchReplaceFailuresByPath: input.searchReplaceFailuresByPath,
    incompleteHtmlFailuresByPath: input.incompleteHtmlFailuresByPath,
    proposalRejectionsByPath: input.proposalRejectionsByPath,
  }
  if (!hasAnyEditToolFailure(failureMaps)) {
    return { editAttemptOutcome: 'not_attempted', failedEditPaths: [], editToolsFailed: false }
  }
  return {
    editAttemptOutcome: 'failed',
    failedEditPaths: collectFailedEditPathLabels(failureMaps),
    editToolsFailed: true,
  }
}

export function isLikelyEditIntent(userText: string): boolean {
  return EDIT_INTENT_RE.test(userText)
}

function basenameForEscalationPath(pathKey: string): string {
  const parts = pathKey.split(/[/\\]/).filter(Boolean)
  return parts[parts.length - 1] ?? pathKey
}

/** User message injected once after repeated search_replace failures on a path. */
export function buildSearchReplaceEscalationNudge(
  paths: readonly string[],
  options?: { brief?: boolean; iterativeWorkEdit?: boolean },
): string {
  const labels = paths.map(basenameForEscalationPath).filter(Boolean)
  const pathLine =
    labels.length > 0
      ? `Affected file(s): ${labels.join(', ')}.`
      : 'One or more files had repeated edit tool failures.'
  const hasHtml = paths.some((p) => /\.html?$/i.test(p.replace(/\\/g, '/')))
  const hasJs = paths.some((p) => /\.jsx?$/i.test(p.replace(/\\/g, '/')))
  const iterative = options?.iterativeWorkEdit === true

  if (iterative) {
    const jsLine = hasJs
      ? 'After repeated failures on this path with the `edit` tool (or legacy search_replace): re-read the exact section(s) via `read_file`, then retry with precise `edit` { edits: [{ oldText, newText }, ...] } using sufficient unique context from `rawContent`. Only if the scope is truly a large refactor, escalate to one clean `propose_file_edits` write_file with the full relevant content.'
      : 'After repeated `edit` / search_replace failures: re-read `rawContent`, retry with the primary `edit` tool using better excerpts, or (last resort) one focused `propose_file_edits`.'
    const preserveLine =
      hasJs || hasHtml
        ? 'Preserve unchanged functions and markup; GrokForge blocks destructive shrink (**115**) — send clean, complete, readable code (one statement per line).'
        : 'Send clean complete code from `rawContent` (not a stub) — **115** shrink guard applies.'
    return [
      `## ${EDIT_SEARCH_REPLACE_ESCALATION_MARKER}`,
      `## ${EDIT_ITERATIVE_SEARCH_REPLACE_ESCALATION_MARKER}`,
      pathLine,
      'Use the rich "not found" diagnostics + suggested excerpts from the last failure to construct accurate oldText values.',
      jsLine,
      preserveLine,
      getCodeQualityContractBlock(),
      'Prefer the dedicated `edit` tool over legacy search_replace for recovery attempts.',
      'Do not tell the user the file was updated until an edit tool returns `ok: true` in this turn.',
    ]
      .filter(Boolean)
      .join('\n')
  }

  if (options?.brief) {
    const htmlLine = hasHtml
      ? 'For HTML with inline `<script>`, prefer the `edit` tool with clean replacement blocks from `rawContent`. Fall back to one full-file `propose_file_edits` only if needed.'
      : ''
    return [
      `## ${EDIT_SEARCH_REPLACE_ESCALATION_MARKER}`,
      pathLine,
      'Re-read the file, use precise `edit` {edits[]} with the diagnostics provided, or one clean `propose_file_edits` write_file from `rawContent`.',
      htmlLine,
      'Do not tell the user the file was updated until an edit tool returns `ok: true` in this turn.',
    ]
      .filter(Boolean)
      .join('\n')
  }
  const htmlLines = hasHtml
    ? [
        'For **index.html** (or HTML with inline `<script>`): do **not** guess small patches. Re-read, then use the primary `edit` tool with one or more clean, properly-formatted replacement blocks (one statement per line). Only if impractical, use one `propose_file_edits` `write_file` with the **entire** correct file from `rawContent`.',
      ]
    : []
  return [
    `## ${EDIT_SEARCH_REPLACE_ESCALATION_MARKER}`,
    pathLine,
    'Do **not** retry with guessed fragments.',
    'Call `read_file` (use startLine/maxLines for the relevant region on large files) and construct precise oldText values for the **`edit`** tool (the primary modification primitive). The previous failure response includes closest-match diagnostics and suggestedOldText excerpts — use them.',
    'Recommended next action: Issue **one** `edit` call with accurate replacements (or a minimal `propose_file_edits` only if the requested change is large/structural). Do not rewrite unrelated sections.',
    ...htmlLines,
    getCodeQualityContractBlock(),
    'The result must be readable professional source — no minified or glued output.',
    'Do not tell the user the file was updated until an edit tool returns `ok: true` in this turn.',
  ].join('\n')
}

/** User message injected once after repeated incomplete HTML write_file proposals. */
export function buildIncompleteHtmlProposalNudge(paths: readonly string[]): string {
  const labels = paths.map(basenameForEscalationPath).filter(Boolean)
  const pathLine =
    labels.length > 0
      ? `Affected file(s): ${labels.join(', ')}.`
      : 'One or more new HTML files had incomplete proposals.'
  return [
    `## ${EDIT_INCOMPLETE_HTML_NUDGE_MARKER}`,
    pathLine,
    'GrokForge rejected the proposal because `write_file.content` was truncated or missing closing tags.',
    'Retry with **complete** `write_file.content` for each path — especially HTML with `<!DOCTYPE html>`, `<html>`, `<head>`, `<body>`, and **`</body></html>`** closing tags.',
    '- Use real line breaks in HTML — not a one-line stub or opener like `<!DOCTYPE html> html lang="en"`.',
    '- Use normal UTF-8 quotes in HTML attributes (`lang="en"`) — not `&#34;`, `&quot;`, or `\\u003c` escape sequences.',
    '- Include `<meta charset="UTF-8">` in new HTML documents.',
    '- You may include multiple files in one `propose_file_edits` if each body is complete.',
    'Do not tell the user the file was created until an edit tool succeeds in this turn.',
  ].join('\n')
}

export type PartialBatchRejectedOp = {
  path?: string
  reason?: string
}

export function shouldInjectPartialBatchProposalNudge(input: {
  acceptedCount: number
  rejected: readonly PartialBatchRejectedOp[]
  executeFromApprovedPlan?: boolean
}): boolean {
  if (input.acceptedCount < 1 || input.rejected.length < 1) return false
  if (input.executeFromApprovedPlan) return true
  return input.rejected.some((r) => isPartialBatchIntegrityRejection(r.reason))
}

/** User message injected once when a multi-file proposal accepted some paths and rejected others. */
export function buildPartialBatchProposalNudge(
  rejected: readonly PartialBatchRejectedOp[],
  acceptedCount: number,
): string {
  const labels = rejected
    .map((r) => (r.path ? basenameForEscalationPath(r.path) : ''))
    .filter(Boolean)
  const pathLine =
    labels.length > 0
      ? `Rejected path(s): ${labels.join(', ')}.`
      : 'One or more paths in the last proposal were rejected.'
  const reasonLines = rejected.slice(0, 4).map((r) => {
    const base = r.path ? basenameForEscalationPath(r.path) : 'file'
    const reason = (r.reason ?? 'validation failed').slice(0, 160)
    return `- **${base}:** ${reason}`
  })
  const hasJs = rejected.some((r) => /\.(m?js|cjs)$/i.test((r.path ?? '').replace(/\\/g, '/')))
  const hasHtml = rejected.some((r) => /\.html?$/i.test((r.path ?? '').replace(/\\/g, '/')))
  const hasPackageJson = rejected.some((r) =>
    /package\.json$/i.test((r.path ?? '').replace(/\\/g, '/')),
  )
  const hasTsx = rejected.some((r) => /\.tsx$/i.test((r.path ?? '').replace(/\\/g, '/')))
  const jsHint = hasJs
    ? [
        'For **script.js** (or other `.js`): `write_file.content` must be **multi-line readable source** in the tool call — GrokForge validates before review; crushed one-liners are rejected.',
        '**Never empty or placeholder-only:** include runnable init, state, DOM/update helpers, and event listeners the app needs.',
        '**Layout:** one statement per line; `{` / `}` on their own lines for blocks; each `//` comment on its own line with **no code after `//`**; never `}function` / `}););` glue; never a line that is only `)` or `};`.',
        'Prefer external `<script src="script.js">` in HTML over a large inline `<script>` block.',
      ]
    : []
  const htmlHint = hasHtml
    ? [
        'For **index.html**: use clean UTF-8 with real quotes (`lang="en"`) — not `&#34;`, `&quot;`, or `\\u` escapes. Include `<meta charset="UTF-8">`.',
      ]
    : []
  const packageJsonHint = hasPackageJson
    ? [
        'For **package.json**: emit **valid JSON** with double-quoted keys (`{"name":"app","private":true}`). Minified one-line JSON is fine if it parses. If hand-rolling keeps failing, use **`run_command`** for `npm create` / `npm init` instead.',
      ]
    : []
  const tsxHint = hasTsx
    ? [
        'For **App.tsx** (or other TSX): one `propose_file_edits` with the **complete** component from `read_file` `rawContent` — real line breaks, no crushed one-liners, no runs of orphan `)` lines. Apply CSS together only after TSX validates.',
      ]
    : []
  return [
    `## ${EDIT_PARTIAL_BATCH_NUDGE_MARKER}`,
    pathLine,
    `${acceptedCount} file(s) are already in the pending diff review — do **not** resubmit those paths unless you need to fix them.`,
    ...reasonLines,
    ...jsHint,
    ...htmlHint,
    ...packageJsonHint,
    ...tsxHint,
    buildHarnessEditRecoveryBrief('partial_batch'),
  ].join('\n')
}

/** User message after repeated crushed/corrupt `.js` proposal failures (second attempt). */
export function buildCrushedJavaScriptProposalNudge(paths: readonly string[]): string {
  const labels = paths.map(basenameForEscalationPath).filter(Boolean)
  const pathLine =
    labels.length > 0
      ? `Affected file(s): ${labels.join(', ')}.`
      : 'JavaScript proposal(s) failed validation twice.'
  return [
    `## ${EDIT_CRUSHED_JS_NUDGE_MARKER}`,
    pathLine,
    'Previous proposals were **rejected** for crushed/minified layout — do **not** resubmit glued or one-line code. GrokForge now applies much stricter formatting rules on medium+ files.',
    'Recommended next action for existing .js: Re-read the relevant section from `rawContent`, then use the primary **`edit`** tool with one or more clean, properly-formatted replacement blocks (one statement per line, no glued tokens).',
    'Only escalate to a full `propose_file_edits` write_file if the user explicitly requested a rewrite or the scope is large/structural.',
    'Example clean shape (adapt to your logic):',
    '```javascript',
    'const STORAGE_KEY = "app-state";',
    'let items = [];',
    '',
    'function loadItems() {',
    '  return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");',
    '}',
    '',
    'function saveItems() {',
    '  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));',
    '}',
    '```',
    'Never multiple statements on one line. Do not tell the user the script was written until an edit tool succeeds.',
  ].join('\n')
}

/** Marker when repeated same-path proposal rejections force final answer (story 151). */
export const PROPOSAL_REJECTION_FORCE_FINAL_MARKER = 'Harness: repeated proposal rejections'

/** User message when the harness stops the turn after repeated proposal rejections on the same path. */
export function buildProposalRejectionForceFinalHint(paths: readonly string[]): string {
  const labels = paths.map((p) => p.split(/[/\\]/).filter(Boolean).pop() ?? p).filter(Boolean)
  const pathLine =
    labels.length > 0
      ? `Affected path(s): ${labels.join(', ')}.`
      : 'Repeated edit proposal validation failures on the same path(s).'
  return [
    `## ${PROPOSAL_REJECTION_FORCE_FINAL_MARKER}`,
    pathLine,
    'GrokForge rejected multiple `propose_file_edits` attempts on the same path and **no reviewable edit proposal was created**.',
    'Provide a **short honest summary** — do **not** claim any file was created, updated, saved, or written on disk.',
    'Do **not** paste a full replacement file in the final answer; tell the user what failed and what to retry manually or in a new turn.',
  ].join('\n')
}

export type BuildCreationIncrementalRecoveryNudgeOptions = {
  /** Story 162: explicit single-file HTML app — shell without script, then `edit`. */
  singleFileHtmlIntent?: boolean
}

/** User message after repeated integrity failures on paths not yet on disk. */
export function buildCreationIncrementalRecoveryNudge(
  paths: readonly string[],
  options?: BuildCreationIncrementalRecoveryNudgeOptions,
): string {
  const labels = paths.map(basenameForEscalationPath).filter(Boolean)
  const pathLine =
    labels.length > 0
      ? `Affected new path(s): ${labels.join(', ')}.`
      : 'Repeated full-file proposals for new path(s) failed validation.'

  if (options?.singleFileHtmlIntent) {
    return [
      `## ${EDIT_CREATION_INCREMENTAL_RECOVERY_MARKER}`,
      `### ${EDIT_SINGLE_FILE_HTML_CREATION_RECOVERY_MARKER}`,
      pathLine,
      'Repeated **full-file** `propose_file_edits` for a **new** `.html` path failed validation (incomplete, truncated, or malformed).',
      '**Single-file HTML recovery — two steps (do not retry one giant file with inline script):**',
      '1. **`propose_file_edits`** — submit a **minimal HTML shell** only: `<!DOCTYPE html>`, head, body, column/board markup. **No** `<script>` block. Stay under roughly **32 lines** and **1200 characters**.',
      '2. After the shell validates (`ok: true`), **`read_file`** the path, then extend with the primary **`edit`** tool — append `<script>…</script>` (and logic) in one or more clean chunks.',
      '3. Do **not** submit another large full-file `propose_file_edits` with inline script on the same path this turn.',
      'Do **not** tell the user the file was created until an edit tool returns `ok: true` in this turn.',
    ].join('\n')
  }

  return [
    `## ${EDIT_CREATION_INCREMENTAL_RECOVERY_MARKER}`,
    pathLine,
    'Repeated **full-file** `propose_file_edits` for **new** path(s) failed validation (incomplete, truncated, or malformed).',
    '**Change strategy — do not retry the same large full-file write:**',
    '1. Create a **minimal viable** version of each affected file first (smallest complete valid/runnable subset the plan needs).',
    '2. After a minimal file validates, call **`read_file`**, then extend using the primary **`edit`** tool (preferred) with precise additions, or small scoped `propose_file_edits`.',
    '3. Do **not** submit another giant full-file rewrite for the same path this turn.',
    'Do **not** tell the user the file was created until an edit tool returns `ok: true` in this turn.',
  ].join('\n')
}

/** Shared recovery copy for mid-turn edit nudges (story 130). */
export function buildHarnessEditRecoveryBrief(
  kind: 'search_replace_escalation' | 'partial_batch',
): string {
  if (kind === 'search_replace_escalation') {
    return [
      'Do **not** retry with guessed fragments.',
      'Re-read the exact relevant section(s) from `read_file` `rawContent` (use startLine/maxLines on large files). Then produce **one** clean replacement using the primary **`edit`** tool with precise oldText/newText (use the closest-match diagnostics + suggested excerpts from the failure).',
      'Do **not** claim the file was updated until you receive an `ok: true` tool result for a valid proposal on this path.',
    ].join('\n')
  }
  return [
    'Retry with **one** focused `propose_file_edits` (or `edit` tool for existing paths) containing *only* the rejected work. Each write must use the complete, clean, readable content from the latest `read_file` `rawContent`.',
    'Do **not** tell the user every planned file was created or updated until all rejected paths have a successful `ok: true` proposal in this turn.',
  ].join('\n')
}

/** User message injected once after excessive read-only rounds without an edit proposal (story 129/130). */
export function buildDiscoverySaturationNudge(options?: {
  readOnlyRounds?: number
  activeFilePath?: string | null
  iterativeWorkEdit?: boolean
}): string {
  if (options?.iterativeWorkEdit) {
    const rounds =
      options.readOnlyRounds !== undefined && options.readOnlyRounds > 0
        ? `**${options.readOnlyRounds}** read-only round(s) without an edit proposal.`
        : 'Several read-only rounds without an edit proposal.'
    return [
      `## ${DISCOVERY_SATURATION_NUDGE_MARKER}`,
      rounds,
      'Follow **Work iterative edit (harness 130)** — proceed to **`search_replace`** or **`propose_file_edits`** now with evidence from files already read.',
    ].join('\n')
  }
  const activeLine = options?.activeFilePath?.trim()
    ? `Start with \`read_file\` on **${options.activeFilePath.trim()}** if you have not already.`
    : 'Pick the main file for this feature (often `src/App.tsx` in Vite/React) and `read_file` it.'
  const rounds =
    options?.readOnlyRounds !== undefined && options.readOnlyRounds > 0
      ? `You have used **${options.readOnlyRounds}** read-only tool round(s) without creating an edit proposal.`
      : 'You have spent several read-only tool rounds without creating an edit proposal.'
  return [
    `## ${DISCOVERY_SATURATION_NUDGE_MARKER}`,
    rounds,
    'Stop broad discovery — proceed to **`propose_file_edits`** or **`search_replace`** with evidence from files already read.',
    activeLine,
    'Prefer **one focused change per file** (localized patch or one full-file proposal) instead of more directory walks.',
    'Do not tell the user the feature is done until an edit tool succeeds in this turn.',
  ].join('\n')
}

/** User message injected once when the model skips tools on an edit-intent fast turn. */
export function buildEditIntentToolNudge(options?: { singleFilePrimary?: boolean }): string {
  const editToolLine = options?.singleFilePrimary
    ? 'After `read_file` on the primary file, prefer **one** `propose_file_edits` with full `rawContent` — avoid multiple `search_replace` on the same path.'
    : 'For each existing file you will change: call `read_file` first, then `search_replace` (localized) or `propose_file_edits` (new files / multi-file).'
  return [
    `## ${EDIT_INTENT_TOOL_NUDGE_MARKER}`,
    'The user message asks for workspace file changes, but this turn has not created an edit proposal yet.',
    'You must call tools before finishing — retrieval snippets are not sufficient.',
    editToolLine,
    'Each `write_file` must use **real line breaks** (one statement per line in JS; never glue `import` lines or `] function`).',
    'Do not tell the user a diff or proposal is ready until an edit tool succeeds in this turn.',
  ].join('\n')
}

/** User message injected once when plan/user implies CLI verify/install but no run_command sampled yet. */
export function buildPlanVerifyCommandNudge(options?: {
  verificationHint?: string
  scaffoldStrategy?: ScaffoldStrategy | null
  suggestedCommands?: readonly string[]
}): string {
  const suggested = options?.suggestedCommands?.filter(Boolean) ?? []
  const hintFromSuggestion = suggested[0]?.trim()
  const verifyLine = options?.verificationHint?.trim()
    ? `Plan verification: ${options.verificationHint.trim()}`
    : hintFromSuggestion
      ? `Suggested verification command: \`${hintFromSuggestion}\``
      : 'The approved plan or user request mentions install, scaffold, git init, or verification commands.'

  const strategy = options?.scaffoldStrategy ?? null
  const exampleLine =
    strategy === 'file_bootstrap'
      ? 'For simple single-file or small vanilla static sites: verification can be "Open index.html directly in the browser". For larger static sites, optional lightweight serve (e.g. `npx --yes serve . -l 3000` or `python3 -m http.server 3000`) + manual browser check.'
      : 'Examples: `npm install`, `npm create`, `git init`, `npm run typecheck`, `npm test`, `npm run build`.'

  const scaffoldNote =
    strategy === 'file_bootstrap'
      ? 'Use **`propose_file_edits`** for HTML/CSS/JS file content — serve commands are optional verification only (avoid for trivial static single-file apps).'
      : 'Use **`propose_file_edits`** for file content — do not replace CLI scaffold/install steps with hand-written `package.json` only.'

  return [
    `## ${PLAN_VERIFY_COMMAND_NUDGE_MARKER}`,
    verifyLine,
    'Call **`run_command`** with a clear `purpose` before claiming install, build, or verification succeeded.',
    exampleLine,
    scaffoldNote,
    'Do not tell the user dependencies are installed or the project verified until `run_command` returns `ok: true` in this turn.',
  ].join('\n')
}

/** User message when greenfield execute mixes CLI scaffold and file edits (story 128). */
export function buildScaffoldStrategyNudge(
  strategy: ScaffoldStrategy,
  conflict: ScaffoldConflictKind,
): string {
  const strategyLine =
    strategy === 'file_bootstrap'
      ? 'This plan is **static file bootstrap** — use `propose_file_edits` for HTML/CSS/JS only.'
      : strategy === 'cli_then_customize'
        ? 'This plan is **CLI then customize** — run scaffold/install commands first, then edit generated files.'
        : 'This plan expects **CLI scaffold first** — use `run_command` for `npm create` / `npm install` / `git init` before hand-written template files.'

  const conflictLines: string[] = []
  if (conflict === 'hybrid_same_round') {
    conflictLines.push(
      'You sampled **`run_command` and edit tools in the same tool round**. GrokForge cannot apply both safely — pick **one** strategy for this round.',
      'If CLI scaffold: submit **`run_command` only** (no `propose_file_edits` / `search_replace` on template paths).',
      'If static bootstrap: submit **`propose_file_edits` only** (no `npm create` / `npm init`).',
    )
  } else if (conflict === 'edits_before_cli') {
    conflictLines.push(
      'You proposed **hand-written template files before CLI scaffold succeeded**. Stop rewriting `package.json`, `vite.config.*`, or entry files by hand.',
      'Call **`run_command`** for the scaffold/install step first. After it succeeds, `read_file` generated paths and propose **customization** edits only.',
    )
  } else if (conflict === 'cli_on_static') {
    conflictLines.push(
      'This static plan does **not** need `npm create` / `npm init`. Use **`propose_file_edits`** for `index.html`, `styles.css`, and `script.js` instead.',
    )
  }

  return [`## ${SCAFFOLD_STRATEGY_NUDGE_MARKER}`, strategyLine, ...conflictLines].join('\n')
}

/** User message after successful CLI scaffold when key files were not read yet. */
export function buildPostScaffoldVerificationNudge(input: {
  template: string | null
  missingPaths: readonly string[]
  uncheckedSignals?: readonly string[]
}): string {
  const templateLine = input.template
    ? `Expected stack: **${input.template}**.`
    : 'Verify the scaffold matches the approved plan stack.'
  const pathsLine =
    input.missingPaths.length > 0
      ? `Still unread: ${input.missingPaths.slice(0, 8).join(', ')}.`
      : 'Read the key generated files before summarizing.'
  const signalsLine =
    input.uncheckedSignals && input.uncheckedSignals.length > 0
      ? `Confirm: ${input.uncheckedSignals.join('; ')}.`
      : ''
  return [
    `## ${POST_SCAFFOLD_VERIFICATION_MARKER}`,
    'A scaffold/install command **succeeded** in this turn. **`list_directory` alone is not enough.**',
    templateLine,
    'Call **`read_file`** on at least: `package.json`, `vite.config.ts` (or `.js`), and the main entry file (`src/main.tsx`, `src/main.ts`, etc.).',
    pathsLine,
    signalsLine,
    'Check that dependencies and entry files match the requested framework (e.g. React + TypeScript when `--template react-ts`).',
    'Do **not** claim the scaffold is verified until you have read those files or run an explicit verify command (`npm run typecheck`, etc.).',
  ]
    .filter(Boolean)
    .join('\n')
}

export type AgentFinalAnswerContractInput = {
  userText: string
  editProposalCreated: boolean
  /** Multiple edit tools composed into one proposal this turn (story 119). */
  editProposalComposedInTurn?: boolean
  /** Story 152: whether edit tools were called and failed vs not attempted. */
  editAttemptOutcome?: EditAttemptOutcome
  /** Story 152: basenames for paths with edit tool failures this turn. */
  failedEditPaths?: readonly string[]
  /** Edit-intent turn where edit tools failed and no proposal was created (story 152). */
  editToolsFailed?: boolean
  chatMode: 'fast' | 'plan'
  profileKey?: HarnessProfileKey
  agentProfileId?: AgentProfileId
  executeFromApprovedPlan?: boolean
  /** Story 120: incremental Work follow-up — no new gf-plan. */
  postPlanIncremental?: boolean
  /** Story 130: non-greenfield workspace edit-intent Work — no new gf-plan. */
  iterativeWorkEdit?: boolean
  greenfieldWorkspace?: boolean
  /** Story 124: paths still rejected in the pending edit proposal at final answer. */
  partialBatchRejections?: readonly PartialBatchRejectedOp[]
  /** Story 126: run_command failed, rejected, timed out, or was skipped when verify/install was required. */
  commandToolsFailed?: boolean
  /** Story 128: scaffold strategy conflict nudge fired this turn. */
  scaffoldStrategyConflictIssued?: boolean
  /** Story 134: compliant tool sample after scaffold strategy nudge. */
  scaffoldStrategyRecovered?: boolean
  scaffoldStrategy?: ScaffoldStrategy | null
  /** Story 134: propose_file_edits succeeded after search_replace escalation nudge. */
  searchReplaceEscalationRecovered?: boolean
  /** Story 128+: CLI scaffold succeeded but key files were not read this turn. */
  postScaffoldVerificationIncomplete?: boolean
  postScaffoldMissingPaths?: readonly string[]
  /** Story 153: creation incremental recovery nudge fired this turn. */
  creationIncrementalRecoveryIssued?: boolean
  /** Story 153: enforced new path(s) without an accepted minimal scaffold at final stream. */
  creationRecoveryUnmetPaths?: readonly string[]
}

function failedEditFinalAnswerHonestyAppendix(input: {
  editAttemptOutcome?: EditAttemptOutcome
  failedEditPaths?: readonly string[]
}): string {
  if (input.editAttemptOutcome !== 'failed') return ''
  const pathLine =
    input.failedEditPaths && input.failedEditPaths.length > 0
      ? `Affected file(s): ${input.failedEditPaths.join(', ')}.`
      : 'One or more edit tool attempts failed validation in this turn.'
  return [
    '',
    `### ${FAILED_EDIT_FINAL_ANSWER_HONESTY_MARKER}`,
    pathLine,
    'GrokForge does **not** have a valid, accepted edit proposal from this turn — **no workspace file was created, updated, saved, or written on disk**.',
    'Provide a **short honest summary** only: what failed, that nothing was applied, and the single best next retry (re-read `rawContent`, fix formatting, or retry in a new turn).',
    'Do **not** imply a diff review is ready, that the plan step is complete, or that the user can apply changes from this message.',
    'Do **not** paste a full replacement file in the final answer.',
    `If you must show a tiny excerpt, label it clearly as an **unapplied reference snippet** and keep it under **${FAILED_EDIT_FINAL_ANSWER_MAX_REFERENCE_LINES} lines** and **${FAILED_EDIT_FINAL_ANSWER_MAX_REFERENCE_CHARS} characters** — never present it as the completed or applied artifact.`,
    'You may only claim success for a path if the final tool result for that path was `ok: true` in this turn.',
  ].join('\n')
}

function creationIncrementalRecoveryHonestyAppendix(input: {
  creationIncrementalRecoveryIssued?: boolean
  creationRecoveryUnmetPaths?: readonly string[]
}): string {
  if (!input.creationIncrementalRecoveryIssued) return ''
  const unmet = input.creationRecoveryUnmetPaths ?? []
  if (unmet.length === 0) return ''
  const pathLine =
    unmet.length > 0
      ? `Affected new path(s): ${unmet.join(', ')}.`
      : 'One or more new paths required incremental recovery this turn.'
  return [
    '',
    `### ${CREATION_INCREMENTAL_RECOVERY_HONESTY_MARKER}`,
    pathLine,
    'GrokForge required **creation incremental recovery** — a **minimal scaffold** first, then extend with `read_file` and the primary `edit` tool or small scoped `propose_file_edits`.',
    'That requirement was **not satisfied** before this final answer.',
    'Do **not** claim any file was created, updated, saved, or written on disk.',
    'Do **not** paste a full replacement file in the final answer; explain what failed and that the user should retry with a minimal scaffold or start a new turn.',
  ].join('\n')
}

function editIntentPreFinalToolGuidance(input: {
  userText: string
  editProposalCreated: boolean
  editAttemptOutcome?: EditAttemptOutcome
}): string[] {
  if (input.editProposalCreated) {
    return [
      'A first-class edit proposal has already been created with `propose_file_edits`. Briefly tell the user the diff review is ready; do not claim files were written to disk until they apply.',
    ]
  }
  if (input.editAttemptOutcome === 'failed') {
    return [
      'Edit tools were attempted in this turn but **did not succeed** — provide the short honest failure summary required below. Do **not** call more edit tools in this final answer.',
    ]
  }
  const maybeEdit = isLikelyEditIntent(input.userText)
  if (maybeEdit) {
    return [
      'The user appears to be asking for workspace file changes. Call `propose_file_edits` (or `search_replace` for a small localized edit) before your final answer. Do not stop at prose or a normal markdown code fence — GrokForge does not apply those to disk.',
      'Do not ask the user to provide a file path unless you already tried `search_workspace` or `list_directory` in this turn and the target is still ambiguous.',
      'Base each `write_file` on the latest `read_file` content for that path. Make the smallest change that satisfies the request; do not rewrite unrelated sections unless a full-file rewrite is clearly required.',
    ]
  }
  return [
    'If you intend workspace file changes, call `propose_file_edits` in this turn before finishing. If this is only an explanation, omit edit tools.',
  ]
}

function editIntentFormattingGuidance(input: {
  userText: string
  editProposalCreated: boolean
  editAttemptOutcome?: EditAttemptOutcome
}): string[] {
  if (input.editProposalCreated || input.editAttemptOutcome === 'failed') return []
  if (!isLikelyEditIntent(input.userText)) return []
  return [
    'In HTML/CSS/JS/TSX proposals use **readable multi-line** layout (one statement per line in JS; separate import lines; normal `className="..."` quotes). Do not claim "readable formatting" unless the proposal passes that bar.',
    'Each `write_file` in `propose_file_edits` must include the complete file text (full-file ops), but only change what the request needs. Use `delete_file` for a single existing file. For moves, use `write_file` at the destination plus `delete_file` for the source.',
    'You must `read_file` each existing file before proposing `write_file` for that path in this turn.',
    'For existing files, include `expectedContentHash` from the latest `read_file` `contentHash` on each write operation. For new files, omit `expectedContentHash` (or use the `new` sentinel).',
    'Every path must be absolute and under a workspace root.',
    'Do not tell the user that files were already written, saved, or applied on disk unless `propose_file_edits` succeeded in this turn.',
  ]
}

function slimEditIntentPreFinalGuidance(input: AgentFinalAnswerContractInput): string {
  if (input.editProposalCreated) {
    return 'A first-class edit proposal has already been created. Briefly tell the user the diff review is ready; do not claim files were written to disk until they apply.'
  }
  if (input.editAttemptOutcome === 'failed') {
    return 'Edit tools were attempted but **did not succeed** — give a short honest failure summary below; do **not** call more edit tools or output a `gf-plan` fence.'
  }
  if (isLikelyEditIntent(input.userText)) {
    return 'Implement the requested change with edit tools before finishing — do **not** output a `gf-plan` fence or replan. Prefer **`search_replace`** on existing files for small localized changes.'
  }
  return 'If this is only an explanation, omit edit tools.'
}

function commandToolsFailedAppendix(commandToolsFailed?: boolean): string {
  if (!commandToolsFailed) return ''
  return [
    '',
    `### ${COMMAND_TOOLS_FAILED_HONESTY_MARKER}`,
    'A required **`run_command`** did not succeed in this turn (rejected, failed, timed out, or skipped).',
    'Do **not** claim dependencies were installed, the project was scaffolded via CLI, git was initialized, or verification (typecheck/test/build) passed.',
    'Tell the user which command was blocked or failed and what remains (manual terminal, retry after approval, or fix the command).',
    'File edit proposals alone do not satisfy install/scaffold/verify steps from the approved plan.',
  ].join('\n')
}

function scaffoldStrategyHonestyAppendix(input: {
  scaffoldStrategyConflictIssued?: boolean
  scaffoldStrategyRecovered?: boolean
  scaffoldStrategy?: ScaffoldStrategy | null
  editProposalCreated?: boolean
  commandToolsFailed?: boolean
}): string {
  if (!input.scaffoldStrategyConflictIssued) return ''

  const staticBootstrapRecovered =
    input.scaffoldStrategy === 'file_bootstrap' && input.scaffoldStrategyRecovered === true
  const softRecovery =
    input.editProposalCreated === true &&
    (input.commandToolsFailed !== true || staticBootstrapRecovered) &&
    (input.scaffoldStrategyRecovered === true || input.scaffoldStrategy === 'file_bootstrap')

  if (softRecovery) {
    const strategyNote =
      input.scaffoldStrategy === 'file_bootstrap'
        ? 'Static file bootstrap — review the proposal below. Do **not** apologize for a scaffold "conflict" or claim CLI scaffold is incomplete.'
        : 'GrokForge redirected tool order to match the approved scaffold strategy — review the proposal below.'
    return [
      '',
      `### ${SCAFFOLD_STRATEGY_HONESTY_MARKER}`,
      'Harness corrected tool order in this turn.',
      strategyNote,
      'Do **not** lead with "conflict" language when the diff review is ready.',
    ].join('\n')
  }

  return [
    '',
    `### ${SCAFFOLD_STRATEGY_HONESTY_MARKER}`,
    'GrokForge detected a **scaffold strategy conflict** (CLI scaffold mixed with hand-written template files).',
    input.editProposalCreated
      ? 'Some file paths may be in the diff review, but **CLI scaffold is not complete** until the user approves and the command succeeds.'
      : 'Do **not** claim the project scaffold is ready on disk.',
    input.commandToolsFailed
      ? 'The scaffold command did not succeed — tell the user to approve/retry the CLI step before treating file proposals as the source of truth.'
      : 'If a scaffold command is still awaiting approval, say so — file proposals for template paths may be premature.',
  ].join('\n')
}

function searchReplaceEscalationHonestyAppendix(input: {
  searchReplaceEscalationRecovered?: boolean
  editProposalCreated?: boolean
}): string {
  if (!input.searchReplaceEscalationRecovered || !input.editProposalCreated) return ''
  return [
    '',
    '### Harness: edit path honesty',
    'GrokForge steered away from repeated `search_replace` failures toward a reviewable `propose_file_edits` proposal.',
    'Do **not** tell the user that `search_replace` is the only path — the diff review is ready.',
  ].join('\n')
}

function postScaffoldVerificationHonestyAppendix(
  incomplete?: boolean,
  missingPaths?: readonly string[],
  options?: { scaffoldStrategy?: ScaffoldStrategy | null; editProposalCreated?: boolean },
): string {
  if (!incomplete) return ''
  const missing =
    missingPaths && missingPaths.length > 0
      ? missingPaths.slice(0, 6).join(', ')
      : 'key generated files'
  if (
    options?.scaffoldStrategy === 'file_bootstrap' &&
    options.editProposalCreated === true
  ) {
    return [
      '',
      `### ${POST_SCAFFOLD_VERIFICATION_HONESTY_MARKER}`,
      'A scaffold command succeeded; some generated paths were not read this turn.',
      `Still unchecked: ${missing}. Briefly note what remains to inspect — do **not** claim the static bootstrap failed when file proposals are in diff review.`,
    ].join('\n')
  }
  return [
    '',
    `### ${POST_SCAFFOLD_VERIFICATION_HONESTY_MARKER}`,
    'A scaffold command succeeded, but GrokForge did **not** record `read_file` on all expected generated paths this turn.',
    `Do **not** claim the scaffold is fully verified or that the requested framework stack was confirmed — still unchecked: ${missing}.`,
    'Tell the user what was scaffolded, which files you read vs still need to inspect, and any verify command (`npm install`, `npm run typecheck`) that remains.',
  ].join('\n')
}

function executorFromPlanAppendix(executeFromApprovedPlan?: boolean): string {
  if (!executeFromApprovedPlan) return ''
  return ['', '### Execute approved plan (final answer)', EXECUTOR_FROM_PLAN_FINAL_ANSWER_POINTER].join('\n')
}

function incrementalWorkEditAppendix(input?: {
  postPlanIncremental?: boolean
  iterativeWorkEdit?: boolean
}): string {
  if (!input?.postPlanIncremental && !input?.iterativeWorkEdit) return ''
  return [
    '',
    '### Incremental Work edit (final answer)',
    'Do **not** output a `gf-plan` fence or structured replan — implement the small change with edit tools.',
    'Prefer **`search_replace`** on existing files for localized follow-ups; use **`propose_file_edits`** only for new paths or after failed S&R.',
    'Do **not** claim the change is ready if the proposal would shrink a working file or omit code from the latest **`read_file` `rawContent`**.',
    'Briefly confirm what you changed after the edit proposal is ready.',
  ].join('\n')
}

function fastModeProfileAppendix(profileKey?: HarnessProfileKey): string {
  if (profileKey !== 'grok_code_fast') return ''
  return 'Keep the human-readable summary **brief** unless the user asked for a long explanation.'
}

function mergedEditProposalHonestyAppendix(
  editProposalCreated?: boolean,
  editProposalComposedInTurn?: boolean,
): string {
  if (!editProposalCreated || !editProposalComposedInTurn) return ''
  return [
    '',
    `### ${MERGED_EDIT_PROPOSAL_HONESTY_MARKER}`,
    'GrokForge merged multiple edit tool calls in this turn into **one** combined diff review.',
    'Do **not** describe multiple separate diff reviews, sequential review cards, or several apply steps.',
    'Tell the user one proposal is ready to review (and apply once if they use Trust mode).',
  ].join('\n')
}

function partialBatchHonestyAppendix(
  editProposalCreated?: boolean,
  rejected?: readonly PartialBatchRejectedOp[],
): string {
  if (!editProposalCreated || !rejected?.length) return ''
  const labels = rejected
    .map((r) => (r.path ? basenameForEscalationPath(r.path) : ''))
    .filter(Boolean)
  const pathList = labels.length > 0 ? labels.join(', ') : 'some planned paths'
  return [
    '',
    `### ${PARTIAL_BATCH_PROPOSAL_HONESTY_MARKER}`,
    `GrokForge accepted part of this turn's edit proposal, but **rejected** validation for: ${pathList}.`,
    'Do **not** claim the approved plan is fully implemented, every planned file was created, or the bootstrap is complete.',
    'Tell the user which files are ready in the diff review and which paths still need a corrected proposal (mention validation reasons briefly).',
    'If you already retried in this turn, say what remains blocked — do not imply silent success.',
  ].join('\n')
}

function buildSlimIterativeFinalAnswerContract(input: AgentFinalAnswerContractInput): string {
  return [
    '## Final response contract',
    slimEditIntentPreFinalGuidance(input),
    failedEditFinalAnswerHonestyAppendix({
      editAttemptOutcome: input.editAttemptOutcome,
      failedEditPaths: input.failedEditPaths,
    }),
    creationIncrementalRecoveryHonestyAppendix({
      creationIncrementalRecoveryIssued: input.creationIncrementalRecoveryIssued,
      creationRecoveryUnmetPaths: input.creationRecoveryUnmetPaths,
    }),
    commandToolsFailedAppendix(input.commandToolsFailed),
    mergedEditProposalHonestyAppendix(
      input.editProposalCreated,
      input.editProposalComposedInTurn,
    ),
    partialBatchHonestyAppendix(input.editProposalCreated, input.partialBatchRejections),
    fastModeProfileAppendix(input.profileKey),
    incrementalWorkEditAppendix({
      postPlanIncremental: input.postPlanIncremental,
      iterativeWorkEdit: input.iterativeWorkEdit,
    }),
  ]
    .filter(Boolean)
    .join('\n')
}

/** System message appended before the final streaming answer in the agent tool loop. */
export function buildFinalAnswerContract(input: AgentFinalAnswerContractInput): string {
  if (input.chatMode === 'plan') {
    return buildGfPlanFinalAnswerContract({
      agentProfileId: input.agentProfileId,
      profileKey: input.profileKey,
      greenfieldWorkspace: input.greenfieldWorkspace,
    })
  }

  if (input.iterativeWorkEdit || input.postPlanIncremental) {
    return buildSlimIterativeFinalAnswerContract(input)
  }

  return [
    '## Final response contract',
    ...editIntentPreFinalToolGuidance({
      userText: input.userText,
      editProposalCreated: input.editProposalCreated,
      editAttemptOutcome: input.editAttemptOutcome,
    }),
    ...editIntentFormattingGuidance({
      userText: input.userText,
      editProposalCreated: input.editProposalCreated,
      editAttemptOutcome: input.editAttemptOutcome,
    }),
    failedEditFinalAnswerHonestyAppendix({
      editAttemptOutcome: input.editAttemptOutcome,
      failedEditPaths: input.failedEditPaths,
    }),
    creationIncrementalRecoveryHonestyAppendix({
      creationIncrementalRecoveryIssued: input.creationIncrementalRecoveryIssued,
      creationRecoveryUnmetPaths: input.creationRecoveryUnmetPaths,
    }),
    commandToolsFailedAppendix(input.commandToolsFailed),
    scaffoldStrategyHonestyAppendix({
      scaffoldStrategyConflictIssued: input.scaffoldStrategyConflictIssued,
      scaffoldStrategyRecovered: input.scaffoldStrategyRecovered,
      scaffoldStrategy: input.scaffoldStrategy,
      editProposalCreated: input.editProposalCreated,
      commandToolsFailed: input.commandToolsFailed,
    }),
    searchReplaceEscalationHonestyAppendix({
      searchReplaceEscalationRecovered: input.searchReplaceEscalationRecovered,
      editProposalCreated: input.editProposalCreated,
    }),
    postScaffoldVerificationHonestyAppendix(
      input.postScaffoldVerificationIncomplete,
      input.postScaffoldMissingPaths,
      {
        scaffoldStrategy: input.scaffoldStrategy,
        editProposalCreated: input.editProposalCreated,
      },
    ),
    mergedEditProposalHonestyAppendix(
      input.editProposalCreated,
      input.editProposalComposedInTurn,
    ),
    partialBatchHonestyAppendix(input.editProposalCreated, input.partialBatchRejections),
    fastModeProfileAppendix(input.profileKey),
    executorFromPlanAppendix(input.executeFromApprovedPlan),
    incrementalWorkEditAppendix({
      postPlanIncremental: input.postPlanIncremental,
      iterativeWorkEdit: input.iterativeWorkEdit,
    }),
  ]
    .filter(Boolean)
    .join('\n')
}
