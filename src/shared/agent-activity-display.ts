import type {
  AgentChatActivityPayload,
  AgentChatToolName,
  HarnessInterventionKind,
} from './agent-chat-contract'
import { AGENT_EDIT_MINIMAL_SCAFFOLD_REQUIRED_REASON } from './agent-creation-recovery-enforcement'
import {
  AGENT_EDIT_INCOMPLETE_JSON_MANIFEST_REASON,
  AGENT_EDIT_INVALID_JSON_MANIFEST_REASON,
} from './agent-bootstrap-manifest'
import { AGENT_EDIT_CASCADE_GUARD_REASON } from './agent-edit-cascade-guard'
import {
  AGENT_EDIT_CORRUPT_CONTENT_REASON,
  AGENT_EDIT_CORRUPT_ENCODING_REASON,
  AGENT_EDIT_CORRUPT_JS_ORPHAN_PAREN_REASON,
  AGENT_EDIT_EMPTY_WRITE_REASON,
  AGENT_EDIT_HTML_ENTITY_ARTIFACT_REASON,
  AGENT_EDIT_INCOMPLETE_HTML_REASON,
  AGENT_EDIT_INCOMPLETE_TS_REASON,
  AGENT_EDIT_JAMMED_JS_FILE_REASON,
  AGENT_EDIT_JAMMED_SCRIPT_REASON,
  AGENT_EDIT_MALFORMED_JSX_REASON,
  AGENT_EDIT_RAW_CRUSHED_PREVALIDATION_REASON,
} from './agent-edit-corrupt-content'
import { AGENT_EDIT_READ_BEFORE_WRITE_REASON } from './agent-edit-read-guard'
import {
  AGENT_EDIT_MALFORMED_CONTENT_HASH_REASON,
  AGENT_EDIT_MISSING_CONTENT_HASH_REASON,
  AGENT_EDIT_STALE_HASH_REASON,
} from './agent-content-hash'
import type { ScaffoldConflictKind } from './agent-scaffold-strategy'

export const AGENT_ACTIVITY_DETAIL_MAX_CHARS = 200

