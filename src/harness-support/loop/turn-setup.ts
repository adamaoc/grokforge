import type { GrokProjectManifest } from '../../main/project/manifest'
import type {
  AgentChatStartPayload,
  AgentChatTurnRouting,
} from '../../shared/agent/chat-contract'
import type { AgentModelChatMessage } from '../../shared/agent/model-message'
import type { AgentProfile } from '../profiles/agent-profile'
import type { AgentHarnessProfile, HarnessPromptTurnContext } from '../profiles/harness-profile'

export type PreparedRetrieval = {
  count: number
  context: string
  details: string[]
}

export type PreparedTurn = {
  projectId: string
  manifest: GrokProjectManifest
  safePayload: AgentChatStartPayload
  routing: AgentChatTurnRouting
  harnessProfile: AgentHarnessProfile
  agentProfile: AgentProfile
  turnToolDefinitions: readonly unknown[]
  messages: AgentModelChatMessage[]
  harnessCtx: HarnessPromptTurnContext
  retrieval: PreparedRetrieval
}

export function createPreparedTurn(input: PreparedTurn): PreparedTurn {
  return input
}
