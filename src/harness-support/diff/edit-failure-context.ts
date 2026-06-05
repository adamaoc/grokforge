export const AGENT_EDIT_FAILURE_PREFIX = '[GrokForge edit failure]'

export const AGENT_EDIT_FAILURE_MAX_STORED = 5
export const AGENT_EDIT_FAILURE_MAX_SNAPSHOT = 3
export const AGENT_EDIT_FAILURE_MAX_PATHS_LISTED = 24

export type AgentEditFailureKind =
  | 'apply_conflict'
  | 'apply_skipped'
  | 'apply_error'
  | 'validate_rejected'
  | 'discarded_after_review'

export type AgentEditFailurePath = {
  path: string
  reason: string
}

export type AgentEditFailureEvent = {
  kind: AgentEditFailureKind
  paths: AgentEditFailurePath[]
  summary?: string
}

export type BuildFixFailedEditFollowUpInput = {
  event: AgentEditFailureEvent
  originalUserRequest?: string
}

const MAX_SUMMARY_CHARS = 2_000
const MAX_USER_REQUEST_CHARS = 4_000

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

const KIND_LABELS: Record<AgentEditFailureKind, string> = {
  apply_conflict: 'Apply conflict (file changed on disk since review)',
  apply_skipped: 'Apply skipped (path rejected by GrokForge)',
  apply_error: 'Apply failed',
  validate_rejected: 'Proposal validation rejected paths',
  discarded_after_review: 'User discarded the diff review without applying',
}

export function isAgentEditFailureSystemMessage(content: string): boolean {
  return content.trimStart().startsWith(AGENT_EDIT_FAILURE_PREFIX)
}

export function formatAgentEditFailureSystemMessage(event: AgentEditFailureEvent): string {
  const lines: string[] = [
    AGENT_EDIT_FAILURE_PREFIX,
    `Kind: ${event.kind}`,
    `Summary: ${KIND_LABELS[event.kind]}`,
  ]

  if (event.summary?.trim()) {
    lines.push(`Detail: ${truncate(event.summary.trim(), MAX_SUMMARY_CHARS)}`)
  }

  const listed = event.paths.slice(0, AGENT_EDIT_FAILURE_MAX_PATHS_LISTED)
  if (listed.length > 0) {
    lines.push('', 'Paths:')
    for (const item of listed) {
      lines.push(`- ${item.path}: ${item.reason}`)
    }
    if (event.paths.length > AGENT_EDIT_FAILURE_MAX_PATHS_LISTED) {
      lines.push(`- …and ${event.paths.length - AGENT_EDIT_FAILURE_MAX_PATHS_LISTED} more`)
    }
  }

  lines.push(
    '',
    'Next steps for the agent:',
    '1. Call read_file on each path you will modify (use contentHash from the result).',
    '2. Propose a corrected `edit` (preferred) or search_replace with expectedContentHash.',
    '3. Make the smallest change that fixes the failure; do not repeat the same broken proposal.',
  )

  return lines.join('\n')
}

export function buildFixFailedEditFollowUpMessage(
  input: BuildFixFailedEditFollowUpInput,
): string {
  const { event } = input
  const lines: string[] = [
    'My previous edit attempt failed in GrokForge. Please read the failure details and propose a corrected edit.',
    '',
    `Failure: ${KIND_LABELS[event.kind]}`,
  ]

  if (event.summary?.trim()) {
    lines.push(truncate(event.summary.trim(), MAX_SUMMARY_CHARS))
  }

  if (input.originalUserRequest?.trim()) {
    lines.push('', 'Original request (still what I want):')
    lines.push(truncate(input.originalUserRequest.trim(), MAX_USER_REQUEST_CHARS))
  }

  const listed = event.paths.slice(0, AGENT_EDIT_FAILURE_MAX_PATHS_LISTED)
  if (listed.length > 0) {
    lines.push('', 'Affected paths:')
    for (const item of listed) {
      lines.push(`- ${item.path}: ${item.reason}`)
    }
    if (event.paths.length > AGENT_EDIT_FAILURE_MAX_PATHS_LISTED) {
      lines.push(`- …and ${event.paths.length - AGENT_EDIT_FAILURE_MAX_PATHS_LISTED} more`)
    }
  }

  lines.push(
    '',
    'Before proposing again:',
    '1. Call read_file on each existing file you will modify in this same turn (use contentHash from the result).',
    '2. Use expectedContentHash on `edit` (primary), search_replace (legacy), and propose_file_edits writes for existing files.',
    '3. Make the smallest faithful change; do not repeat the same full-file rewrite unless required.',
  )

  return lines.join('\n')
}

export type PrunableEditFailureMessage = {
  id: string
  role: string
  content: string
}

/** Keep only the last `max` failure system messages; drop older failure lines from the list. */
export function pruneEditFailureMessages<T extends PrunableEditFailureMessage>(
  messages: T[],
  max: number = AGENT_EDIT_FAILURE_MAX_STORED,
): T[] {
  const failureIndices: number[] = []
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    if (m?.role === 'system' && isAgentEditFailureSystemMessage(m.content)) {
      failureIndices.push(i)
    }
  }
  if (failureIndices.length <= max) return messages
  const drop = new Set(failureIndices.slice(0, failureIndices.length - max))
  return messages.filter((_, i) => !drop.has(i))
}
