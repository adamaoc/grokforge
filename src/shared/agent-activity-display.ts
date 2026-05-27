import type { AgentChatActivityPayload, AgentChatToolName } from './agent-chat-contract'

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
  search_replace: 'Search & replace',
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

export function agentActivityPhaseLabel(chatMode?: 'fast' | 'plan'): string {
  return chatMode === 'plan' ? 'Plan · tools' : 'Work · tools'
}

export function agentActivitySectionTitle(chatMode?: 'fast' | 'plan'): string {
  return agentActivityPhaseLabel(chatMode)
}

/** Per tool_sample round title — Work mode must not read as "Planning" (story 129). */
export function agentToolRoundActivityTitle(
  chatMode: 'fast' | 'plan',
  executeFromApprovedPlan: boolean,
): string {
  if (executeFromApprovedPlan) return 'Executing plan (model)'
  if (chatMode === 'plan') return 'Plan tool round'
  return 'Work tool round'
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

/** Roll up consecutive same-path search_replace activities for honest activity UI. */
export function compactAgentTurnActivities(
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

export type RetrievalActivityCopyInput = {
  count: number
  greenfieldWorkspace: boolean
  details: readonly string[]
  stale?: boolean
  staleReason?: string
  sensitiveSkipped: number
}

/** Honest retrieval activity title/detail for chat UI (story 119). */
const EDIT_FAILURE_TITLES = new Set(['Edit proposal failed', 'Search replace failed'])
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
