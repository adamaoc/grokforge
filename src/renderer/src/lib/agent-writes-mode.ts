export type AgentWritesMode = 'batch_confirm' | 'auto_apply'

const STORAGE_KEY = 'grokforge.agentWritesMode'

const VALID: AgentWritesMode[] = ['batch_confirm', 'auto_apply']

export function readStoredAgentWritesMode(): AgentWritesMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)?.trim()
    if (raw === 'auto_apply' || raw === 'batch_confirm') return raw
  } catch {
    // ignore
  }
  return 'batch_confirm'
}

export function persistAgentWritesMode(mode: AgentWritesMode): void {
  if (!VALID.includes(mode)) return
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // ignore
  }
}
