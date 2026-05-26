import type { AgentProfileId } from './agent-profile'
import type { HarnessProfileKey } from './agent-harness-profile-contract'
import { EXECUTOR_FROM_PLAN_FINAL_ANSWER_POINTER } from './agent-harness-profile'
import { buildGfPlanFinalAnswerContract } from './gf-plan-contract'
import { isPartialBatchIntegrityRejection } from './agent-edit-corrupt-content'

export const EDIT_INTENT_RE =
  /\b(add|apply|build|change|create|delete|edit|fix|implement|make|move|patch|refactor|remove|rename|replace|update|write)\b/i

/** Marker in harness nudge when a fast-mode edit turn sampled zero tools (eval/tests). */
export const EDIT_INTENT_TOOL_NUDGE_MARKER = 'Harness: edit tools required'

/** Marker when search_replace failed repeatedly and the harness steers recovery (eval/tests). */
export const EDIT_SEARCH_REPLACE_ESCALATION_MARKER = 'Harness: search_replace escalation'

/** Marker when propose_file_edits HTML was rejected as incomplete (eval/tests). */
export const EDIT_INCOMPLETE_HTML_NUDGE_MARKER = 'Harness: incomplete HTML proposal'

/** Marker when a multi-file proposal accepted some paths and rejected others (story 124). */
export const EDIT_PARTIAL_BATCH_NUDGE_MARKER = 'Harness: partial batch proposal recovery'

/** Marker in final answer when rejected paths remain in the pending proposal (story 124). */
export const PARTIAL_BATCH_PROPOSAL_HONESTY_MARKER = 'Harness: partial batch proposal honesty'

/** Marker when multiple edit tools merged into one diff review (story 119). */
export const MERGED_EDIT_PROPOSAL_HONESTY_MARKER = 'Harness: merged edit proposal honesty'

export function isLikelyEditIntent(userText: string): boolean {
  return EDIT_INTENT_RE.test(userText)
}

function basenameForEscalationPath(pathKey: string): string {
  const parts = pathKey.split(/[/\\]/).filter(Boolean)
  return parts[parts.length - 1] ?? pathKey
}

/** User message injected once after repeated search_replace failures on a path. */
export function buildSearchReplaceEscalationNudge(paths: readonly string[]): string {
  const labels = paths.map(basenameForEscalationPath).filter(Boolean)
  const pathLine =
    labels.length > 0
      ? `Affected file(s): ${labels.join(', ')}.`
      : 'One or more files had repeated search_replace failures.'
  const hasHtml = paths.some((p) => /\.html?$/i.test(p.replace(/\\/g, '/')))
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
  return [
    `## ${EDIT_PARTIAL_BATCH_NUDGE_MARKER}`,
    pathLine,
    `${acceptedCount} file(s) are already in the pending diff review — do **not** resubmit those paths unless you need to fix them.`,
    ...reasonLines,
    ...jsHint,
    ...htmlHint,
    'Retry with **one** `propose_file_edits` containing **only the rejected paths**, each with a **complete** `write_file.content` body.',
    'Use `read_file` first if you need the latest disk or plan context — copy from `rawContent` when editing existing files.',
    'Do **not** tell the user every planned file was created until all rejected paths succeed in this turn.',
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
    'Do not tell the user a diff or proposal is ready until an edit tool succeeds in this turn.',
  ].join('\n')
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
  greenfieldWorkspace?: boolean
  /** Story 124: paths still rejected in the pending edit proposal at final answer. */
  partialBatchRejections?: readonly PartialBatchRejectedOp[]
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

function executorFromPlanAppendix(
  executeFromApprovedPlan?: boolean,
  agentProfileId?: AgentProfileId,
): string {
  if (!executeFromApprovedPlan && agentProfileId !== 'executor') return ''
  return ['', '### Execute approved plan (final answer)', EXECUTOR_FROM_PLAN_FINAL_ANSWER_POINTER].join('\n')
}

function postPlanIncrementalAppendix(postPlanIncremental?: boolean): string {
  if (!postPlanIncremental) return ''
  return [
    '',
    '### Post-plan incremental follow-up (final answer)',
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

/** System message appended before the final streaming answer in the agent tool loop. */
export function buildFinalAnswerContract(input: AgentFinalAnswerContractInput): string {
  if (input.chatMode === 'plan') {
    return buildGfPlanFinalAnswerContract({
      agentProfileId: input.agentProfileId,
      profileKey: input.profileKey,
      greenfieldWorkspace: input.greenfieldWorkspace,
    })
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
    'Each `write_file` in `propose_file_edits` must include the complete file text (full-file ops), but only change what the request needs. Use `delete_file` for a single existing file. For moves, use `write_file` at the destination plus `delete_file` for the source.',
    'You must `read_file` each existing file before proposing `write_file` for that path in this turn.',
    'For existing files, include `expectedContentHash` from the latest `read_file` `contentHash` on each write operation.',
    'Every path must be absolute and under a workspace root.',
    'Do not tell the user that files were already written, saved, or applied on disk unless `propose_file_edits` succeeded in this turn.',
    editToolsFailedAppendix(input.editToolsFailed),
    mergedEditProposalHonestyAppendix(
      input.editProposalCreated,
      input.editProposalComposedInTurn,
    ),
    partialBatchHonestyAppendix(input.editProposalCreated, input.partialBatchRejections),
    fastModeProfileAppendix(input.profileKey),
    executorFromPlanAppendix(input.executeFromApprovedPlan, input.agentProfileId),
    postPlanIncrementalAppendix(input.postPlanIncremental),
  ]
    .filter(Boolean)
    .join('\n')
}
