import {
  persistHarnessTemperament,
  readStoredHarnessTemperament,
  temperamentToWritesMode,
  writesModeToTemperament,
} from './harness-temperament'

export type AgentWritesMode = 'batch_confirm' | 'auto_apply'

const VALID: AgentWritesMode[] = ['batch_confirm', 'auto_apply']

/** Derived from {@link readStoredHarnessTemperament} (story 118). */
export function readStoredAgentWritesMode(): AgentWritesMode {
  return temperamentToWritesMode(readStoredHarnessTemperament())
}

/** Updates harness temperament; keeps legacy writes key in sync. */
export function persistAgentWritesMode(mode: AgentWritesMode): void {
  if (!VALID.includes(mode)) return
  persistHarnessTemperament(writesModeToTemperament(mode))
}
