import type { AgentChatActiveContext, AgentChatEventPayload, AgentChatToolName } from '../../shared/agent-chat-contract'
import type { AgentChatTurnRouting } from '../../shared/agent-chat-contract'
import {
  createThrottledProgress,
  type AgentToolExecutionContext,
  type AgentToolProgressUpdate,
} from './contracts/execution-context'
import type { GrokProjectManifest } from '../../main/manifest'
import { getAgentTurnReadHashes, getAgentTurnReads, recordAgentTurnRead } from '../context/turn-read-registry'

export type BuildAgentToolExecutionContextInput = {
  projectId: string
  streamId: string
  snapshotId: string
  toolCallId: string
  activityId: string
  toolName?: AgentChatToolName
  routing: AgentChatTurnRouting
  activeContext: AgentChatActiveContext
  manifest: GrokProjectManifest
  sessionDepth?: AgentToolExecutionContext['sessionDepth']
  childSessionId?: string
  abortSignal: AbortSignal
  emit: (payload: AgentChatEventPayload) => void
  waitForCommandApproval: (requestId: string, streamId: string, signal: AbortSignal) => Promise<boolean>
}

export function buildAgentToolExecutionContext(
  input: BuildAgentToolExecutionContextInput,
): AgentToolExecutionContext {
  const throttledProgress = createThrottledProgress((update: AgentToolProgressUpdate) => {
    if (!input.toolName) return
    input.emit({
      streamId: input.streamId,
      phase: 'activity',
      activity: {
        id: input.activityId,
        tool: input.toolName,
        title: update.title ?? `Using ${input.toolName}`,
        detail: update.detail,
        status: 'running',
      },
    })
  })

  const readRegistryKey = input.childSessionId ?? input.streamId

  return {
    projectId: input.projectId,
    streamId: input.streamId,
    snapshotId: input.snapshotId,
    toolCallId: input.toolCallId,
    activityId: input.activityId,
    toolName: input.toolName,
    agentProfileId: input.routing.agentProfileId,
    harnessProfileKey: input.routing.harnessProfileKey,
    sessionDepth: input.sessionDepth ?? 'parent',
    childSessionId: input.childSessionId,
    abortSignal: input.abortSignal,
    manifest: input.manifest,
    roots: input.manifest.roots,
    activeContext: input.activeContext,
    readPathsThisTurn: getAgentTurnReads(readRegistryKey),
    readHashesThisTurn: getAgentTurnReadHashes(readRegistryKey),
    emitProgress: throttledProgress,
    recordPathRead: (resolvedAbsolutePath, contentHash) => {
      recordAgentTurnRead(readRegistryKey, resolvedAbsolutePath, contentHash)
    },
    askCommandApproval: async ({ requestId, request }) => {
      input.emit({
        streamId: input.streamId,
        phase: 'command_approval_required',
        request: {
          requestId,
          streamId: input.streamId,
          ...request,
        },
      })
      return input.waitForCommandApproval(requestId, input.streamId, input.abortSignal)
    },
  }
}
