import type { ChatMessage } from '@/types'

/** Ensure the live assistant bubble matches the authoritative stream buffer at turn end. */
export function applyFinalAssistantContentToMessages(
  messages: ChatMessage[] | null,
  assistantId: string | null,
  finalContent: string,
): ChatMessage[] | null {
  if (!messages || !assistantId) return messages
  return messages.map((m) =>
    m.id === assistantId ? { ...m, content: finalContent } : m,
  )
}