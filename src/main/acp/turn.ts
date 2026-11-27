import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type {
  AgentApprovalDecision,
  AgentChatActivityPayload,
  AgentChatEventPayload,
  AgentChatStartPayload,
  AgentApprovalRequest,
  AgentPermissionDiff,
  ReviewMode,
} from '../../shared/agent/chat-contract'
import type { AgentProviderId } from '../../shared/agent/provider-contract'
import type { GrokProjectManifest, Root } from '../project/manifest'
import { assertWritableWorkspacePath, isPathWithinWorkspaceRoots } from '../workspace/path-guard'
import { ACP_AUTH_REQUIRED, JsonRpcError } from './json-rpc'
import type { AcpClientHandlers } from './connection'
import type {
  AcpContentBlock,
  AcpPermissionOption,
  AcpRequestPermissionParams,
  AcpRequestPermissionResult,
  AcpSessionNotification,
  AcpToolCallFields,
} from './protocol'
import type { ManagedAcpSession } from './session-manager'

/**
 * Runs one GrokForge chat turn against an external ACP agent and translates the agent's
 * stream into the existing `AgentChatEventPayload` contract the renderer already renders
 * (activity rows, approval cards, streamed markdown).
 *
 * Review model:
 * - Trust: the agent runs in its "ask first" mode; every edit / command permission becomes
 *   an approval card with the proposed diff.
 * - Velocity: edits are auto-allowed; commands and deletes still ask.
 * - Plan: the agent's own plan mode when it has one, otherwise a plan-only instruction.
 */

export type AcpTurnDeps = {
  emit: (payload: AgentChatEventPayload) => void
  /** Shows an approval card and resolves with the user's choice (rejects on abort). */
  requestApproval: (
    request: AgentApprovalRequest,
    signal: AbortSignal,
  ) => Promise<AgentApprovalDecision>
  /** Agent changed files on disk (via GrokForge fs or its own tools). */
  onFilesChanged?: (absPaths: string[]) => void
  /** Runs after the agent finishes and before `done` is emitted (e.g. report turn changes). */
  beforeDone?: () => Promise<void>
  newRequestId?: () => string
}

export type AcpTurnInput = {
  payload: AgentChatStartPayload
  manifest: GrokProjectManifest
  root: Root
  providerId: AgentProviderId
  providerLabel: string
  loginHint: string
  session: ManagedAcpSession
  /** True when this ACP session has not seen earlier messages of the GrokForge thread. */
  sessionIsFresh: boolean
  signal: AbortSignal
}

const CANCEL_GRACE_MS = 5_000
const MAX_DIFF_CHARS = 200_000
const MAX_HISTORY_MESSAGES = 8
const MAX_HISTORY_CHARS_PER_MESSAGE = 1_500

type ApprovalKind = AgentApprovalRequest['kind']

export class AcpTurnError extends Error {}

export function pickSessionModeId(
  available: readonly { id: string }[] | undefined,
  chatMode: 'fast' | 'plan',
  temperament: ReviewMode,
): string | null {
  if (!available?.length) return null
  const ids = new Set(available.map((m) => m.id))
  const wanted =
    chatMode === 'plan'
      ? ['plan']
      : temperament === 'velocity'
        ? ['acceptEdits', 'accept-edits', 'auto-edit', 'autoEdit']
        : ['default', 'ask', 'manual', 'normal']
  return wanted.find((id) => ids.has(id)) ?? null
}

/** Auto-answer permissions that the current temperament does not need a human for. */
export function shouldAutoAllow(kind: string | null | undefined, temperament: ReviewMode): boolean {
  const k = kind ?? 'other'
  if (k === 'read' || k === 'search' || k === 'think') return true
  if (temperament !== 'velocity') return false
  return k === 'edit' || k === 'move' || k === 'fetch' || k === 'switch_mode'
}

