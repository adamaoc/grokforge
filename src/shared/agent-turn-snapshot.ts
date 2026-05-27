import type { AgentChatActiveContext, AgentChatTextModelIntent, AgentChatTurnRouting } from './agent-chat-contract'
import type { AgentProfileId } from './agent-profile'
import type { HarnessProfileKey } from './agent-harness-profile-contract'
import type { ReasoningEffort } from './agent-reasoning-effort'
import type { AgentModelChatMessage } from './agent-model-message'
import { parseOffloadedToolOriginalChars } from './agent-context-offload'

/** JSON-serializable tool definition frozen for a provider round (story 105). */
export type AgentSnapshotToolDefinition = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export type AgentTurnSnapshotRoundKind = 'tool_sample' | 'final_stream'

export type AgentTurnContextBudgetReport = {
  systemChars: number
  providerMessageChars: number
  toolResultChars: number
  /** Sum of original tool payload sizes replaced by offload pointers (story 107). */
  toolResultOffloadedOriginalChars?: number
}

export type AgentTurnSnapshot = {
  readonly snapshotId: string
  readonly streamId: string
  readonly traceId?: string
  readonly roundIndex: number
  readonly roundKind: AgentTurnSnapshotRoundKind
  readonly createdAt: string
  readonly modelId: string
  readonly modelIntent: AgentChatTextModelIntent
  readonly harnessProfileKey: HarnessProfileKey
  readonly agentProfileId: AgentProfileId
  readonly reasoningEffort?: ReasoningEffort
  readonly chatMode: 'fast' | 'plan'
  readonly systemMessages: readonly string[]
  readonly messagesForProvider: readonly AgentModelChatMessage[]
  readonly toolDefinitions: readonly AgentSnapshotToolDefinition[]
  readonly activeContext: Readonly<AgentChatActiveContext>
  readonly contextBudgetReport?: AgentTurnContextBudgetReport
}

export type AgentProviderRoundTraceSummary = {
  snapshotId: string
  roundIndex: number
  roundKind: AgentTurnSnapshotRoundKind
  modelId: string
  modelIntent?: AgentChatTextModelIntent
  harnessProfileKey?: HarnessProfileKey
  agentProfileId?: AgentProfileId
  reasoningEffort?: ReasoningEffort
  toolNames: string[]
  messageCounts: { system: number; user: number; assistant: number; tool: number }
  totalChars: number
  outcome?: 'completed' | 'cancelled'
}

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value)
  }
  return JSON.parse(JSON.stringify(value)) as T
}

export function splitSystemAndProviderMessages(messages: readonly AgentModelChatMessage[]): {
  systemMessages: string[]
  messagesForProvider: AgentModelChatMessage[]
} {
  const systemMessages: string[] = []
  const messagesForProvider: AgentModelChatMessage[] = []
  for (const m of messages) {
    if (m.role === 'system') {
      systemMessages.push(m.content)
    } else {
      messagesForProvider.push(cloneValue(m))
    }
  }
  return { systemMessages, messagesForProvider }
}

export function recombineSnapshotMessages(snapshot: Pick<
  AgentTurnSnapshot,
  'systemMessages' | 'messagesForProvider'
>): AgentModelChatMessage[] {
  const out: AgentModelChatMessage[] = []
  for (const content of snapshot.systemMessages) {
    out.push({ role: 'system', content })
  }
  for (const m of snapshot.messagesForProvider) {
    out.push(cloneValue(m))
  }
  return out
}

export function freezeToolDefinitions(
  defs: readonly { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }[],
): AgentSnapshotToolDefinition[] {
  return defs.map((d) => cloneValue(d))
}

function messageCharCount(m: AgentModelChatMessage): number {
  if (m.role === 'tool') return m.content.length
  if (m.role === 'assistant') {
    const base = m.content?.length ?? 0
    const tools = m.tool_calls?.reduce((n, tc) => n + tc.function.arguments.length + tc.function.name.length, 0) ?? 0
    return base + tools
  }
  return m.content.length
}

export function buildContextBudgetReport(
  systemMessages: readonly string[],
  messagesForProvider: readonly AgentModelChatMessage[],
): AgentTurnContextBudgetReport {
  const systemChars = systemMessages.reduce((n, s) => n + s.length, 0)
  let providerMessageChars = 0
  let toolResultChars = 0
  let toolResultOffloadedOriginalChars = 0
  for (const m of messagesForProvider) {
    providerMessageChars += messageCharCount(m)
    if (m.role === 'tool') {
      toolResultChars += m.content.length
      const offloadedOriginal = parseOffloadedToolOriginalChars(m.content)
      if (offloadedOriginal !== null) toolResultOffloadedOriginalChars += offloadedOriginal
    }
  }
  return {
    systemChars,
    providerMessageChars,
    toolResultChars,
    ...(toolResultOffloadedOriginalChars > 0 ? { toolResultOffloadedOriginalChars } : {}),
  }
}

