import type { AgentProfileId } from './agent-profile'
import type { HarnessProfileKey } from './agent-harness-profile-contract'
import { EXECUTOR_FROM_PLAN_FINAL_ANSWER_POINTER } from './agent-harness-profile'
import type {
  ScaffoldConflictKind,
  ScaffoldStrategy,
} from './agent-scaffold-strategy'
import { SCAFFOLD_STRATEGY_NUDGE_MARKER } from './agent-scaffold-strategy'
import { POST_SCAFFOLD_VERIFICATION_HONESTY_MARKER, POST_SCAFFOLD_VERIFICATION_MARKER } from './agent-scaffold-command'
import { buildGfPlanFinalAnswerContract } from './gf-plan-contract'
import { isPartialBatchIntegrityRejection } from './agent-edit-corrupt-content'

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

/** Marker in final answer when rejected paths remain in the pending proposal (story 124). */
export const PARTIAL_BATCH_PROPOSAL_HONESTY_MARKER = 'Harness: partial batch proposal honesty'

/** Marker when multiple edit tools merged into one diff review (story 119). */
export const MERGED_EDIT_PROPOSAL_HONESTY_MARKER = 'Harness: merged edit proposal honesty'

/** Marker when plan verify/install intent skipped run_command on first tool sample (story 126). */
export const PLAN_VERIFY_COMMAND_NUDGE_MARKER = 'Harness: plan verify command required'

/** Marker when discovery read-only rounds exceed budget without an edit proposal (story 129). */
export const DISCOVERY_SATURATION_NUDGE_MARKER = 'Harness: discovery saturation'

export { SCAFFOLD_STRATEGY_NUDGE_MARKER } from './agent-scaffold-strategy'

/** Marker in final answer when scaffold strategy conflict nudge fired (story 128). */
export const SCAFFOLD_STRATEGY_HONESTY_MARKER = 'Harness: scaffold strategy honesty'