export function pickPermissionOption(
  options: readonly AcpPermissionOption[],
  allow: boolean,
): AcpPermissionOption | null {
  const order = allow ? ['allow_once', 'allow_always'] : ['reject_once', 'reject_always']
  for (const kind of order) {
    const hit = options.find((o) => o.kind === kind)
    if (hit) return hit
  }
  const prefix = allow ? 'allow' : 'reject'
  return options.find((o) => String(o.kind).startsWith(prefix)) ?? null
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n… (truncated)` : text
}

function textOfContentBlock(block: AcpContentBlock | undefined): string {
  if (!block || block.type !== 'text') return ''
  return typeof block.text === 'string' ? block.text : ''
}

function rawInputString(raw: unknown, key: string): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const v = (raw as Record<string, unknown>)[key]
  return typeof v === 'string' && v.trim() ? v : undefined
}

function displayPath(absPath: string, roots: readonly Root[]): string {
  for (const root of roots) {
    const rel = relative(resolve(root.path), resolve(absPath))
    if (rel && !rel.startsWith('..') && !isAbsolute(rel)) {
      return roots.length > 1 ? `${root.label || root.id}/${rel}` : rel
    }
  }
  return absPath
}

export function collectDiffs(fields: AcpToolCallFields): AgentPermissionDiff[] {
  const out: AgentPermissionDiff[] = []
  for (const item of fields.content ?? []) {
    if (item.type !== 'diff') continue
    out.push({
      path: item.path,
      oldText: item.oldText == null ? null : truncate(item.oldText, MAX_DIFF_CHARS),
      newText: truncate(item.newText, MAX_DIFF_CHARS),
    })
  }
  return out
}

/**
 * Agents often send old/new *snippets* (Claude's Edit tool). Locate each snippet in the file
 * on disk so the review card can show real line numbers.
 */
export async function addSnippetLineNumbers(
  diffs: AgentPermissionDiff[],
  roots: readonly Root[],
): Promise<void> {
  for (const d of diffs) {
    if (!d.oldText) continue
    const abs = resolve(d.path)
    if (!isPathWithinWorkspaceRoots(abs, roots)) continue
    try {
      const content = await readFile(abs, 'utf8')
      if (content === d.oldText) continue
      const at = content.indexOf(d.oldText)
      if (at > 0) d.startLine = content.slice(0, at).split('\n').length
    } catch {
      // New or unreadable file: keep snippet-relative numbers.
    }
  }
}

function approvalKindFor(fields: AcpToolCallFields, diffs: AgentPermissionDiff[]): ApprovalKind {
  if (diffs.length > 0 || fields.kind === 'edit' || fields.kind === 'delete' || fields.kind === 'move') {
    return 'edit'
  }
  if (fields.kind === 'execute') return 'command'
  return 'permission'
}

function buildContextText(input: AcpTurnInput, planFallback: boolean): string {
  const { payload, manifest, root } = input
  const ctx = payload.activeContext
  const lines: string[] = []

  if (manifest.roots.length > 1) {
    const others = manifest.roots
      .filter((r) => r.id !== root.id)
      .map((r) => `- ${r.label || r.id}: ${r.path}`)
    lines.push(`Other workspace roots in this project:\n${others.join('\n')}`)
  }
  if (ctx.activeFilePath) lines.push(`File open in the editor: ${ctx.activeFilePath}`)
  if (ctx.editorSelection?.text) {
    const sel = ctx.editorSelection
    lines.push(
      `Selected lines ${sel.startLine}-${sel.endLine} of ${sel.path}${sel.truncated ? ' (truncated)' : ''}:\n\`\`\`\n${sel.text}\n\`\`\``,
    )
  }
  const dirty = ctx.openTabs.filter((t) => t.dirty).map((t) => t.path)
  if (dirty.length) {
    lines.push(`Open tabs with unsaved changes (disk may be stale): ${dirty.join(', ')}`)
  }
  if (input.sessionIsFresh) {
    const history = payload.threadSnapshot
      .filter((m) => m.role !== 'system' && m.content.trim())
      .slice(-MAX_HISTORY_MESSAGES)
    if (history.length) {
      const rendered = history
        .map((m) => `${m.role}: ${truncate(m.content.trim(), MAX_HISTORY_CHARS_PER_MESSAGE)}`)
        .join('\n\n')
      lines.push(`Earlier messages in this GrokForge thread (from another agent session):\n${rendered}`)
    }
  }
  if (planFallback) {
    lines.push(
      'GrokForge is in Plan mode: do not modify files or run mutating commands. Explore as needed, then reply with a concise numbered implementation plan.',
    )
  }
  return lines.join('\n\n')
}

