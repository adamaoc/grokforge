import type { HarnessTemperament } from '../../../shared/agent/chat-contract'
import type { AgentWritesMode } from './agent-writes-mode'

export type { HarnessTemperament }

const STORAGE_KEY = 'grokforge.harnessTemperament.v1'
const LEGACY_WRITES_KEY = 'grokforge.agentWritesMode'

const VALID: HarnessTemperament[] = ['trust', 'velocity']

export function temperamentToWritesMode(temperament: HarnessTemperament): AgentWritesMode {
  return temperament === 'velocity' ? 'auto_apply' : 'batch_confirm'
}

export function writesModeToTemperament(mode: AgentWritesMode): HarnessTemperament {
  return mode === 'auto_apply' ? 'velocity' : 'trust'
}

export function readStoredHarnessTemperament(): HarnessTemperament {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)?.trim()
    if (raw === 'velocity' || raw === 'trust') return raw
  } catch {
    // ignore
  }

  try {
    const legacy = localStorage.getItem(LEGACY_WRITES_KEY)?.trim()
    if (legacy === 'auto_apply') {
      persistHarnessTemperament('velocity')
      return 'velocity'
    }
    if (legacy === 'batch_confirm') {
      persistHarnessTemperament('trust')
      return 'trust'
    }
  } catch {
    // ignore
  }

  return 'trust'
}

export function persistHarnessTemperament(temperament: HarnessTemperament): void {
  if (!VALID.includes(temperament)) return
  try {
    localStorage.setItem(STORAGE_KEY, temperament)
    localStorage.setItem(LEGACY_WRITES_KEY, temperamentToWritesMode(temperament))
  } catch {
    // ignore
  }
}

export function isVelocityTemperament(): boolean {
  return readStoredHarnessTemperament() === 'velocity'
}

export function harnessTemperamentLabel(temperament: HarnessTemperament): string {
  return temperament === 'velocity' ? 'Velocity' : 'Trust'
}
