import { ipcMain, type BrowserWindow } from 'electron'
import { z } from 'zod'
import type {
  AgentChatActiveContext,
  AgentChatCapabilitiesResult,
  AgentChatEventPayload,
  AgentChatStartPayload,
  AgentChatStartResult,
} from '../../shared/agent/chat-contract'
import {
  AGENT_CHAT_MAX_ATTACHMENTS,
  AGENT_CHAT_MAX_MESSAGE_CHARS,
  AGENT_CHAT_MAX_OPEN_TABS,
  AGENT_CHAT_MAX_STREAM_ID_LEN,
  AGENT_CHAT_MAX_THREAD_MESSAGES,
  AGENT_CHAT_MAX_USER_TEXT_CHARS,
  AGENT_CHAT_SELECTION_MAX_CHARS,
} from '../../shared/agent/chat-contract'
import type { GrokProjectManifest } from '../project/manifest'
import { runAcpChatTurn } from '../acp/chat-turn'
import { getProviderDetection, getSelectedAgentProvider } from '../acp/provider-registry'
import { disposeAllAcpSessions } from '../acp/session-manager'
import { waitForApprovalDecision } from './approval'

/**
 * Agent chat IPC: validates turn requests from the renderer and runs them on the selected
 * external coding agent (`src/main/acp/`).
 */

const ABORT_USER = 'gf:agent-user-cancel'
const ABORT_QUIT = 'gf:agent-quit'

type CurrentProjectSnapshot = {
  projectId: string | null
  manifest: GrokProjectManifest | null
}

let getCurrentProject: () => CurrentProjectSnapshot = () => ({ projectId: null, manifest: null })
let targetWindow: BrowserWindow | null = null
const activeTurns = new Map<string, AbortController>()

const AttachmentSchema = z.object({
  type: z.enum(['file', 'folder']),
  path: z.string().min(1).max(10_000),
  source: z.enum(['workspace', 'upload']).optional(),
  displayName: z.string().max(512).optional(),
  mediaType: z.string().max(256).optional(),
  byteSize: z.number().nonnegative().finite().optional(),
})

const EditorSelectionSchema = z.object({
  path: z.string().min(1).max(10_000),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  text: z.string().max(AGENT_CHAT_SELECTION_MAX_CHARS).optional(),
  truncated: z.boolean(),
})

const ActiveContextSchema: z.ZodType<AgentChatActiveContext> = z.object({
  activeRootId: z.string().nullable().optional(),
  activeFilePath: z.string().nullable().optional(),
  openTabs: z
    .array(z.object({ path: z.string().min(1).max(10_000), dirty: z.boolean() }))
    .max(AGENT_CHAT_MAX_OPEN_TABS),
  attachments: z.array(AttachmentSchema).max(AGENT_CHAT_MAX_ATTACHMENTS).optional(),
  editorSelection: EditorSelectionSchema.nullable().optional(),
  chatMode: z.enum(['fast', 'plan']),
})

const StartPayloadSchema: z.ZodType<AgentChatStartPayload> = z.object({
  streamId: z.string().min(1).max(AGENT_CHAT_MAX_STREAM_ID_LEN),
  userText: z.string().min(1).max(AGENT_CHAT_MAX_USER_TEXT_CHARS),
  threadSnapshot: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string().max(AGENT_CHAT_MAX_MESSAGE_CHARS),
      }),
    )
    .max(AGENT_CHAT_MAX_THREAD_MESSAGES),
  activeContext: ActiveContextSchema,
  reviewMode: z.enum(['trust', 'velocity']).optional(),
})

export function setAgentChatTargetWindow(win: BrowserWindow | null): void {
  targetWindow = win
}

function emit(payload: AgentChatEventPayload): void {
  targetWindow?.webContents.send('agent-chat-event', payload)
}

/** App quit: stop running turns and agent processes. */
export function stopAllAgentTurnsForQuit(): void {
  for (const ac of activeTurns.values()) ac.abort(ABORT_QUIT)
  activeTurns.clear()
  disposeAllAcpSessions()
}

async function runTurnJob(payload: AgentChatStartPayload, ac: AbortController): Promise<void> {
  try {
    const { manifest, projectId } = getCurrentProject()
    if (!manifest || !projectId) {
      emit({ streamId: payload.streamId, phase: 'error', error: 'No project loaded' })
      return
    }
    await runAcpChatTurn(
      {
        emit,
        requestApproval: (request, signal) =>
          waitForApprovalDecision(request.requestId, payload.streamId, signal),
      },
      payload,
      manifest,
      projectId,
      await getSelectedAgentProvider(),
      ac,
    )
  } catch (e) {
    if (ac.signal.reason === ABORT_QUIT) return
    if (ac.signal.reason === ABORT_USER) {
      emit({ streamId: payload.streamId, phase: 'activity_clear_running', reason: 'cancelled' })
      emit({ streamId: payload.streamId, phase: 'cancelled' })
      return
    }
    const message = e instanceof Error ? e.message : 'Agent turn failed'
    emit({ streamId: payload.streamId, phase: 'activity_clear_running', reason: 'error' })
    emit({ streamId: payload.streamId, phase: 'error', error: message })
  } finally {
    activeTurns.delete(payload.streamId)
  }
}

export function registerAgentChatIpc(options: { getCurrentProject: () => CurrentProjectSnapshot }): void {
  getCurrentProject = options.getCurrentProject

  ipcMain.handle('agent-chat-capabilities', async (): Promise<AgentChatCapabilitiesResult> => {
    const providerId = await getSelectedAgentProvider()
    const detection = await getProviderDetection(providerId)
    return {
      providerId,
      providerLabel: detection.status.label,
      providerReady: detection.launch !== null,
      ...(detection.status.available ? {} : { providerHint: detection.status.hint }),
    }
  })

  ipcMain.handle('agent-chat-start', async (_, raw: unknown): Promise<AgentChatStartResult> => {
    const parsed = StartPayloadSchema.safeParse(raw)
    if (!parsed.success) return { ok: false, error: parsed.error.message }
    const payload = parsed.data
    if (activeTurns.has(payload.streamId)) return { ok: false, error: 'streamId already in use' }
    const ac = new AbortController()
    activeTurns.set(payload.streamId, ac)
    void runTurnJob(payload, ac)
    return { ok: true, streamId: payload.streamId }
  })

  ipcMain.handle('agent-chat-cancel', async (_, streamId: unknown): Promise<{ ok: boolean }> => {
    if (typeof streamId !== 'string' || !streamId.trim()) return { ok: false }
    activeTurns.get(streamId)?.abort(ABORT_USER)
    return { ok: true }
  })
}