export function buildPromptBlocks(input: AcpTurnInput, planFallback: boolean): AcpContentBlock[] {
  const context = buildContextText(input, planFallback)
  const text = context
    ? `${input.payload.userText}\n\n<grokforge-context>\n${context}\n</grokforge-context>`
    : input.payload.userText
  const blocks: AcpContentBlock[] = [{ type: 'text', text }]
  for (const att of input.payload.activeContext.attachments ?? []) {
    if (att.type !== 'file') continue
    blocks.push({
      type: 'resource_link',
      uri: pathToFileURL(att.path).href,
      name: att.displayName || basename(att.path),
      ...(att.mediaType ? { mimeType: att.mediaType } : {}),
    })
  }
  return blocks
}

function activityStatus(
  status: AcpToolCallFields['status'],
): AgentChatActivityPayload['status'] {
  if (status === 'completed') return 'done'
  if (status === 'failed') return 'error'
  return 'running'
}

function kindLabel(kind: string | null | undefined): string {
  switch (kind) {
    case 'read':
      return 'Read'
    case 'edit':
      return 'Edit'
    case 'delete':
      return 'Delete'
    case 'move':
      return 'Move'
    case 'search':
      return 'Search'
    case 'execute':
      return 'Run command'
    case 'fetch':
      return 'Fetch'
    case 'think':
      return 'Think'
    case 'switch_mode':
      return 'Switch mode'
    default:
      return 'Tool'
  }
}

export function friendlyAcpError(error: unknown, providerLabel: string, loginHint: string): string {
  if (error instanceof JsonRpcError) {
    if (error.code === ACP_AUTH_REQUIRED || /auth/i.test(error.message)) return loginHint
    return `${providerLabel}: ${error.message}`
  }
  const message = error instanceof Error ? error.message : String(error)
  if (/ENOENT/.test(message)) return `${providerLabel} could not be started (${message}).`
  if (/auth|log ?in|sign ?in|credential/i.test(message)) return `${loginHint}\n\n(${message})`
  return `${providerLabel}: ${message}`
}

