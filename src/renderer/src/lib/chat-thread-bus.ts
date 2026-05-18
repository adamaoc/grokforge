import type { PersistedChatLineV1 } from '@/types'

const listeners = new Set<(line: PersistedChatLineV1) => void>()

/** Voice / async paths append UI-visible chat lines without lifting ChatThread state up. */
export function publishChatThreadLine(line: PersistedChatLineV1): void {
  for (const fn of listeners) {
    fn(line)
  }
}

export function subscribeChatThreadLines(cb: (line: PersistedChatLineV1) => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
