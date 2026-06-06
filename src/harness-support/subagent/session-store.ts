import { randomUUID } from 'node:crypto'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type {
  AgentSubagentSessionLine,
  AgentSubagentSessionMeta,
  SubagentResultArtifact,
  SubagentSessionStatus,
} from './contracts/subagent-contract'
import { projectDir } from '../../main/project/store'

const SESSIONS_SEGMENT = 'agent-sessions'

export function agentSessionsRootForProject(projectId: string): string {
  return resolve(join(projectDir(projectId), SESSIONS_SEGMENT))
}

export function childSessionJsonlPath(projectId: string, childSessionId: string): string {
  return resolve(join(agentSessionsRootForProject(projectId), `${childSessionId}.jsonl`))
}

export function newChildSessionId(): string {
  return randomUUID()
}

export function initChildSessionFile(projectId: string, meta: AgentSubagentSessionMeta): void {
  const dir = agentSessionsRootForProject(projectId)
  mkdirSync(dir, { recursive: true })
  const path = childSessionJsonlPath(projectId, meta.childSessionId)
  writeFileSync(path, `${JSON.stringify(meta)}\n`, 'utf8')
}

export function appendSessionEvent(projectId: string, childSessionId: string, event: AgentSubagentSessionLine): void {
  const path = childSessionJsonlPath(projectId, childSessionId)
  appendFileSync(path, `${JSON.stringify(event)}\n`, 'utf8')
}

export function finalizeSession(
  projectId: string,
  childSessionId: string,
  status: SubagentSessionStatus,
  input?: { artifact?: SubagentResultArtifact; error?: string },
): void {
  const at = new Date().toISOString()
  if (input?.artifact) {
    appendSessionEvent(projectId, childSessionId, { type: 'summary', at, artifact: input.artifact })
  }
  appendSessionEvent(projectId, childSessionId, {
    type: 'terminal',
    at,
    status,
    error: input?.error,
  })
}

export function loadSessionEvents(projectId: string, childSessionId: string): AgentSubagentSessionLine[] {
  try {
    const raw = readFileSync(childSessionJsonlPath(projectId, childSessionId), 'utf8')
    const lines = raw.split('\n').filter((line) => line.trim().length > 0)
    return lines.map((line) => JSON.parse(line) as AgentSubagentSessionLine)
  } catch {
    return []
  }
}
