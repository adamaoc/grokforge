import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { projectDir } from '../../main/project/store'
import {
  AGENT_TURN_TRACE_MAX_FILES,
  AgentTurnTraceV1Schema,
  type AgentTurnTraceV1,
} from '../../shared/agent/turn-trace-contract'
import type {
  ExportSanitizedAgentTurnTraceResult,
  GetLastAgentTurnTraceResult,
  ReplayAgentRetrievalPreviewResult,
} from '../../shared/agent/turn-trace-contract'
import type { GrokProjectManifest } from '../../main/project/manifest'
import { buildLexicalRetrievalContext } from '../tools/workspace-tools'
import type { AgentChatActiveContext } from '../../shared/agent/chat-contract'

function tracesDir(projectId: string): string {
  return join(projectDir(projectId), 'agent-traces')
}

function safeFilenamePart(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 64)
}

export function redactUserHomeInString(s: string): string {
  const home = homedir()
  if (!home || home.length < 2) return s
  const norm = home.replace(/\\/g, '/')
  const x = s.replace(/\\/g, '/')
  if (x.startsWith(norm + '/') || x === norm) {
    return `~/${x.slice(norm.length).replace(/^\//, '')}`
  }
  return s
}

function redactPathsInTrace(t: AgentTurnTraceV1): AgentTurnTraceV1 {
  const next = structuredClone(t) as AgentTurnTraceV1
  if (next.retrieval) {
    for (const f of next.retrieval.retrievedFiles) {
      f.path = redactUserHomeInString(f.path)
    }
  }
  return next
}

/** Extra redaction for clipboard / bug-report export (never include raw secrets patterns in strings). */
export function sanitizeTraceForExport(t: AgentTurnTraceV1): AgentTurnTraceV1 {
  const base = redactPathsInTrace(t)
  const json = JSON.stringify(base)
  const redacted = json
    .replace(/XAI_API_KEY|GROKFORGE_XAI_API_KEY|api[_-]?key/gi, '[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._-]{20,}/gi, 'Bearer [redacted]')
  return JSON.parse(redacted) as AgentTurnTraceV1
}

export function writeAgentTurnTrace(projectId: string, trace: AgentTurnTraceV1): void {
  const parsed = AgentTurnTraceV1Schema.safeParse(redactPathsInTrace(trace))
  if (!parsed.success) {
    console.warn('[GrokForge] agent turn trace validation failed:', parsed.error.flatten())
    return
  }
  const dir = tracesDir(projectId)
  mkdirSync(dir, { recursive: true })
  const name = `trace-${Date.now()}-${safeFilenamePart(parsed.data.streamId)}-${parsed.data.traceId.slice(0, 8)}.json`
  writeFileSync(join(dir, name), JSON.stringify(parsed.data, null, 2), 'utf8')
  pruneTraces(dir, AGENT_TURN_TRACE_MAX_FILES)
}

function pruneTraces(dir: string, keep: number): void {
  if (!existsSync(dir)) return
  const files = readdirSync(dir).filter((f) => f.startsWith('trace-') && f.endsWith('.json'))
  const scored = files
    .map((f) => {
      try {
        return { f, m: statSync(join(dir, f)).mtimeMs }
      } catch {
        return { f, m: 0 }
      }
    })
    .sort((a, b) => b.m - a.m)
  for (const x of scored.slice(keep)) {
    try {
      unlinkSync(join(dir, x.f))
    } catch {
      /* ignore */
    }
  }
}

export function readLatestAgentTurnTrace(projectId: string): AgentTurnTraceV1 | null {
  const dir = tracesDir(projectId)
  if (!existsSync(dir)) return null
  const files = readdirSync(dir).filter((f) => f.startsWith('trace-') && f.endsWith('.json'))
  if (files.length === 0) return null
  const sorted = files
    .map((f) => {
      try {
        return { f, m: statSync(join(dir, f)).mtimeMs }
      } catch {
        return { f, m: 0 }
      }
    })
    .sort((a, b) => b.m - a.m)
  for (const { f } of sorted) {
    try {
      const raw = JSON.parse(readFileSync(join(dir, f), 'utf8')) as unknown
      const parsed = AgentTurnTraceV1Schema.safeParse(raw)
      if (parsed.success) return parsed.data
    } catch {
      /* try next */
    }
  }
  return null
}

export function getLastAgentTurnTraceForProject(projectId: string): GetLastAgentTurnTraceResult {
  try {
    return { ok: true, trace: readLatestAgentTurnTrace(projectId) }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to read trace'
    return { ok: false, error: msg }
  }
}

export function exportSanitizedAgentTurnTraceJson(projectId: string): ExportSanitizedAgentTurnTraceResult {
  const t = readLatestAgentTurnTrace(projectId)
  if (!t) return { ok: false, error: 'No agent turn trace found for this project.' }
  try {
    const sanitized = sanitizeTraceForExport(t)
    return { ok: true, json: JSON.stringify(sanitized, null, 2) }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Export failed'
    return { ok: false, error: msg }
  }
}

export function replayRetrievalPreviewFromLatestTrace(
  projectId: string,
  manifest: GrokProjectManifest,
): ReplayAgentRetrievalPreviewResult {
  const t = readLatestAgentTurnTrace(projectId)
  if (!t) return { ok: false, error: 'No agent turn trace found.' }
  const ac = new AbortController()
  try {
    const active = t.activeContext as AgentChatActiveContext
    const retrieval = buildLexicalRetrievalContext(
      { projectId, manifest, activeContext: active, abortSignal: ac.signal },
      t.userText,
    )
    return {
      ok: true,
      count: retrieval.count,
      details: retrieval.details,
      stale: retrieval.stale,
      staleReason: retrieval.staleReason,
      skipped: retrieval.skipped,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Replay failed'
    return { ok: false, error: msg }
  }
}
