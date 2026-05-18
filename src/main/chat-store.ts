import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync } from 'fs'
import { dirname } from 'path'
import { CHAT_STORE_SCHEMA_VERSION } from '../shared/chat-thread-schema'
import { chatThreadPathForProject } from './app-project-store'

/**
 * Append-only JSONL chat log under the app project directory (`userData/workspace-projects/<id>/chat/`).
 */
export { CHAT_STORE_SCHEMA_VERSION }

export type ChatAttachmentPersisted = {
  type: 'file' | 'folder' | 'root' | 'diff'
  path?: string
  rootId?: string
}

/** Workspace roots as captured at send time (story 065 — multi-root visibility). */
export type ChatTurnContextRootV1 = {
  id: string
  label: string
  path: string
}

/**
 * Optional per-line context for chat / voice turns (persisted JSONL).
 * Renderer shows summary inline; paths and ids live behind Details.
 */
export type ChatTurnContextV1 = {
  source: 'text' | 'voice'
  modelIntent: 'chat_default' | 'planning' | 'voice'
  chatMode?: 'fast' | 'plan'
  activeRootId: string | null
  activeRootLabel: string | null
  activeFilePath: string | null
  roots: ChatTurnContextRootV1[]
}

/** One line in `thread.jsonl` (v1). */
export type PersistedChatLineV1 = {
  schemaVersion: typeof CHAT_STORE_SCHEMA_VERSION
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  /** ISO 8601 */
  timestamp: string
  model?: string
  attachments?: ChatAttachmentPersisted[]
  turnContext?: ChatTurnContextV1
}

export type LoadChatThreadResult =
  | { ok: true; messages: PersistedChatLineV1[]; wasCorrupt?: boolean }
  | { ok: false; error: string }

export type AppendChatMessageResult = { ok: true } | { ok: false; error: string }

export type ClearChatThreadResult = { ok: true } | { ok: false; error: string }

function threadFilePath(projectId: string): string {
  return chatThreadPathForProject(projectId)
}

