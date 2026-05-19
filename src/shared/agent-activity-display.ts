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
  retrieval: 'Context retrieval',
}

export function agentActivityToolLabel(
  tool?: AgentChatActivityPayload['tool'],
): string | undefined {
  if (!tool) return undefined
  return TOOL_LABELS[tool]
}

export function agentActivityPhaseLabel(chatMode?: 'fast' | 'plan'): string {
  return chatMode === 'plan' ? 'Plan · tools' : 'Tools used'
}

export function agentActivitySectionTitle(chatMode?: 'fast' | 'plan'): string {
  return agentActivityPhaseLabel(chatMode)
}
