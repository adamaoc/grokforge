/**
 * Model + profile routing for child subagent sessions (story 112).
 */

import type { AgentChatTurnRouting } from './agent-chat-contract'
import { resolveHarnessProfileKey } from './agent-harness-profile-contract'
import { getModelForIntent, type ModelRoutingManifest } from './model-router'

export type SubagentModelIntent = 'planning' | 'reasoning'

export function resolveSubagentTurnRouting(
  manifest: ModelRoutingManifest,
  modelIntent: SubagentModelIntent = 'planning',
): AgentChatTurnRouting {
  const modelId = getModelForIntent(manifest, modelIntent, { logSelection: true })
  return {
    modelIntent: 'planning',
    modelId,
    harnessProfileKey: resolveHarnessProfileKey(modelId),
    agentProfileId: 'explorer',
  }
}
