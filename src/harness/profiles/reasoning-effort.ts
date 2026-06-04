/**
 * Chat completions `reasoning_effort` policy (story 121).
 * Only Grok 4.3 family models accept this parameter; build rejects it.
 */

import type { AgentChatTextModelIntent } from '../../shared/agent-chat-contract'
import type { AgentProfileId } from './agent-profile'
import type { HarnessProfileKey } from './contracts/harness-profile-key'

export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high'

export function resolveReasoningEffort(input: {
  modelId: string
  harnessProfileKey: HarnessProfileKey
  agentProfileId: AgentProfileId
  modelIntent: AgentChatTextModelIntent
}): ReasoningEffort | undefined {
  if (input.harnessProfileKey !== 'grok_4_3') return undefined

  if (input.agentProfileId === 'planner') return 'medium'

  if (input.agentProfileId === 'executor' || input.modelIntent === 'execution') return 'low'

  return 'low'
}
