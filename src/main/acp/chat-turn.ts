import type {
  AgentApprovalDecision,
  AgentChatEventPayload,
  AgentChatStartPayload,
  AgentCommandApprovalRequest,
} from '../../shared/agent/chat-contract'
import { AGENT_PROVIDER_LABELS } from '../../shared/agent/provider-contract'
import type { GrokProjectManifest } from '../project/manifest'
import { scheduleWorkspaceFilesystemRefresh } from '../workspace/fs-notify'
import { collectTurnChanges, snapshotProjectRoots } from '../checkpoints/service'
import { getAcpProviderDetection } from './provider-registry'
import type { AcpProviderId } from './providers'
import { acquireAcpSession, disposeAcpSession } from './session-manager'
import { AcpTurnError, friendlyAcpError, runAcpTurn } from './turn'

export type AcpChatTurnContext = {
  emit: (payload: AgentChatEventPayload) => void
  requestApproval: (request: AgentCommandApprovalRequest, signal: AbortSignal) => Promise<AgentApprovalDecision>
}

/** Entry point from `src/main/agent/runner.ts` when an external agent is selected. */
export async function runAcpChatTurn(
  ctx: AcpChatTurnContext,
  payload: AgentChatStartPayload,
  manifest: GrokProjectManifest,
  projectId: string,
  providerId: AcpProviderId,
  ac: AbortController,
): Promise<void> {
  const providerLabel = AGENT_PROVIDER_LABELS[providerId]
  const detection = await getAcpProviderDetection(providerId)
  if (!detection.launch) {
    throw new AcpTurnError(
      `${providerLabel} is not available. ${detection.status.hint ?? 'Pick another coding agent in Settings.'}`,
    )
  }

  const root =
    manifest.roots.find((r) => r.id === payload.activeContext.activeRootId) ?? manifest.roots[0]
  if (!root) throw new AcpTurnError('This project has no workspace roots.')
  const additionalDirectories = manifest.roots.filter((r) => r.id !== root.id).map((r) => r.path)

  const threadHasUserTurns = payload.threadSnapshot.some((m) => m.role === 'user')

  let acquired: Awaited<ReturnType<typeof acquireAcpSession>>
  try {
    acquired = await acquireAcpSession({
      projectId,
      providerId,
      launch: detection.launch,
      cwd: root.path,
      additionalDirectories,
      fresh: !threadHasUserTurns,
    })
  } catch (e) {
    throw new AcpTurnError(friendlyAcpError(e, providerLabel, detection.loginHint))
  }

  const { session, reused } = acquired
  session.busy = true

  // Checkpoint every root so the turn's changes (from any agent tool, including shell
  // commands) can be reviewed and reverted afterwards.
  const checkpoints = await snapshotProjectRoots(projectId, manifest, `before turn ${payload.streamId}`)
  let reported = false
  const reportChanges = async () => {
    if (reported || checkpoints.size === 0) return
    reported = true
    const changes = await collectTurnChanges(projectId, manifest, checkpoints)
    if (changes.roots.length > 0) {
      ctx.emit({ streamId: payload.streamId, phase: 'turn_changes', changes })
    }
  }

  try {
    await runAcpTurn(
      {
        emit: ctx.emit,
        requestApproval: ctx.requestApproval,
        beforeDone: reportChanges,
        onFilesChanged: (paths) =>
          scheduleWorkspaceFilesystemRefresh({
            projectId,
            manifest,
            paths,
            notifyRenderer: true,
            reason: 'agent_write',
          }),
      },
      {
        payload,
        manifest,
        root,
        providerId,
        providerLabel,
        loginHint: detection.loginHint,
        session,
        sessionIsFresh: !reused && threadHasUserTurns,
        signal: ac.signal,
      },
    )
  } catch (e) {
    await reportChanges().catch(() => undefined)
    throw e
  } finally {
    session.busy = false
    // A dead agent (crash, sign-out) gets a fresh process on the next turn.
    if (!session.conn.isAlive) disposeAcpSession(projectId)
  }
}
