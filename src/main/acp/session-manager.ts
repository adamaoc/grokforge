import type { AgentProviderId } from '../../shared/agent/provider-contract'
import { AcpAgentConnection, type AcpLaunchSpec } from './connection'
import type { AcpInitializeResult, AcpNewSessionResult } from './protocol'

/**
 * Keeps one live ACP agent session per GrokForge project so follow-up turns share the
 * agent's own conversation memory. A session is replaced when the provider or working
 * root changes, when the agent process dies, or when the chat thread starts fresh.
 */

export type ManagedAcpSession = {
  projectId: string
  providerId: AgentProviderId
  cwd: string
  conn: AcpAgentConnection
  sessionId: string
  modes: AcpNewSessionResult['modes']
  /** Human label for the model the agent reports (e.g. "Opus 5.5", "grok-4.6"). */
  modelLabel: string | null
  busy: boolean
}

type ConnectionFactory = (spec: AcpLaunchSpec) => AcpAgentConnection

let connect: ConnectionFactory = (spec) => AcpAgentConnection.spawn(spec)
const sessions = new Map<string, ManagedAcpSession>()

export function setAcpConnectionFactoryForTests(factory: ConnectionFactory | null): void {
  connect = factory ?? ((spec) => AcpAgentConnection.spawn(spec))
}

function metaRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

export function modelLabelFrom(
  init: AcpInitializeResult | null,
  session: AcpNewSessionResult,
): string | null {
  // Claude adapter: configOptions[id=model] with named options.
  const modelOpt = session.configOptions?.find((o) => o.id === 'model' || o.category === 'model')
  if (modelOpt?.currentValue) {
    const opt = modelOpt.options?.find((o) => o.value === modelOpt.currentValue)
    if (opt) {
      // "Default (recommended)" is less useful than the model it resolves to.
      return opt.value === 'default' && opt.description ? opt.description : opt.name
    }
    return modelOpt.currentValue
  }
  // Grok Build: `_meta.modelState.currentModelId` on initialize or session/new.
  for (const meta of [metaRecord(session._meta), metaRecord((init as { _meta?: unknown } | null)?._meta)]) {
    const state = metaRecord(meta?.modelState)
    if (typeof state?.currentModelId === 'string') return state.currentModelId
  }
  return null
}

export async function acquireAcpSession(input: {
  projectId: string
  providerId: AgentProviderId
  launch: AcpLaunchSpec
  cwd: string
  additionalDirectories?: string[]
  /** Discard any existing session (new chat thread). */
  fresh: boolean
}): Promise<{ session: ManagedAcpSession; reused: boolean }> {
  const existing = sessions.get(input.projectId)
  if (existing) {
    const reusable =
      !input.fresh &&
      existing.providerId === input.providerId &&
      existing.cwd === input.cwd &&
      existing.conn.isAlive &&
      !existing.busy
    if (reusable) return { session: existing, reused: true }
    disposeAcpSession(input.projectId)
  }

  const conn = connect({ ...input.launch, cwd: input.launch.cwd ?? input.cwd })
  try {
    const init = await conn.initialize()
    const created = await conn.newSession(input.cwd, input.additionalDirectories ?? [])
    const session: ManagedAcpSession = {
      projectId: input.projectId,
      providerId: input.providerId,
      cwd: input.cwd,
      conn,
      sessionId: created.sessionId,
      modes: created.modes ?? null,
      modelLabel: modelLabelFrom(init, created),
      busy: false,
    }
    sessions.set(input.projectId, session)
    return { session, reused: false }
  } catch (e) {
    conn.dispose()
    throw e
  }
}

export function disposeAcpSession(projectId: string): void {
  const s = sessions.get(projectId)
  if (!s) return
  sessions.delete(projectId)
  s.conn.dispose()
}

export function disposeAllAcpSessions(): void {
  for (const id of Array.from(sessions.keys())) disposeAcpSession(id)
}
