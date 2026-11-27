import { app } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  AGENT_PROVIDER_IDS,
  isAgentProviderId,
  type AgentProviderId,
  type AgentProvidersResult,
} from '../../shared/agent/provider-contract'
import { detectAcpProvider, type AcpProviderDetection } from './providers'

/**
 * App-level coding-agent choice, persisted under userData. With no saved choice, the
 * first detected agent wins (Grok Build, then Claude Code).
 */

const STORE_FILENAME = 'agent-provider.json'
const DETECTION_TTL_MS = 30_000

let storedSelection: AgentProviderId | null | undefined
let detectionCache: { at: number; byId: Map<AgentProviderId, AcpProviderDetection> } | null = null

function storePath(): string {
  return join(app.getPath('userData'), STORE_FILENAME)
}

function readStoredSelection(): AgentProviderId | null {
  if (storedSelection !== undefined) return storedSelection
  try {
    const raw = JSON.parse(readFileSync(storePath(), 'utf8')) as { provider?: unknown }
    storedSelection = isAgentProviderId(raw.provider) ? raw.provider : null
  } catch {
    storedSelection = null
  }
  return storedSelection
}

export async function detectAllProviders(
  refresh = false,
): Promise<Map<AgentProviderId, AcpProviderDetection>> {
  if (!refresh && detectionCache && Date.now() - detectionCache.at < DETECTION_TTL_MS) {
    return detectionCache.byId
  }
  const results = await Promise.all(AGENT_PROVIDER_IDS.map((id) => detectAcpProvider(id)))
  const byId = new Map(AGENT_PROVIDER_IDS.map((id, i) => [id, results[i]!]))
  detectionCache = { at: Date.now(), byId }
  return byId
}

export async function getProviderDetection(
  id: AgentProviderId,
  refresh = false,
): Promise<AcpProviderDetection> {
  return (await detectAllProviders(refresh)).get(id)!
}

export async function listAgentProviders(refresh = false): Promise<AgentProvidersResult> {
  const byId = await detectAllProviders(refresh)
  const providers = AGENT_PROVIDER_IDS.map((id) => byId.get(id)!.status)
  const stored = readStoredSelection()
  const selected = stored ?? providers.find((p) => p.available)?.id ?? AGENT_PROVIDER_IDS[0]
  return { selected, providers }
}

export async function getSelectedAgentProvider(): Promise<AgentProviderId> {
  return readStoredSelection() ?? (await listAgentProviders()).selected
}

export function setSelectedAgentProvider(id: AgentProviderId): void {
  const path = storePath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify({ provider: id }, null, 2)}\n`, 'utf8')
  storedSelection = id
}
