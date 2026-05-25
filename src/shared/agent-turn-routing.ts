/**
 * Agent turn model routing (story 097). Profile axis: agent-profile; model axis: model-router.
 */

import type { AgentChatStartPayload, AgentChatTextModelIntent, AgentChatTurnRouting } from './agent-chat-contract'
import { resolveAgentProfileId } from './agent-profile'
import { resolveHarnessProfileKey } from './agent-harness-profile-contract'
import { getModelForIntent, type ModelRoutingManifest } from './model-router'

export type AgentTurnRoutingInput = Pick<
  AgentChatStartPayload,
  'modelIntent' | 'activeContext' | 'isApprovedPlanAutoRun' | 'planWorkflowUsePlanningModel'
>

/**
 * Resolves which manifest model slot drives this turn (canonical in main).
 * Precedence: approve-and-run → explicit chip → plan default → fast default.
 */
export function resolveAgentChatModelIntent(payload: AgentTurnRoutingInput): AgentChatTextModelIntent {
  if (payload.isApprovedPlanAutoRun) {
    return payload.planWorkflowUsePlanningModel ? 'planning' : 'execution'
  }
  if (payload.modelIntent) return payload.modelIntent
  if (payload.activeContext.chatMode === 'plan') return 'planning'
  return 'chat_default'
}

/** @deprecated Use {@link resolveAgentChatModelIntent}. */
export function inferAgentChatModelIntent(payload: AgentTurnRoutingInput): AgentChatTextModelIntent {
  return resolveAgentChatModelIntent(payload)
}

export function resolveAgentTurnRouting(
  manifest: ModelRoutingManifest,
  payload: AgentTurnRoutingInput,
): AgentChatTurnRouting {
  const modelIntent = resolveAgentChatModelIntent(payload)
  const modelId = getModelForIntent(manifest, modelIntent, { logSelection: true })
  const harnessProfileKey = resolveHarnessProfileKey(modelId)
  const agentProfileId = resolveAgentProfileId(payload)
  return { modelIntent, modelId, harnessProfileKey, agentProfileId }
}
