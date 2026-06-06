/**
 * Model + profile routing for child subagent sessions (story 112).
 */

import type { AgentChatTurnRouting } from '../../../shared/agent/chat-contract'
import { resolveHarnessProfileKey } from '../../profiles/contracts/harness-profile-key'
import { getModelForIntent, type ModelRoutingManifest } from '../../routing/model-router'

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