export function countMessagesByRole(messages: readonly AgentModelChatMessage[]): {
  system: number
  user: number
  assistant: number
  tool: number
} {
  const counts = { system: 0, user: 0, assistant: 0, tool: 0 }
  for (const m of messages) {
    if (m.role === 'system') counts.system += 1
    else if (m.role === 'user') counts.user += 1
    else if (m.role === 'assistant') counts.assistant += 1
    else counts.tool += 1
  }
  return counts
}

export function summarizeSnapshotForTrace(
  snapshot: AgentTurnSnapshot,
  outcome?: 'completed' | 'cancelled',
): AgentProviderRoundTraceSummary {
  const recombined = recombineSnapshotMessages(snapshot)
  const messageCounts = countMessagesByRole(recombined)
  const budgetTotal =
    (snapshot.contextBudgetReport?.systemChars ?? 0) +
    (snapshot.contextBudgetReport?.providerMessageChars ?? 0)

  return {
    snapshotId: snapshot.snapshotId,
    roundIndex: snapshot.roundIndex,
    roundKind: snapshot.roundKind,
    modelId: snapshot.modelId,
    modelIntent: snapshot.modelIntent,
    harnessProfileKey: snapshot.harnessProfileKey,
    agentProfileId: snapshot.agentProfileId,
    reasoningEffort: snapshot.reasoningEffort,
    toolNames: snapshot.toolDefinitions.map((t) => t.function.name),
    messageCounts,
    totalChars: budgetTotal,
    outcome,
  }
}

export type BuildTurnSnapshotRouting = Pick<
  AgentChatTurnRouting,
  'modelId' | 'modelIntent' | 'harnessProfileKey' | 'agentProfileId' | 'reasoningEffort'
>

export function cloneActiveContextForSnapshot(ctx: AgentChatActiveContext): AgentChatActiveContext {
  return cloneValue(ctx)
}

export function cloneMessagesForSnapshot(messages: readonly AgentModelChatMessage[]): AgentModelChatMessage[] {
  return messages.map((m) => cloneValue(m))
}

/** Tool-sample completion budget — 1200 truncates full-file propose_file_edits (greenfield HTML). */
export const AGENT_CHAT_SAMPLE_MAX_TOKENS_PLANNER = 2048
/** Default profile tool_sample budget (story 129 — avoids truncated propose_file_edits on medium React files). */
export const AGENT_CHAT_SAMPLE_MAX_TOKENS_DEFAULT = 8192
export const AGENT_CHAT_SAMPLE_MAX_TOKENS_EXECUTOR = 16_384
export const AGENT_CHAT_SAMPLE_MAX_TOKENS_LEGACY = 1200

export function resolveAgentChatSampleMaxTokens(
  snapshot: Pick<AgentTurnSnapshot, 'roundKind' | 'agentProfileId'>,
): number {
  if (snapshot.roundKind !== 'tool_sample') {
    return AGENT_CHAT_SAMPLE_MAX_TOKENS_DEFAULT
  }
  switch (snapshot.agentProfileId) {
    case 'planner':
      return AGENT_CHAT_SAMPLE_MAX_TOKENS_PLANNER
    case 'executor':
      return AGENT_CHAT_SAMPLE_MAX_TOKENS_EXECUTOR
    case 'explorer':
      return AGENT_CHAT_SAMPLE_MAX_TOKENS_DEFAULT
    default:
      return AGENT_CHAT_SAMPLE_MAX_TOKENS_DEFAULT
  }
}

/** Payload sent to xAI for one provider round (derived from {@link AgentTurnSnapshot}). */
export type AgentProviderRequest = {
  snapshotId: string
  model: string
  messages: AgentModelChatMessage[]
  tools: readonly AgentSnapshotToolDefinition[]
  reasoningEffort?: ReasoningEffort
  /** Chat completions max_tokens for tool_sample rounds (story 105 transport). */
  sampleMaxTokens?: number
}

export function providerRequestFromSnapshot(snapshot: AgentTurnSnapshot): AgentProviderRequest {
  return {
    snapshotId: snapshot.snapshotId,
    model: snapshot.modelId,
    messages: recombineSnapshotMessages(snapshot),
    tools: snapshot.toolDefinitions.map((t) => cloneValue(t)),
    reasoningEffort: snapshot.reasoningEffort,
    sampleMaxTokens: resolveAgentChatSampleMaxTokens(snapshot),
  }
}
