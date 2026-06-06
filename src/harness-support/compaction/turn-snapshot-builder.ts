import { randomUUID } from 'node:crypto'
import type { AgentChatActiveContext, AgentChatTurnRouting } from '../../shared/agent/chat-contract'
import type { AgentModelChatMessage } from '../../shared/agent/model-message'
import type { AgentToolDefinition } from '../tools/workspace-tools'
import {
  buildContextBudgetReport,
  cloneActiveContextForSnapshot,
  cloneMessagesForSnapshot,
  freezeToolDefinitions,
  splitSystemAndProviderMessages,
  type AgentTurnSnapshot,
  type AgentTurnSnapshotRoundKind,
} from './turn-snapshot'

export type BuildTurnSnapshotInput = {
  roundIndex: number
  roundKind: AgentTurnSnapshotRoundKind
  streamId: string
  traceId?: string
  routing: AgentChatTurnRouting
  chatMode: 'fast' | 'plan'
  messages: readonly AgentModelChatMessage[]
  toolDefinitions: readonly AgentToolDefinition[]
  activeContext: AgentChatActiveContext
}

export function buildTurnSnapshot(input: BuildTurnSnapshotInput): AgentTurnSnapshot {
  const clonedMessages = cloneMessagesForSnapshot(input.messages)
  const { systemMessages, messagesForProvider } = splitSystemAndProviderMessages(clonedMessages)
  const contextBudgetReport = buildContextBudgetReport(systemMessages, messagesForProvider)

  return {
    snapshotId: randomUUID(),
    streamId: input.streamId,
    traceId: input.traceId,
    roundIndex: input.roundIndex,
    roundKind: input.roundKind,
    createdAt: new Date().toISOString(),
    modelId: input.routing.modelId,
    modelIntent: input.routing.modelIntent,
    harnessProfileKey: input.routing.harnessProfileKey,
    agentProfileId: input.routing.agentProfileId,
    reasoningEffort: input.routing.reasoningEffort,
    chatMode: input.chatMode,
    systemMessages,
    messagesForProvider,
    toolDefinitions: freezeToolDefinitions(input.toolDefinitions),
    activeContext: cloneActiveContextForSnapshot(input.activeContext),
    contextBudgetReport,
  }
}
