import { app } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  AGENT_PROVIDER_IDS,
  AGENT_PROVIDER_LABELS,
  isAgentProviderId,
  type AgentProviderId,
  type AgentProviderStatus,
  type AgentProvidersResult,
} from '../../shared/agent/provider-contract'
import { getXaiKeyStatusPayload } from '../xai/key-store'
import { detectAcpProvider, type AcpProviderDetection, type AcpProviderId } from './providers'

/**
 * App-level coding-agent choice, persisted under userData. Per-project overrides can come
 * later; one global choice keeps the spike simple.
 */

const STORE_FILENAME = 'agent-provider.json'
const DETECTION_TTL_MS = 30_000
/** Preference order when the user has not picked: external agents first (no API spend). */
const DEFAULT_ORDER: AgentProviderId[] = ['grok-build', 'claude-code', 'grok-api']

let storedSelection: AgentProviderId | null | undefined
let detectionCache: { at: number; acp: Map<AcpProviderId, AcpProviderDetection> } | null = null

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

export function isAcpProviderId(id: AgentProviderId): id is AcpProviderId {
  return id !== 'grok-api'
}

export async function detectAllAcpProviders(
  refresh = false,
): Promise<Map<AcpProviderId, AcpProviderDetection>> {
  if (!refresh && detectionCache && Date.now() - detectionCache.at < DETECTION_TTL_MS) {
    return detectionCache.acp
  }
  const ids = AGENT_PROVIDER_IDS.filter(isAcpProviderId)
  const results = await Promise.all(ids.map((id) => detectAcpProvider(id)))
  const acp = new Map(ids.map((id, i) => [id, results[i]!]))
  detectionCache = { at: Date.now(), acp }
  return acp
}

export async function getAcpProviderDetection(
  id: AcpProviderId,
  refresh = false,
): Promise<AcpProviderDetection> {
  const all = await detectAllAcpProviders(refresh)
  return all.get(id)!
}

function grokApiStatus(): AgentProviderStatus {
  const key = getXaiKeyStatusPayload()
  return {
    id: 'grok-api',
    label: AGENT_PROVIDER_LABELS['grok-api'],
    kind: 'builtin',
    tagline: 'Built-in GrokForge harness · pay-per-token xAI API key',
    available: key.configured || Boolean(process.env.GROKFORGE_E2E_AGENT_REPLY?.trim()),
    detail: key.configured
      ? key.source === 'stored'
        ? 'API key saved in GrokForge'
        : 'API key from environment'
      : undefined,
    hint: key.configured ? undefined : 'Add an xAI API key below (Settings → xAI API key).',
  }
}

export async function listAgentProviders(refresh = false): Promise<AgentProvidersResult> {
  const acp = await detectAllAcpProviders(refresh)
  const providers: AgentProviderStatus[] = AGENT_PROVIDER_IDS.map((id) =>
    isAcpProviderId(id) ? acp.get(id)!.status : grokApiStatus(),
  )
  return { selected: resolveSelected(providers), providers }
}

function resolveSelected(providers: AgentProviderStatus[]): AgentProviderId {
  const stored = readStoredSelection()
  if (stored) return stored
  // The legacy E2E suite drives the built-in harness mock; keep it deterministic.
  if (process.env.GROKFORGE_E2E_AGENT_REPLY?.trim()) return 'grok-api'
  for (const id of DEFAULT_ORDER) {
    if (providers.find((p) => p.id === id)?.available) return id
  }
  return 'grok-api'
}

export async function getSelectedAgentProvider(): Promise<AgentProviderId> {
  const stored = readStoredSelection()
  if (stored) return stored
  return (await listAgentProviders()).selected
}

export function setSelectedAgentProvider(id: AgentProviderId): void {
  const path = storePath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify({ provider: id }, null, 2)}\n`, 'utf8')
  storedSelection = id
}
