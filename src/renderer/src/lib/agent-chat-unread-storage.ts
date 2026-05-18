const STORAGE_KEY = 'grokforge.agentChatUnread.v1'

type UnreadMap = Record<string, true>

function readMap(): UnreadMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as UnreadMap
  } catch {
    return {}
  }
}

function writeMap(map: UnreadMap): void {
  try {
    if (Object.keys(map).length === 0) {
      localStorage.removeItem(STORAGE_KEY)
      return
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* ignore quota / private mode */
  }
}

export function readAgentChatUnreadProjectIds(): Set<string> {
  return new Set(Object.keys(readMap()))
}

export function markAgentChatUnread(projectId: string): void {
  const map = readMap()
  map[projectId] = true
  writeMap(map)
}

export function clearAgentChatUnread(projectId: string): void {
  const map = readMap()
  if (!(projectId in map)) return
  delete map[projectId]
  writeMap(map)
}