const SECRET_LINE_RE =
  /(?:^|[\s"'`(])(?:\.env\b|api[_-]?key|secret|password|bearer\s+[a-z0-9._-]{8,}|sk-[a-z0-9]{16,})/i

const LONG_BASE64_RE = /[A-Za-z0-9+/]{80,}={0,2}/

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

function looksLikeJsonToolBody(text: string): boolean {
  const t = text.trim()
  if (!t.startsWith('{') && !t.startsWith('[')) return false
  try {
    JSON.parse(t)
    return true
  } catch {
    return t.includes('"ok"') && t.includes('"content"')
  }
}

/** Safe one-line activity detail for chat UI (no secrets or full tool JSON). */
export function sanitizeAgentActivityDetail(detail?: string): string | undefined {
  if (detail === undefined || detail === null) return undefined
  const trimmed = detail.trim()
  if (!trimmed) return undefined
  if (looksLikeJsonToolBody(trimmed)) return undefined

  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim().length > 0)
  const safeLines: string[] = []
  for (const line of lines) {
    if (SECRET_LINE_RE.test(line)) continue
    if (LONG_BASE64_RE.test(line)) continue
    safeLines.push(line)
    if (safeLines.length >= 3) break
  }
  if (safeLines.length === 0) return undefined
  return truncate(safeLines.join(' · '), AGENT_ACTIVITY_DETAIL_MAX_CHARS)
}

const TOOL_LABELS: Record<AgentChatToolName | 'retrieval', string> = {
  workspace_index: 'Workspace index',
  list_directory: 'List directory',
  read_file: 'Read file',
  search_workspace: 'Search workspace',
  search_replace: 'Search & replace (legacy)',
  edit: 'Edit',
  run_command: 'Run command',
  propose_file_edits: 'Propose edits',
  spawn_subagent: 'Subagent exploration',
  retrieval: 'Context retrieval',
}

export function agentActivityToolLabel(
  tool?: AgentChatActivityPayload['tool'],
): string | undefined {
  if (!tool) return undefined
  return TOOL_LABELS[tool]
}

/** @deprecated Prefer `agentActivitySummaryLabel` — trace-stable section key only. */
export function agentActivityPhaseLabel(chatMode?: 'fast' | 'plan'): string {
  return chatMode === 'plan' ? 'plan_tools' : 'work_tools'
}

export function agentActivitySectionTitle(chatMode?: 'fast' | 'plan'): string {
  return agentActivityPhaseLabel(chatMode)
}

export type AgentActivitySummaryLabelInput = {
  isLive: boolean
  hasRunning: boolean
  hasErrors: boolean
  chatMode?: 'fast' | 'plan'
}

/** One-line summary title for conversation-first activity strip (story 141; copy finalized in 142). */
export function agentActivitySummaryLabel(input: AgentActivitySummaryLabelInput): string {
  if (input.hasErrors) return 'Issue'
  if (input.isLive && input.hasRunning) return 'Working…'
  if (input.isLive) return 'Working…'
  return 'Finished'
}

/** Step count + optional inline issue chip for collapsed summary strip. */
export function agentActivitySummaryDetail(
  stepCount: number,
  errorSummary?: AgentActivityErrorSummary | null,
): string {
  const steps = `${stepCount} step${stepCount === 1 ? '' : 's'}`
  if (!errorSummary || errorSummary.count <= 0) return steps
  const issue =
    errorSummary.count === 1 ? '1 issue' : `${errorSummary.count} issues`
  return `${steps} · ${issue}`
}

/** Per tool_sample round title — user-facing step label (story 129 / 142). */
export function agentToolRoundActivityTitle(
  chatMode: 'fast' | 'plan',
  executeFromApprovedPlan: boolean,
  round: number,
  maxRounds: number,
): string {
  const step = `Step ${round} of ${maxRounds}`
  if (executeFromApprovedPlan) return `Running your plan · ${step}`
  if (chatMode === 'plan') return `Planning · ${step}`
  return step
}

export function agentToolRoundActivityDetail(
  round: number,
  maxRounds: number,
  executeFromApprovedPlan: boolean,
): string {
  if (executeFromApprovedPlan) {
    return `Round ${round}/${maxRounds} — large file proposals can take up to ~90s`
  }
  return `Round ${round}/${maxRounds}`
}

const COMPOSED_PRIOR_EDIT_RE = /composed with prior edit on ([^\s·]+)/i

function basenameFromPath(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? path
}

/** Group key for consecutive search_replace rows (story 119). */
export function activitySearchReplaceGroupKey(activity: AgentChatActivityPayload): string | null {
  if (activity.tool !== 'search_replace') return null
  if (activity.subjectPath) return activity.subjectPath
  const detail = activity.detail ?? ''
  const composed = detail.match(COMPOSED_PRIOR_EDIT_RE)
  if (composed?.[1]) return composed[1]
  return '__search_replace__'
}

function mergeCompactedActivityStatus(
  group: readonly AgentChatActivityPayload[],
): AgentChatActivityPayload['status'] {
  if (group.some((a) => a.status === 'error')) return 'error'
  if (group.some((a) => a.status === 'interrupted')) return 'interrupted'
  if (group.some((a) => a.status === 'running')) return 'running'
  return 'done'
}

function compactedSearchReplaceDetail(
  group: readonly AgentChatActivityPayload[],
): string | undefined {
  const errors = group.filter((a) => a.status === 'error')
  if (errors.length > 0) {
    const last = errors[errors.length - 1]
    return last.detail?.trim() || 'Search replace failed'
  }
  return 'Merged into one diff review'
}

/** Roll up consecutive same-path search_replace activities for honest activity UI (story 119). */
function compactSearchReplaceActivities(
  activities: readonly AgentChatActivityPayload[],
): AgentChatActivityPayload[] {
  const out: AgentChatActivityPayload[] = []
  let i = 0
  while (i < activities.length) {
    const current = activities[i]
    const key = activitySearchReplaceGroupKey(current)
    if (!key) {
      out.push(current)
      i += 1
      continue
    }
    const group: AgentChatActivityPayload[] = [current]
    let j = i + 1
    while (j < activities.length) {
      const next = activities[j]
      if (activitySearchReplaceGroupKey(next) !== key) break
      group.push(next)
      j += 1
    }
    if (group.length === 1) {
      out.push(current)
      i += 1
      continue
    }
    const labelPath = group.find((a) => a.subjectPath)?.subjectPath ?? key
    const label =
      labelPath === '__search_replace__' ? 'file' : basenameFromPath(labelPath)
    out.push({
      id: group[0].id,
      tool: 'search_replace',
      subjectPath: group.find((a) => a.subjectPath)?.subjectPath,
      title: `Search & replace ×${group.length} on ${label}`,
      detail: compactedSearchReplaceDetail(group),
      status: mergeCompactedActivityStatus(group),
    })
    i = j
  }
  return out
}

const EDIT_FAILURE_TITLES = new Set(['Edit proposal failed', 'Search replace failed', 'Edit failed'])

const EDIT_PROPOSAL_SUCCESS_TITLES = new Set([
  'Prepared edit proposal',
  'Prepared search_replace proposal',
])

const COMPACTED_EDIT_FAILURE_TITLE_RE = /^Edit (proposal )?failed ×\d+ on /

/** Story 155 — rolled-up edit failure row in the activity list. */
export function isCompactedEditFailureActivity(activity: AgentChatActivityPayload): boolean {
  return COMPACTED_EDIT_FAILURE_TITLE_RE.test(activity.title)
}

function normalizeActivityPathForGrouping(path: string): string {
  return path.replace(/\\/g, '/')
}

const EDIT_FAILURE_REASON_LABELS: ReadonlyArray<{ reason: string; label: string }> = [
  { reason: AGENT_EDIT_JAMMED_JS_FILE_REASON, label: 'Crushed JavaScript' },
  { reason: AGENT_EDIT_JAMMED_SCRIPT_REASON, label: 'Crushed script block' },
  { reason: AGENT_EDIT_RAW_CRUSHED_PREVALIDATION_REASON, label: 'Crushed content' },
  { reason: AGENT_EDIT_MALFORMED_JSX_REASON, label: 'Malformed JSX' },
  { reason: AGENT_EDIT_INCOMPLETE_TS_REASON, label: 'Incomplete TypeScript' },
  { reason: AGENT_EDIT_CORRUPT_JS_ORPHAN_PAREN_REASON, label: 'Corrupt JavaScript' },
  { reason: AGENT_EDIT_CORRUPT_CONTENT_REASON, label: 'Corrupt content' },
  { reason: AGENT_EDIT_INCOMPLETE_HTML_REASON, label: 'Incomplete HTML' },
  { reason: AGENT_EDIT_CORRUPT_ENCODING_REASON, label: 'Bad encoding' },
  { reason: AGENT_EDIT_HTML_ENTITY_ARTIFACT_REASON, label: 'HTML entity artifacts' },
  { reason: AGENT_EDIT_EMPTY_WRITE_REASON, label: 'Empty file body' },
  { reason: AGENT_EDIT_READ_BEFORE_WRITE_REASON, label: 'Read before write' },
  { reason: AGENT_EDIT_MISSING_CONTENT_HASH_REASON, label: 'Missing content hash' },
  { reason: AGENT_EDIT_STALE_HASH_REASON, label: 'Stale content hash' },
  { reason: AGENT_EDIT_MALFORMED_CONTENT_HASH_REASON, label: 'Invalid content hash' },
  { reason: AGENT_EDIT_CASCADE_GUARD_REASON, label: 'Large shrink blocked' },
  { reason: AGENT_EDIT_MINIMAL_SCAFFOLD_REQUIRED_REASON, label: 'Minimal scaffold required' },
  { reason: AGENT_EDIT_INVALID_JSON_MANIFEST_REASON, label: 'Invalid JSON manifest' },
  { reason: AGENT_EDIT_INCOMPLETE_JSON_MANIFEST_REASON, label: 'Incomplete JSON manifest' },
]

/** Short failure class for grouping and issue cards (story 155). */
export function normalizeEditFailureClass(detail?: string, title?: string): string {
  const haystack = [detail, title].filter(Boolean).join(' ')
  for (const { reason, label } of EDIT_FAILURE_REASON_LABELS) {
    if (haystack.includes(reason)) return label
  }
  if (/crushed|glued|minified/i.test(haystack)) return 'Crushed content'
  if (/incomplete|truncat/i.test(haystack)) return 'Incomplete content'
  if (/stale|content hash/i.test(haystack)) return 'Content hash mismatch'
  return 'Validation failed'
}

/** Resolved path for edit-failure grouping (story 155). */
export function resolveActivityEditFailurePath(activity: AgentChatActivityPayload): string | null {
  if (activity.subjectPath?.trim()) return activity.subjectPath.trim()
  const detail = activity.detail?.trim()
  if (!detail) return null
  const pathReason = detail.match(/^([^:]+):\s/)
  if (pathReason?.[1]) {
    const candidate = pathReason[1].trim()
    if (candidate.length > 0) return candidate
  }
  const beforeDot = detail.split(' · ')[0]?.trim()
  if (beforeDot && !beforeDot.includes(':') && /[./\\]/.test(beforeDot)) return beforeDot
  return null
}

function isEditFailureActivityRow(activity: AgentChatActivityPayload): boolean {
  if (!EDIT_FAILURE_TITLES.has(activity.title)) return false
  return (
    activity.status === 'error' ||
    activity.status === 'rejected' ||
    activity.status === 'timeout'
  )
}

/** Group key for consecutive edit-failure rows (story 155). */
export function activityEditFailureGroupKey(activity: AgentChatActivityPayload): string | null {
  if (!isEditFailureActivityRow(activity)) return null
  const path = resolveActivityEditFailurePath(activity)
  const pathKey = path ? normalizeActivityPathForGrouping(path) : '__unknown_path__'
  const failureClass = normalizeEditFailureClass(activity.detail, activity.title)
  const titleKind = activity.title
  return `${pathKey}|${failureClass}|${titleKind}`
}

function pathHasAcceptedProposalLater(
  sourceActivities: readonly AgentChatActivityPayload[],
  fromIndex: number,
  normalizedPath: string,
): boolean {
  for (let i = fromIndex + 1; i < sourceActivities.length; i += 1) {
    const row = sourceActivities[i]
    if (!EDIT_PROPOSAL_SUCCESS_TITLES.has(row.title) || row.status === 'error') continue
    const rowPath = resolveActivityEditFailurePath(row) ?? row.subjectPath
    if (rowPath && normalizeActivityPathForGrouping(rowPath) === normalizedPath) return true
  }
  return false
}

/** Disk outcome line for compact edit-failure cards (story 152 / 155). */
export function formatEditFailureDiskOutcome(input: {
  group: readonly AgentChatActivityPayload[]
  sourceActivities: readonly AgentChatActivityPayload[]
  lastGroupIndex: number
}): string {
  const path = resolveActivityEditFailurePath(input.group[0]!)
  const normalized = path ? normalizeActivityPathForGrouping(path) : null
  if (
    normalized &&
    pathHasAcceptedProposalLater(input.sourceActivities, input.lastGroupIndex, normalized)
  ) {
    return 'Pending review — not on disk yet'
  }
  return 'No file created or changed on disk'
}

function compactedEditFailureTitle(
  group: readonly AgentChatActivityPayload[],
  label: string,
): string {
  const count = group.length
  const first = group[0]!
  const prefix =
    first.tool === 'propose_file_edits' || first.title === 'Edit proposal failed'
      ? 'Edit proposal failed'
      : 'Edit failed'
  return `${prefix} ×${count} on ${label}`
}

function compactedEditFailureDetail(
  group: readonly AgentChatActivityPayload[],
  sourceActivities: readonly AgentChatActivityPayload[],
  lastGroupIndex: number,
): string {
  const last = group[group.length - 1]!
  const failureClass = normalizeEditFailureClass(last.detail, last.title)
  const diskOutcome = formatEditFailureDiskOutcome({ group, sourceActivities, lastGroupIndex })
  return `${failureClass} · ${diskOutcome}`
}

/** Roll up consecutive same-path/class edit failures (story 155). */
function compactEditFailureActivities(
  activities: readonly AgentChatActivityPayload[],
  sourceActivities: readonly AgentChatActivityPayload[],
): AgentChatActivityPayload[] {
  const out: AgentChatActivityPayload[] = []
  let i = 0
  while (i < activities.length) {
    const current = activities[i]
    const key = activityEditFailureGroupKey(current)
    if (!key) {
      out.push(current)
      i += 1
      continue
    }
    const group: AgentChatActivityPayload[] = [current]
    let j = i + 1
    while (j < activities.length) {
      const next = activities[j]
      if (activityEditFailureGroupKey(next) !== key) break
      group.push(next)
      j += 1
    }
    if (group.length === 1) {
      out.push(current)
      i += 1
      continue
    }
    const labelPath = resolveActivityEditFailurePath(group[0]!) ?? group[0]!.subjectPath
    const label = labelPath ? basenameFromPath(labelPath) : 'file'
    const lastSourceIndex = sourceActivities.indexOf(group[group.length - 1]!)
    out.push({
      id: group[0].id,
      tool: group[0].tool,
      subjectPath: group.find((a) => a.subjectPath)?.subjectPath ?? labelPath ?? undefined,
      title: compactedEditFailureTitle(group, label),
      detail: compactedEditFailureDetail(
        group,
        sourceActivities,
        lastSourceIndex >= 0 ? lastSourceIndex : sourceActivities.length - 1,
      ),
      status: mergeCompactedActivityStatus(group),
    })
    i = j
  }
  return out
}

/** Roll up consecutive search_replace and edit-failure activities for honest activity UI. */
export function compactAgentTurnActivities(
  activities: readonly AgentChatActivityPayload[],
): AgentChatActivityPayload[] {
  const afterSearchReplace = compactSearchReplaceActivities(activities)
  return compactEditFailureActivities(afterSearchReplace, activities)
}

export type RetrievalActivityCopyInput = {
  count: number
  greenfieldWorkspace: boolean
  details: readonly string[]
  stale?: boolean
  staleReason?: string
  sensitiveSkipped: number
}

/** Honest retrieval activity title/detail for chat UI (story 119). */

/** True when the turn recorded at least one failed edit-tool activity row (story 152). */
export function turnHadFailedEditActivities(
  activities: readonly AgentChatActivityPayload[],
): boolean {
  return activities.some(
    (a) => EDIT_FAILURE_TITLES.has(a.title) || isCompactedEditFailureActivity(a),
  )
}

/** True when the turn recorded an accepted edit proposal activity row (story 164). */
export function turnHadAcceptedEditProposal(
  activities: readonly AgentChatActivityPayload[],
): boolean {
  return activities.some(
    (a) => EDIT_PROPOSAL_SUCCESS_TITLES.has(a.title) && a.status !== 'error',
  )
}

const COMMAND_FAILURE_TITLES = new Set([
  'Command rejected',
  'Command failed',
  'Command blocked',
  'Command request failed',
])

export function isAgentActivityErrorRow(activity: AgentChatActivityPayload): boolean {
  return (
    activity.status === 'error' ||
    activity.status === 'rejected' ||
    activity.status === 'timeout' ||
    activity.status === 'interrupted' ||
    EDIT_FAILURE_TITLES.has(activity.title) ||
    isCompactedEditFailureActivity(activity) ||
    COMMAND_FAILURE_TITLES.has(activity.title)
  )
}

export type AgentActivityErrorSummary = {
  count: number
  labels: string[]
  topReason?: string
}

/** One-line error summary for live activity panels (story 125). */
export function summarizeAgentActivityErrors(
  activities: readonly AgentChatActivityPayload[],
): AgentActivityErrorSummary {
  const errorRows = activities.filter(isAgentActivityErrorRow)
  const labels = errorRows.map((activity) => {
    if (activity.subjectPath) return basenameFromPath(activity.subjectPath)
    const pathMatch = activity.detail?.match(/^[^\s·]+/)
    if (pathMatch?.[0]) return basenameFromPath(pathMatch[0])
    return activity.title
  })
  const uniqueLabels = [...new Set(labels)]
  const topReason =
    errorRows
      .map((activity) => sanitizeAgentActivityDetail(activity.detail))
      .find(Boolean) ?? undefined
  return { count: errorRows.length, labels: uniqueLabels, topReason }
}

export type CollapseCompletedMiddleRowsResult = {
  activities: AgentChatActivityPayload[]
  collapsedCount: number
}

/** Hide completed middle rows during long live turns; keep errors and trailing steps (story 125). */
export function collapseCompletedMiddleRows(
  activities: readonly AgentChatActivityPayload[],
  options: { keepLast?: number; keepErrors?: boolean } = {},
): CollapseCompletedMiddleRowsResult {
  const keepLast = options.keepLast ?? 2
  const keepErrors = options.keepErrors !== false
  if (activities.length <= 4) {
    return { activities: [...activities], collapsedCount: 0 }
  }

  const keep = new Set<number>()
  activities.forEach((activity, index) => {
    if (keepErrors && isAgentActivityErrorRow(activity)) keep.add(index)
  })
  for (let index = Math.max(0, activities.length - keepLast); index < activities.length; index += 1) {
    keep.add(index)
  }

  const sortedKeep = [...keep].sort((a, b) => a - b)
  let collapsedCount = 0
  const out: AgentChatActivityPayload[] = []
  let lastKept = -1
  for (const index of sortedKeep) {
    const gap = index - lastKept - 1
    if (gap > 0) {
      collapsedCount += gap
      out.push({
        id: `collapsed-${lastKept}-${index}`,
        title: `${gap} earlier step${gap === 1 ? '' : 's'} collapsed`,
        status: 'done',
      })
    }
    out.push(activities[index]!)
    lastKept = index
  }
  return { activities: out, collapsedCount }
}

export type { HarnessInterventionKind } from './agent-chat-contract'

export type HarnessInterventionKey =
  | 'scaffold_strategy'
  | 'search_replace_escalation'
  | 'post_scaffold_verify'
  | 'partial_batch'

const HARNESS_RECOVERED_DETAIL = 'Corrected on retry'

export type HarnessInterventionActivityCopy = {
  kind: HarnessInterventionKind
  title: string
  detail: string
}

/** Outcome-oriented harness intervention activity copy (story 134). */
export function harnessInterventionActivityCopy(input: {
  key: HarnessInterventionKey
  conflict?: ScaffoldConflictKind | null
  recovered?: boolean
}): HarnessInterventionActivityCopy {
  const recovered = input.recovered === true
  if (recovered) {
    return buildRecoveredHarnessInterventionCopy(input.key, input.conflict)
  }
  return buildPendingHarnessInterventionCopy(input.key, input.conflict)
}

function buildRecoveredHarnessInterventionCopy(
  key: HarnessInterventionKey,
  conflict: ScaffoldConflictKind | null | undefined,
): HarnessInterventionActivityCopy {
  switch (key) {
    case 'scaffold_strategy':
      return {
        kind: 'correction',
        title:
          conflict === 'hybrid_same_round'
            ? 'Scaffold routing: corrected'
            : conflict === 'edits_before_cli'
              ? 'Scaffold routing: CLI first'
              : conflict === 'cli_on_static'
                ? 'Scaffold routing: file proposals only'
                : 'Scaffold routing: corrected',
        detail: HARNESS_RECOVERED_DETAIL,
      }
    case 'search_replace_escalation':
      return {
        kind: 'correction',
        title: 'Edit path: full-file proposal',
        detail: HARNESS_RECOVERED_DETAIL,
      }
    case 'post_scaffold_verify':
      return {
        kind: 'correction',
        title: 'Scaffold output: verified',
        detail: HARNESS_RECOVERED_DETAIL,
      }
    case 'partial_batch':
      return {
        kind: 'correction',
        title: 'Edit batch: retry rejected paths',
        detail: HARNESS_RECOVERED_DETAIL,
      }
    default: {
      const _exhaustive: never = key
      return _exhaustive
    }
  }
}

function buildPendingHarnessInterventionCopy(
  key: HarnessInterventionKey,
  conflict: ScaffoldConflictKind | null | undefined,
): HarnessInterventionActivityCopy {
  switch (key) {
    case 'scaffold_strategy':
      if (conflict === 'hybrid_same_round') {
        return {
          kind: 'correction',
          title: 'Scaffold routing: one path per round',
          detail: 'CLI or file edits — model will re-sample',
        }
      }
      if (conflict === 'edits_before_cli') {
        return {
          kind: 'correction',
          title: 'Scaffold routing: CLI first',
          detail: 'Run scaffold command before hand-written template files',
        }
      }
      if (conflict === 'cli_on_static') {
        return {
          kind: 'correction',
          title: 'Scaffold routing: file proposals only',
          detail: 'Static plan — use `edit` (modifications) or propose_file_edits (new files), not hand-rolled without scaffold',
        }
      }
      return {
        kind: 'correction',
        title: 'Scaffold routing: one path per round',
        detail: 'Model will re-sample tools',
      }
    case 'search_replace_escalation':
      return {
        kind: 'correction',
        title: 'Edit path: full-file proposal',
        detail:
          'Edit tool failed repeatedly. Re-read rawContent and retry with precise `edit` {edits[]}, or clean propose_file_edits for new/large-refactor cases.',
      }
    case 'post_scaffold_verify':
      return {
        kind: 'correction',
        title: 'Scaffold output: verify files',
        detail: 'Read package.json and entry files to confirm the scaffold stack.',
      }
    case 'partial_batch':
      return {
        kind: 'correction',
        title: 'Edit batch: retry rejected paths',
        detail:
          'Some write_file ops were accepted; others failed validation. Resubmit complete bodies for rejected paths only.',
      }
    default: {
      const _exhaustive: never = key
      return _exhaustive
    }
  }
}

export function formatRetrievalActivityCopy(input: RetrievalActivityCopyInput): {
  title: string
  detail: string
} {
  const suffixParts: string[] = []
  if (input.stale) {
    suffixParts.push(`Warning: stale index (${input.staleReason ?? 'refresh recommended'})`)
  }
  if (input.sensitiveSkipped > 0) {
    suffixParts.push(`${input.sensitiveSkipped} sensitive file(s) excluded`)
  }
  const suffix = suffixParts.length > 0 ? suffixParts.join(' · ') : ''

  if (input.count === 0) {
    if (input.greenfieldWorkspace) {
      const base = 'Empty workspace — use list_directory and read_file'
      return {
        title: 'No indexed files yet',
        detail: suffix ? `${base} · ${suffix}` : base,
      }
    }
    const base = 'Try search_workspace or read_file on likely paths'
    return {
      title: 'No lexical matches',
      detail: suffix ? `${base} · ${suffix}` : base,
    }
  }

  const parts = [
    `${input.count} file${input.count === 1 ? '' : 's'}`,
    ...input.details.slice(0, 4),
    suffix,
  ].filter(Boolean)
  return {
    title: 'Found relevant workspace context',
    detail: parts.join(' · '),
  }
}

/** Diagnostic activity when edit tool budget is exhausted (story 140). */
export function editToolBudgetExhaustedActivityCopy(input: {
  totalFailures: number
  topFailurePathBasename?: string
  escalationIssued?: boolean
  postEscalationStall?: boolean
}): HarnessInterventionActivityCopy {
  const pathPart = input.topFailurePathBasename ? ` on ${input.topFailurePathBasename}` : ''
  const extras: string[] = []
  if (input.escalationIssued) extras.push('escalation issued')
  if (input.postEscalationStall) extras.push('post-escalation retries exhausted')
  const detail =
    `${input.totalFailures} search_replace failure(s)${pathPart}` +
    (extras.length > 0 ? ` · ${extras.join(' · ')}` : '')
  return {
    kind: 'info',
    title: 'Edit attempts paused',
    detail,
  }
}
