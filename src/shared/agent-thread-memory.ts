import type { AgentTurnTraceV1 } from './agent-turn-trace-contract'
import {
  AGENT_THREAD_MEMORY_MAX_CHARS,
  AGENT_THREAD_MEMORY_MAX_DECISIONS,
  AGENT_THREAD_MEMORY_MAX_FILES_READ,
  type AgentThreadMemoryV1,
} from './agent-thread-memory-contract'

const PATH_IN_TITLE_RE = /(?:^|[\s(])(\/[^\s)]+|[A-Za-z]:\\[^\s)]+)/

function extractPathFromToolStep(step: AgentTurnTraceV1['toolSteps'][number]): string | null {
  const title = step.displayTitle ?? ''
  const fromTitle = title.match(PATH_IN_TITLE_RE)?.[1]
  if (fromTitle) return fromTitle.trim()
  if (step.name === 'read_file' && step.ok && title) {
    const readMatch = title.match(/:\s*(.+)$/)
    if (readMatch?.[1]) return readMatch[1].trim()
  }
  return null
}

function decisionLineFromStep(step: AgentTurnTraceV1['toolSteps'][number]): string | null {
  if (!step.ok) return null
  const title = (step.displayTitle ?? step.name).trim()
  if (!title) return null
  if (
    step.name === 'read_file' ||
    step.name === 'list_directory' ||
    step.name === 'workspace_index' ||
    step.name === 'search_workspace'
  ) {
    return null
  }
  if (title.length > 200) return `${title.slice(0, 199)}…`
  return title
}

export function emptyThreadMemory(updatedAt = new Date().toISOString()): AgentThreadMemoryV1 {
  return {
    schemaVersion: 1,
    filesRead: [],
    decisions: [],
    updatedAt,
  }
}

export function mergeTraceIntoThreadMemory(
  memory: AgentThreadMemoryV1,
  trace: AgentTurnTraceV1,
): AgentThreadMemoryV1 {
  const filesRead = [...memory.filesRead]
  const decisions = [...memory.decisions]
  const fileSeen = new Set(filesRead.map((p) => p.toLowerCase()))
  const decisionSeen = new Set(decisions.map((d) => d.toLowerCase()))

  for (const step of trace.toolSteps) {
    if (step.name === 'read_file' && step.ok) {
      const path = extractPathFromToolStep(step)
      if (path) {
        const key = path.toLowerCase()
        if (!fileSeen.has(key)) {
          fileSeen.add(key)
          filesRead.push(path)
        }
      }
    }
    const decision = decisionLineFromStep(step)
    if (decision) {
      const key = decision.toLowerCase()
      if (!decisionSeen.has(key)) {
        decisionSeen.add(key)
        decisions.push(decision)
      }
    }
  }

  return {
    schemaVersion: 1,
    filesRead: filesRead.slice(-AGENT_THREAD_MEMORY_MAX_FILES_READ),
    decisions: decisions.slice(-AGENT_THREAD_MEMORY_MAX_DECISIONS),
    updatedAt: trace.completedAt || new Date().toISOString(),
  }
}

export function formatThreadMemoryBlock(memory: AgentThreadMemoryV1): string {
  if (memory.filesRead.length === 0 && memory.decisions.length === 0) {
    return ''
  }
  const lines: string[] = ['## Thread memory (this project chat)']
  lines.push(
    'Lightweight session continuity from prior agent turns. Re-read files if they may have changed on disk.',
  )
  if (memory.filesRead.length > 0) {
    lines.push('', 'Files read earlier in this thread:')
    for (const path of memory.filesRead) {
      lines.push(`- ${path}`)
    }
  }
  if (memory.decisions.length > 0) {
    lines.push('', 'Recent tool outcomes / decisions:')
    for (const item of memory.decisions) {
      lines.push(`- ${item}`)
    }
  }
  const text = lines.join('\n')
  if (text.length <= AGENT_THREAD_MEMORY_MAX_CHARS) return text
  return `${text.slice(0, AGENT_THREAD_MEMORY_MAX_CHARS - 1)}…`
}
