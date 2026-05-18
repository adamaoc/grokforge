export type VoiceUserDraftEvent =
  | { kind: 'update'; id: string; content: string }
  | { kind: 'clear' }

const listeners = new Set<(ev: VoiceUserDraftEvent) => void>()

export function publishVoiceUserDraft(ev: VoiceUserDraftEvent): void {
  for (const fn of listeners) fn(ev)
}

export function subscribeVoiceUserDraft(cb: (ev: VoiceUserDraftEvent) => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
