const STORAGE_KEY = 'grokforge.chat.activityAlwaysExpand'

/** When true, tool activity panels start expanded (story 141). Default off until Settings UI lands in 142+. */
export function readActivityAlwaysExpand(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function persistActivityAlwaysExpand(value: boolean): void {
  try {
    if (value) {
      localStorage.setItem(STORAGE_KEY, '1')
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // ignore
  }
}