function ensureChatDir(projectId: string): void {
  mkdirSync(dirname(threadFilePath(projectId)), { recursive: true })
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function validateAttachments(raw: unknown): ChatAttachmentPersisted[] | undefined {
  if (raw === undefined) return undefined
  if (!Array.isArray(raw)) return undefined
  const out: ChatAttachmentPersisted[] = []
  for (const item of raw) {
    if (!isPlainObject(item)) return undefined
    const t = item.type
    if (t !== 'file' && t !== 'folder' && t !== 'root' && t !== 'diff') return undefined
    const path = item.path
    const rootId = item.rootId
    if (path !== undefined && typeof path !== 'string') return undefined
    if (rootId !== undefined && typeof rootId !== 'string') return undefined
    out.push({ type: t, path, rootId })
  }
  return out
}

function validateTurnContext(raw: unknown): ChatTurnContextV1 | undefined {
  if (raw === undefined) return undefined
  if (!isPlainObject(raw)) return undefined
  const source = raw.source
  if (source !== 'text' && source !== 'voice') return undefined
  const modelIntent = raw.modelIntent
  if (modelIntent !== 'chat_default' && modelIntent !== 'planning' && modelIntent !== 'voice') return undefined
  if (source === 'text' && modelIntent === 'voice') return undefined
  if (source === 'voice' && modelIntent !== 'voice') return undefined
  const chatMode = raw.chatMode
  if (chatMode !== undefined && chatMode !== 'fast' && chatMode !== 'plan') return undefined
  if (source === 'text' && chatMode === undefined) return undefined
  if (source === 'voice' && chatMode !== undefined) return undefined

  const activeRootId =
    raw.activeRootId === null || raw.activeRootId === undefined
      ? null
      : typeof raw.activeRootId === 'string'
        ? raw.activeRootId
        : null
  if (activeRootId === null && raw.activeRootId !== null && raw.activeRootId !== undefined) return undefined

  const activeRootLabel =
    raw.activeRootLabel === null || raw.activeRootLabel === undefined
      ? null
      : typeof raw.activeRootLabel === 'string'
        ? raw.activeRootLabel
        : null
  if (activeRootLabel === null && raw.activeRootLabel !== null && raw.activeRootLabel !== undefined) return undefined

  const activeFilePath =
    raw.activeFilePath === null || raw.activeFilePath === undefined
      ? null
      : typeof raw.activeFilePath === 'string'
        ? raw.activeFilePath
        : null
  if (activeFilePath === null && raw.activeFilePath !== null && raw.activeFilePath !== undefined) return undefined

  const rootsRaw = raw.roots
  if (!Array.isArray(rootsRaw) || rootsRaw.length === 0) return undefined
  const roots: ChatTurnContextRootV1[] = []
  for (const item of rootsRaw) {
    if (!isPlainObject(item)) return undefined
    if (typeof item.id !== 'string' || !item.id.trim()) return undefined
    if (typeof item.label !== 'string' || !item.label.trim()) return undefined
    if (typeof item.path !== 'string') return undefined
    roots.push({ id: item.id.trim(), label: item.label.trim(), path: item.path })
  }

  return {
    source,
    modelIntent,
    chatMode: source === 'text' ? (chatMode as 'fast' | 'plan') : undefined,
    activeRootId,
    activeRootLabel,
    activeFilePath,
    roots,
  }
}

/** v1 → v2 migration hook (no v2 shape yet). */
export function migratePersistedLine(obj: unknown): PersistedChatLineV1 | null {
  if (!isPlainObject(obj)) return null
  const sv = obj.schemaVersion
  if (sv !== 1) return null
  if (typeof obj.id !== 'string' || !obj.id.trim()) return null
  if (obj.role !== 'user' && obj.role !== 'assistant' && obj.role !== 'system') return null
  if (typeof obj.content !== 'string') return null
  if (typeof obj.timestamp !== 'string' || !obj.timestamp.trim()) return null
  const model = obj.model === undefined ? undefined : typeof obj.model === 'string' ? obj.model : null
  if (model === null) return null
  const attachments = validateAttachments(obj.attachments)
  if (obj.attachments !== undefined && attachments === undefined) return null
  /** Invalid `turnContext` is dropped so one bad field does not wipe the thread. */
  const turnContext =
    obj.turnContext !== undefined ? validateTurnContext(obj.turnContext) : undefined
  return {
    schemaVersion: 1,
    id: obj.id,
    role: obj.role,
    content: obj.content,
    timestamp: obj.timestamp,
    model,
    attachments,
    ...(turnContext ? { turnContext } : {}),
  }
}

export function loadChatThread(projectId: string): LoadChatThreadResult {
  const filePath = threadFilePath(projectId)
  if (!existsSync(filePath)) {
    return { ok: true, messages: [] }
  }
  let raw: string
  try {
    raw = readFileSync(filePath, 'utf-8')
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to read chat log'
    return { ok: false, error: msg }
  }
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) {
    return { ok: true, messages: [] }
  }

  const messages: PersistedChatLineV1[] = []
  for (const line of lines) {
    let parsed: unknown
    try {
      parsed = JSON.parse(line) as unknown
    } catch {
      try {
        unlinkSync(filePath)
      } catch {
        /* ignore */
      }
      return { ok: true, messages: [], wasCorrupt: true }
    }
    const rec = migratePersistedLine(parsed)
    if (!rec) {
      try {
        unlinkSync(filePath)
      } catch {
        /* ignore */
      }
      return { ok: true, messages: [], wasCorrupt: true }
    }
    messages.push(rec)
  }

  return { ok: true, messages }
}

export function parseIncomingPersistPayload(data: unknown): PersistedChatLineV1 | null {
  return migratePersistedLine(data)
}

export function appendChatMessage(
  projectId: string,
  record: PersistedChatLineV1,
): AppendChatMessageResult {
  try {
    ensureChatDir(projectId)
    const filePath = threadFilePath(projectId)
    appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf-8')
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to append chat message'
    return { ok: false, error: msg }
  }
}

export function clearChatThread(projectId: string): ClearChatThreadResult {
  const filePath = threadFilePath(projectId)
  if (!existsSync(filePath)) {
    return { ok: true }
  }
  try {
    unlinkSync(filePath)
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to clear chat log'
    return { ok: false, error: msg }
  }
}
