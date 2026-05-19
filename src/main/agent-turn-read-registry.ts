import { agentEditPathKey } from '../shared/agent-edit-read-guard'

const readsByStreamId = new Map<string, Map<string, string>>()

export function clearAgentTurnReads(streamId: string): void {
  readsByStreamId.delete(streamId)
}

export function recordAgentTurnRead(
  streamId: string,
  resolvedAbsolutePath: string,
  contentHash: string,
): void {
  const key = agentEditPathKey(resolvedAbsolutePath)
  let map = readsByStreamId.get(streamId)
  if (!map) {
    map = new Map()
    readsByStreamId.set(streamId, map)
  }
  map.set(key, contentHash)
}

export function getAgentTurnReadHashes(streamId: string): ReadonlyMap<string, string> {
  return readsByStreamId.get(streamId) ?? new Map()
}

export function getAgentTurnReads(streamId: string): ReadonlySet<string> {
  return new Set(getAgentTurnReadHashes(streamId).keys())
}