/** Marker in final answer when command tools failed or were rejected (story 126). */
export const COMMAND_TOOLS_FAILED_HONESTY_MARKER = 'Harness: command tools failed honesty'

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
      : 'One or more files had repeated search_replace failures.'
  const hasHtml = paths.some((p) => /\.html?$/i.test(p.replace(/\\/g, '/')))
  const hasJs = paths.some((p) => /\.jsx?$/i.test(p.replace(/\\/g, '/')))
  const iterative = options?.iterativeWorkEdit === true

  if (iterative) {
    const jsLine = hasJs
      ? 'Small UI change (button, handler, CSS class): one **`propose_file_edits`** with the **full** file from `read_file` **`rawContent`** (e.g. `script.js`), changing **only** the handler block — do not rewrite unrelated todo logic.'
      : 'Small localized change: one **`propose_file_edits`** with the **full** file from `read_file` **`rawContent`**, changing only what the user asked.'
    const preserveLine =
      hasJs || hasHtml
        ? 'Preserve unchanged functions and markup; GrokForge still blocks destructive shrink (**115**) — send the **complete** correct file, not a stub.'
        : 'Send the **complete** correct file from `rawContent`, not a shortened stub — **115** shrink guard still applies on code files.'
    return [
      `## ${EDIT_SEARCH_REPLACE_ESCALATION_MARKER}`,
      `## ${EDIT_ITERATIVE_SEARCH_REPLACE_ESCALATION_MARKER}`,
      pathLine,
      buildHarnessEditRecoveryBrief('search_replace_escalation'),
      jsLine,
      preserveLine,
      'Do **not** call **`search_replace`** again on this path this turn.',
      'Do not tell the user the file was updated until an edit tool returns `ok: true` in this turn.',
    ]
      .filter(Boolean)
      .join('\n')
  }

  if (options?.brief) {
    const htmlLine = hasHtml
      ? 'For HTML with inline `<script>`, use one full-file `propose_file_edits` from `rawContent` — not `search_replace` on crushed script.'
      : ''
    return [
      `## ${EDIT_SEARCH_REPLACE_ESCALATION_MARKER}`,
      pathLine,
      buildHarnessEditRecoveryBrief('search_replace_escalation'),
      htmlLine,
      'Do not tell the user the file was updated until an edit tool returns `ok: true` in this turn.',
    ]
      .filter(Boolean)
      .join('\n')
  }
  const htmlLines = hasHtml
    ? [
        'For **index.html** (or any HTML with inline `<script>`): do **not** patch the crushed script with `search_replace`. Use one `propose_file_edits` `write_file` with the **entire** file from `rawContent`, fixing the `<script>` block with **one statement per line** (no `}function`, no `}););`, no code after `//` on the same line). Prefer `script.js` + `<script src="script.js">` for new todo apps.',
      ]
    : []
  return [
    `## ${EDIT_SEARCH_REPLACE_ESCALATION_MARKER}`,
    pathLine,
    'Do **not** retry `search_replace` with guessed or reformatted `old_string` text.',
    'Call `read_file` again and copy text only from **`rawContent`** (not the line-numbered `content` field).',
    'For small files or localized section edits: use one `propose_file_edits` with the **complete** file body from the latest `read_file` `rawContent` (every heading and section), changing only what the user asked for.',
    ...htmlLines,
    'Do not send only the changed bullets or a shortened stub — include the full document text in `write_file.content`.',
    'On markdown/plain text under ~64 lines, GrokForge still accepts the proposal for diff review; on code files, destructive shrink stays blocked.',
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
        'For **script.js**: submit the **complete** file with **one statement per line** — no crushed one-liners, no orphan `)` lines, no `}function` glue. Prefer a separate file over inline HTML `<script>`.',
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

/** Shared recovery copy for mid-turn edit nudges (story 130). */
export function buildHarnessEditRecoveryBrief(
  kind: 'search_replace_escalation' | 'partial_batch',
): string {
  if (kind === 'search_replace_escalation') {
    return [
      'Do **not** retry `search_replace` with guessed `old_string` text.',
      'Call `read_file` and copy from **`rawContent`**, then one `propose_file_edits` with the **complete** file — change only what the user asked for.',
    ].join('\n')
  }
  return [
    'Retry with **one** `propose_file_edits` containing **only the rejected paths**, each with a **complete** `write_file.content` body from `read_file` `rawContent`.',
    'Do **not** tell the user every planned file was created until all rejected paths succeed in this turn.',
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
      'Follow **Work iterative edit (harness 130)** — proceed to **`propose_file_edits`** or **`search_replace`** now with evidence from files already read.',
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
      ? 'Examples: `npx --yes serve . -l 3000`, `python3 -m http.server 3000` — then manual browser check.'
      : 'Examples: `npm install`, `npm create`, `git init`, `npm run typecheck`, `npm test`, `npm run build`.'

  const scaffoldNote =
    strategy === 'file_bootstrap'
      ? 'Use **`propose_file_edits`** for HTML/CSS/JS file content — serve commands are for verification only, not scaffold.'
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
  /** Edit-intent turn where search_replace failed repeatedly and no proposal was created. */
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
}

function editToolsFailedAppendix(editToolsFailed?: boolean): string {
  if (!editToolsFailed) return ''
  return [
    '',
    '### Edit tools did not succeed (this turn)',
    '**search_replace** failed repeatedly and GrokForge does **not** have a reviewable edit proposal from this turn.',
    'Do **not** claim any workspace file was updated, changed, saved, or written on disk.',
    'Tell the user what failed (exact match / validation), and that they can retry with `propose_file_edits` using the full file from `read_file` `rawContent`, or edit manually.',
    'A full-file rewrite that keeps unrelated content is allowed; proposals that remove most of the file were blocked for safety.',
  ].join('\n')
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
  const maybeEdit = isLikelyEditIntent(input.userText)
  return [
    '## Final response contract',
    input.editProposalCreated
      ? 'A first-class edit proposal has already been created. Briefly tell the user the diff review is ready; do not claim files were written to disk until they apply.'
      : maybeEdit
        ? 'Implement the requested change with edit tools before finishing — do **not** output a `gf-plan` fence or replan.'
        : 'If this is only an explanation, omit edit tools.',
    editToolsFailedAppendix(input.editToolsFailed),
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

  const maybeEdit = isLikelyEditIntent(input.userText)
  return [
    '## Final response contract',
    input.editProposalCreated
      ? 'A first-class edit proposal has already been created with `propose_file_edits`. Briefly tell the user the diff review is ready; do not claim files were written to disk until they apply.'
      : maybeEdit
        ? 'The user appears to be asking for workspace file changes. Call `propose_file_edits` (or `search_replace` for a small localized edit) before your final answer. Do not stop at prose or a normal markdown code fence — GrokForge does not apply those to disk.'
        : 'If you intend workspace file changes, call `propose_file_edits` in this turn before finishing. If this is only an explanation, omit edit tools.',
    maybeEdit && !input.editProposalCreated
      ? 'Do not ask the user to provide a file path unless you already tried `search_workspace` or `list_directory` in this turn and the target is still ambiguous.'
      : '',
    maybeEdit && !input.editProposalCreated
      ? 'Base each `write_file` on the latest `read_file` content for that path. Make the smallest change that satisfies the request; do not rewrite unrelated sections unless a full-file rewrite is clearly required.'
      : '',
    maybeEdit
      ? 'In HTML/CSS/JS/TSX proposals use **readable multi-line** layout (one statement per line in JS; separate import lines; normal `className="..."` quotes). Do not claim "readable formatting" unless the proposal passes that bar.'
      : '',
    'Each `write_file` in `propose_file_edits` must include the complete file text (full-file ops), but only change what the request needs. Use `delete_file` for a single existing file. For moves, use `write_file` at the destination plus `delete_file` for the source.',
    'You must `read_file` each existing file before proposing `write_file` for that path in this turn.',
    'For existing files, include `expectedContentHash` from the latest `read_file` `contentHash` on each write operation.',
    'Every path must be absolute and under a workspace root.',
    'Do not tell the user that files were already written, saved, or applied on disk unless `propose_file_edits` succeeded in this turn.',
    editToolsFailedAppendix(input.editToolsFailed),
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
