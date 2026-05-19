import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { AgentTurnTraceV1 } from '../shared/agent-turn-trace-contract'
import {
  AGENT_THREAD_MEMORY_SCHEMA_VERSION,
  AgentThreadMemoryV1Schema,
  type AgentThreadMemoryV1,
} from '../shared/agent-thread-memory-contract'
import { emptyThreadMemory, mergeTraceIntoThreadMemory } from '../shared/agent-thread-memory'
import { chatThreadPathForProject } from './app-project-store'

function threadMemoryPath(projectId: string): string {
  return resolve(dirname(chatThreadPathForProject(projectId)), 'thread-memory.json')
}

export function loadThreadMemory(projectId: string): AgentThreadMemoryV1 {
  const filePath = threadMemoryPath(projectId)
  if (!existsSync(filePath)) {
    return emptyThreadMemory()
  }
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown
    const parsed = AgentThreadMemoryV1Schema.safeParse(raw)
    if (!parsed.success) return emptyThreadMemory()
    return parsed.data
  } catch {
    return emptyThreadMemory()
  }
}

export function saveThreadMemory(projectId: string, memory: AgentThreadMemoryV1): void {
  const filePath = threadMemoryPath(projectId)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(memory, null, 2), 'utf-8')
}

export function clearThreadMemory(projectId: string): void {
  const filePath = threadMemoryPath(projectId)
  if (!existsSync(filePath)) return
  try {
    unlinkSync(filePath)
  } catch {
    /* ignore */
  }
}

export function appendTraceToThreadMemory(projectId: string, trace: AgentTurnTraceV1): AgentThreadMemoryV1 {
  const current = loadThreadMemory(projectId)
  const next = mergeTraceIntoThreadMemory(current, trace)
  saveThreadMemory(projectId, next)
  return next
}

export { AGENT_THREAD_MEMORY_SCHEMA_VERSION }