export async function runAcpTurn(deps: AcpTurnDeps, input: AcpTurnInput): Promise<void> {
  const { payload, manifest, root, session, signal } = input
  const { conn, sessionId } = session
  const streamId = payload.streamId
  const temperament: ReviewMode = payload.reviewMode ?? 'trust'
  const chatMode = payload.activeContext.chatMode
  const newRequestId = deps.newRequestId ?? (() => Math.random().toString(36).slice(2, 12))

  const emit = deps.emit
  const emitActivity = (activity: AgentChatActivityPayload) => emit({ streamId, phase: 'activity', activity })

  // Mode: ask-first vs accept-edits vs plan, when the agent exposes modes.
  const desiredMode = pickSessionModeId(session.modes?.availableModes, chatMode, temperament)
  if (desiredMode && desiredMode !== session.modes?.currentModeId) {
    try {
      await conn.setMode(sessionId, desiredMode)
      if (session.modes) session.modes.currentModeId = desiredMode
    } catch (e) {
      console.warn('[GrokForge][acp] session/set_mode failed:', e)
    }
  }
  const planFallback = chatMode === 'plan' && desiredMode !== 'plan'

  emit({
    streamId,
    phase: 'turn_started',
    routing: {
      provider: { id: input.providerId, label: input.providerLabel },
      ...(session.modelLabel ? { modelLabel: session.modelLabel } : {}),
    },
  })

  const toolCalls = new Map<string, AcpToolCallFields>()
  const changedPaths = new Set<string>()
  let sawToolSinceText = false
  let wroteText = false
  let thoughtOpen = false
  let thoughtText = ''
  /** Set when the user picks "Allow all edits this turn". */
  let allowEditsThisTurn = false

  const closeThought = () => {
    if (!thoughtOpen) return
    thoughtOpen = false
    emitActivity({ id: 'acp-thinking', title: 'Thought', detail: thoughtText.slice(-240), status: 'done' })
  }

  const toolActivity = (
    fields: AcpToolCallFields,
    overrideStatus?: AgentChatActivityPayload['status'],
  ): AgentChatActivityPayload => {
    const firstPath = fields.locations?.[0]?.path ?? collectDiffs(fields)[0]?.path
    const command = rawInputString(fields.rawInput, 'command')
    const detail = command ?? (firstPath ? displayPath(firstPath, manifest.roots) : undefined)
    return {
      id: `acp-${fields.toolCallId}`,
      title: fields.title?.trim() || kindLabel(fields.kind),
      ...(detail ? { detail } : {}),
      status: overrideStatus ?? activityStatus(fields.status),
      ...(firstPath ? { subjectPath: firstPath } : {}),
    }
  }

  const mergeToolCall = (update: AcpToolCallFields): AcpToolCallFields => {
    const prev = toolCalls.get(update.toolCallId)
    const merged: AcpToolCallFields = { ...prev, toolCallId: update.toolCallId }
    for (const [k, v] of Object.entries(update)) {
      if (v !== undefined && v !== null) (merged as Record<string, unknown>)[k] = v
    }
    toolCalls.set(update.toolCallId, merged)
    return merged
  }

  const noteChanged = (fields: AcpToolCallFields) => {
    if (fields.kind !== 'edit' && fields.kind !== 'delete' && fields.kind !== 'move') return
    for (const loc of fields.locations ?? []) changedPaths.add(resolve(loc.path))
    for (const d of collectDiffs(fields)) changedPaths.add(resolve(d.path))
  }

  const onSessionUpdate = (n: AcpSessionNotification) => {
    if (n.sessionId !== sessionId) return
    const update = n.update
    switch (update.sessionUpdate) {
      case 'agent_message_chunk': {
        const text = textOfContentBlock((update as { content: AcpContentBlock }).content)
        if (!text) return
        closeThought()
        const delta = wroteText && sawToolSinceText ? `\n\n${text}` : text
        sawToolSinceText = false
        wroteText = true
        emit({ streamId, phase: 'final_chunk', delta })
        return
      }
      case 'agent_thought_chunk': {
        const text = textOfContentBlock((update as { content: AcpContentBlock }).content)
        if (!text) return
        thoughtText = (thoughtText + text).slice(-2_000)
        if (!thoughtOpen) {
          thoughtOpen = true
          emitActivity({ id: 'acp-thinking', title: 'Thinking', status: 'running' })
        }
        return
      }
      case 'tool_call':
      case 'tool_call_update': {
        closeThought()
        sawToolSinceText = true
        const merged = mergeToolCall(update as AcpToolCallFields)
        if (merged.status === 'completed') noteChanged(merged)
        emitActivity(toolActivity(merged))
        return
      }
      case 'plan': {
        const entries = (update as { entries?: Array<{ content: string; status?: string }> }).entries ?? []
        if (!entries.length) return
        const done = entries.filter((e) => e.status === 'completed').length
        emitActivity({
          id: 'acp-plan',
          title: `Plan · ${done}/${entries.length} done`,
          detail: entries
            .map((e) => `${e.status === 'completed' ? '✓' : e.status === 'in_progress' ? '→' : '•'} ${e.content}`)
            .join('\n'),
          status: done === entries.length ? 'done' : 'running',
        })
        return
      }
      case 'current_mode_update': {
        const id = (update as { currentModeId?: string }).currentModeId
        if (id && session.modes) session.modes.currentModeId = id
        return
      }
      default:
        return
    }
  }

  const requestPermission = async (
    params: AcpRequestPermissionParams,
  ): Promise<AcpRequestPermissionResult> => {
    if (params.sessionId !== sessionId || signal.aborted) return { outcome: { outcome: 'cancelled' } }
    const fields = mergeToolCall(params.toolCall)
    const diffs = collectDiffs(fields)
    const kind = approvalKindFor(fields, diffs)

    const answer = (allow: boolean): AcpRequestPermissionResult => {
      const option = pickPermissionOption(params.options, allow)
      return option
        ? { outcome: { outcome: 'selected', optionId: option.optionId } }
        : { outcome: { outcome: 'cancelled' } }
    }

    if (shouldAutoAllow(fields.kind, temperament)) return answer(true)
    if (allowEditsThisTurn && kind === 'edit' && fields.kind !== 'delete') return answer(true)
    await addSnippetLineNumbers(diffs, manifest.roots)

    const command = rawInputString(fields.rawInput, 'command')
    const bodyText = (fields.content ?? [])
      .map((c) => (c.type === 'content' ? textOfContentBlock(c.content) : ''))
      .filter(Boolean)
      .join('\n\n')
    const title = fields.title?.trim() || kindLabel(fields.kind)
    const destructive = fields.kind === 'delete'
    const request: AgentApprovalRequest = {
      requestId: newRequestId(),
      streamId,
      kind,
      ...(destructive ? { destructive: true } : {}),
      providerLabel: input.providerLabel,
      detail:
        kind === 'edit'
          ? destructive
            ? 'Deleting cannot be reviewed as a diff. You can still undo the turn afterwards.'
            : 'Nothing is written until you allow it. Every change can be undone after the turn.'
          : kind === 'command'
            ? 'Commands always ask first, in every review mode.'
            : title,
      body: kind === 'command' ? (command ?? title) : bodyText ? truncate(bodyText, 8_000) : title,
      ...(rawInputString(fields.rawInput, 'description')
        ? { purpose: rawInputString(fields.rawInput, 'description') }
        : {}),
      rootId: root.id,
      rootLabel: root.label || root.id,
      rootPath: root.path,
      ...(diffs.length ? { diffs } : {}),
    }

    emitActivity(toolActivity(fields, 'awaiting_approval'))
    emit({ streamId, phase: 'approval_required', request })
    let approved: boolean
    try {
      const decision = await deps.requestApproval(request, signal)
      approved = decision.approved
      if (approved && decision.scope === 'turn' && kind === 'edit') allowEditsThisTurn = true
    } catch {
      return { outcome: { outcome: 'cancelled' } }
    }
    emitActivity(toolActivity(fields, approved ? 'running' : 'rejected'))
    return answer(approved)
  }

  const readTextFile: AcpClientHandlers['readTextFile'] = async (params) => {
    const abs = resolve(params.path)
    if (!isPathWithinWorkspaceRoots(abs, manifest.roots)) {
      throw new JsonRpcError(-32002, `GrokForge only shares files inside the project roots: ${params.path}`)
    }
    const content = await readFile(abs, 'utf8')
    if (params.line == null && params.limit == null) return { content }
    const lines = content.split('\n')
    const start = Math.max(0, (params.line ?? 1) - 1)
    const end = params.limit != null ? start + params.limit : lines.length
    return { content: lines.slice(start, end).join('\n') }
  }

  const writeTextFile: AcpClientHandlers['writeTextFile'] = async (params) => {
    const abs = resolve(params.path)
    try {
      assertWritableWorkspacePath(abs, manifest.roots, manifest.ignore ?? [])
    } catch (e) {
      throw new JsonRpcError(-32002, `GrokForge refused the write: ${e instanceof Error ? e.message : String(e)}`)
    }
    await mkdir(dirname(abs), { recursive: true })
    await writeFile(abs, params.content, 'utf8')
    changedPaths.add(abs)
    return null
  }

  conn.handlers = { onSessionUpdate, requestPermission, readTextFile, writeTextFile }

  // On abort: ask the agent to stop, and give it a grace period to answer the prompt with
  // `stopReason: cancelled` before giving up on it.
  let graceTimer: ReturnType<typeof setTimeout> | null = null
  const abortWait = new Promise<never>((_, reject) => {
    const onAbort = () => {
      conn.cancel(sessionId)
      graceTimer = setTimeout(() => reject(signal.reason ?? new Error('cancelled')), CANCEL_GRACE_MS)
    }
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
  })
  abortWait.catch(() => undefined)

  try {
    let result: Awaited<ReturnType<typeof conn.prompt>>
    try {
      result = await Promise.race([conn.prompt(sessionId, buildPromptBlocks(input, planFallback)), abortWait])
    } catch (e) {
      if (signal.aborted) throw signal.reason
      throw new AcpTurnError(friendlyAcpError(e, input.providerLabel, input.loginHint))
    }
    closeThought()

    if (signal.aborted || result.stopReason === 'cancelled') {
      throw signal.reason ?? new Error('cancelled')
    }
    if (result.stopReason === 'refusal') {
      emit({ streamId, phase: 'final_chunk', delta: `${wroteText ? '\n\n' : ''}_${input.providerLabel} declined this request._` })
    }

    emit({ streamId, phase: 'activity_clear_running', reason: 'done' })
    await deps.beforeDone?.()
    emit({
      streamId,
      phase: 'done',
      turnOutcome:
        result.stopReason === 'max_turn_requests' || result.stopReason === 'max_tokens'
          ? 'limit_reached'
          : 'complete',
    })
  } finally {
    if (graceTimer) clearTimeout(graceTimer)
    conn.handlers = null
    if (changedPaths.size > 0) deps.onFilesChanged?.(Array.from(changedPaths))
  }
}
