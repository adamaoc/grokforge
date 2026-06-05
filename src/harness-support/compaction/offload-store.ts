import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { realpathSync } from 'node:fs'
import { AGENT_CONTEXT_OFFLOAD } from './context-offload'
import { projectDir } from '../../main/app-project-store'

const OFFLOAD_SEGMENT = 'agent-offload'

export function agentOffloadTurnDir(projectId: string, streamId: string): string {
  return resolve(join(projectDir(projectId), OFFLOAD_SEGMENT, streamId))
}

export function agentOffloadFilePath(projectId: string, streamId: string, toolCallId: string): string {
  const safeId = toolCallId.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 200) || 'tool'
  return resolve(join(agentOffloadTurnDir(projectId, streamId), `${safeId}.txt`))
}

export function isPathUnderProjectAgentOffload(candidateAbs: string, projectId: string): boolean {
  try {
    let baseReal = resolve(join(projectDir(projectId), OFFLOAD_SEGMENT))
    try {
      baseReal = resolve(realpathSync(baseReal))
    } catch {
      /* use resolved path */
    }
    let abs: string
    try {
      abs = resolve(realpathSync(candidateAbs))
    } catch {
      abs = resolve(candidateAbs)
    }
    const rel = relative(baseReal, abs)
    return Boolean(rel) && !rel.startsWith('..') && !isAbsolute(rel)
  } catch {
    return false
  }
}

export function offloadRelPathForTrace(projectId: string, absPath: string): string {
  const base = resolve(join(projectDir(projectId), OFFLOAD_SEGMENT))
  const rel = relative(base, resolve(absPath))
  return rel.startsWith('..') ? basenameOnly(absPath) : rel
}

function basenameOnly(p: string): string {
  const parts = p.split(/[/\\]/)
  return parts[parts.length - 1] ?? p
}

export function writeAgentOffloadFile(input: {
  projectId: string
  streamId: string
  toolCallId: string
  content: string
}): { absPath: string; sha256: string; lineCount: number } {
  const absPath = agentOffloadFilePath(input.projectId, input.streamId, input.toolCallId)
  mkdirSync(agentOffloadTurnDir(input.projectId, input.streamId), { recursive: true })
  writeFileSync(absPath, input.content, 'utf8')
  const sha256 = createHash('sha256').update(input.content, 'utf8').digest('hex')
  const lineCount = input.content.split(/\r?\n/).length
  return { absPath, sha256, lineCount }
}

/** Best-effort delete of offload files older than maxAgeMs under the project. */
export function pruneStaleAgentOffloads(
  projectId: string,
  maxAgeMs: number = AGENT_CONTEXT_OFFLOAD.pruneMaxAgeMs,
): number {
  const root = resolve(join(projectDir(projectId), OFFLOAD_SEGMENT))
  let removed = 0
  const cutoff = Date.now() - maxAgeMs
  try {
    if (!statSync(root).isDirectory()) return 0
  } catch {
    return 0
  }

  const walk = (dir: string): void => {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const name of entries) {
      const full = join(dir, name)
      try {
        const st = statSync(full)
        if (st.isDirectory()) {
          walk(full)
          try {
            if (readdirSync(full).length === 0) rmSync(full, { recursive: true })
          } catch {
            /* ignore */
          }
        } else if (st.isFile() && st.mtimeMs < cutoff) {
          rmSync(full)
          removed += 1
        }
      } catch {
        /* ignore */
      }
    }
  }

  walk(root)
  return removed
}
