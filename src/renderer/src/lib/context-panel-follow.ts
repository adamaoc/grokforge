import { isVelocityTemperament } from '@/lib/harness-temperament'

const STORAGE_KEY = 'grokforge.contextPanel.followAgentFiles'

/** Default: Velocity on, Trust off (story 143 / 118). */
export function readFollowAgentFiles(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)?.trim()
    if (raw === 'true') return true
    if (raw === 'false') return false
  } catch {
    // ignore
  }
  return isVelocityTemperament()
}

export function persistFollowAgentFiles(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(value))
  } catch {
    // ignore
  }
}
