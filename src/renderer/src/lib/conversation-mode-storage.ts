export type { ConversationMode } from '../../../shared/conversation-mode-contract'
import type { ConversationMode } from '../../../shared/conversation-mode-contract'

const key = (projectId: string) => `grokforge.conversationMode.v1:${projectId}`

export function readConversationMode(projectId: string | null | undefined): ConversationMode {
  if (!projectId || typeof localStorage === 'undefined') return 'normal'
  try {
    const v = localStorage.getItem(key(projectId))
    return v === 'plan' ? 'plan' : 'normal'
  } catch {
    return 'normal'
  }
}

export function writeConversationMode(projectId: string, mode: ConversationMode): void {
  try {
    localStorage.setItem(key(projectId), mode)
  } catch {
    /* ignore quota / private mode */
  }
}
