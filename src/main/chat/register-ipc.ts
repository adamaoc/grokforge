import { ipcMain } from 'electron'
import { isStoredProjectPresent } from '../project/store'
import { appendChatMessage, clearChatThread, loadChatThread, parseIncomingPersistPayload } from './store'
import { StageChatAttachmentPayloadSchema } from '../../shared/chat/attachment-contract'
import { stageChatAttachment } from './attachment-staging'
import { disposeAcpSession } from '../acp/session-manager'

/** Chat thread persistence (JSONL under userData) and attachment staging. */
export function registerChatIpc(deps: { getCurrentProjectId: () => string | null }): void {
  ipcMain.handle('load-chat-thread', (): ReturnType<typeof loadChatThread> => {
    const currentProjectId = deps.getCurrentProjectId()
    if (!currentProjectId) return { ok: false, error: 'No project loaded' }
    return loadChatThread(currentProjectId)
  })

  ipcMain.handle('append-chat-message-for-project', (_, raw: unknown) => {
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'Invalid payload' } as const
    const o = raw as { projectId?: unknown; payload?: unknown }
    const projectId = typeof o.projectId === 'string' && o.projectId.trim() ? o.projectId.trim() : ''
    if (!projectId || !isStoredProjectPresent(projectId)) {
      return { ok: false, error: 'Unknown project' } as const
    }
    const record = parseIncomingPersistPayload(o.payload)
    if (!record) return { ok: false, error: 'Invalid chat message payload' } as const
    if (record.id === 'welcome') {
      return { ok: false, error: 'Cannot persist synthetic welcome message' } as const
    }
    return appendChatMessage(projectId, record)
  })

  ipcMain.handle('append-chat-message', (_, payload: unknown) => {
    const currentProjectId = deps.getCurrentProjectId()
    if (!currentProjectId) return { ok: false, error: 'No project loaded' } as const
    const record = parseIncomingPersistPayload(payload)
    if (!record) return { ok: false, error: 'Invalid chat message payload' } as const
    if (record.id === 'welcome') {
      return { ok: false, error: 'Cannot persist synthetic welcome message' } as const
    }
    return appendChatMessage(currentProjectId, record)
  })

  ipcMain.handle('clear-chat-thread', (): ReturnType<typeof clearChatThread> => {
    const currentProjectId = deps.getCurrentProjectId()
    if (!currentProjectId) return { ok: false, error: 'No project loaded' }
    // A cleared thread starts a fresh agent session too.
    disposeAcpSession(currentProjectId)
    return clearChatThread(currentProjectId)
  })

  ipcMain.handle('stage-chat-attachment', (_, raw: unknown) => {
    const currentProjectId = deps.getCurrentProjectId()
    if (!currentProjectId) return { ok: false as const, error: 'No project loaded' }
    const parsed = StageChatAttachmentPayloadSchema.safeParse(raw)
    if (!parsed.success) return { ok: false as const, error: 'Invalid attachment request.' }
    return stageChatAttachment(currentProjectId, parsed.data)
  })
}
