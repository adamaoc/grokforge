/**
 * Agent turn model routing (story 097). Profile axis: agent-profile; model axis: model-router.
 */

import type { AgentChatStartPayload, AgentChatTextModelIntent, AgentChatTurnRouting } from './agent-chat-contract'
import { resolveAgentProfileId } from './agent-profile'
import { resolveHarnessProfileKey } from './agent-harness-profile-contract'
import { resolveReasoningEffort } from './agent-reasoning-effort'
import { getModelForIntent, type ModelRoutingManifest } from './model-router'

export type AgentTurnRoutingInput = Pick<
  AgentChatStartPayload,
  'modelIntent' | 'activeContext' | 'isApprovedPlanAutoRun'
> & {
  /** Story 120: approved/superseded plan exists + incremental Work follow-up. */
  postPlanIncremental?: boolean
}

/*
 * Routing matrix (canonical — main `resolveAgentTurnRouting`, renderer previews via
 * `nextSendModelIntent` + `turn_started.routing`).
 *
 * Two independent axes:
 *   • **modelIntent** → manifest slot → `modelId` (`getModelForIntent`)
 *   • **agentProfileId** → tool allowlist (`resolveAgentProfileId` in agent-profile.ts)
 *
 * Model intent precedence (`resolveAgentChatModelIntent`):
 *   1. `isApprovedPlanAutoRun` → execution
 *   2. explicit `modelIntent` from composer chip (any chatMode)
 *   3. `postPlanIncremental` → execution when chip omitted (story 120)
 *   4. `activeContext.chatMode === 'plan'` with no chip → planning
 *   5. else → chat_default
 *
 * Profile precedence (`resolveAgentProfileId` — plan mode wins over execution chip):
 *   1. `activeContext.chatMode === 'plan'` → planner
 *   2. `isApprovedPlanAutoRun` OR `postPlanIncremental` OR `modelIntent === 'execution'` → executor
 *   3. else → default
 *
 * Typical combinations (chatMode = Work/fast unless noted):
 *
 *   Condition                          | modelIntent   | manifest slot      | profile
 *   -----------------------------------|---------------|--------------------|----------
 *   Work, default chip                 | chat_default  | models.default     | default
 *   Work, planning chip                | planning      | models.planning    | default
 *   Work, execution chip               | execution     | models.execution   | executor
 *   Plan mode, no chip                 | planning      | models.planning    | planner
 *   Plan mode, Fast chip               | chat_default  | models.default     | planner
 *   Plan mode, planning chip           | planning      | models.planning    | planner
 *   Approve and run (`isApproved…`)    | execution     | models.execution   | executor
 *                                      | (fast ctx)    |                    |
 *
 * Renderer `model` on agent-chat-start is a hint only; xAI uses `routing.modelId` from main.
 */

/**
 * Resolves which manifest model slot drives this turn (canonical in main).
 * Precedence: approve-and-run → explicit chip → plan default → fast default.
 */
export function resolveAgentChatModelIntent(payload: AgentTurnRoutingInput): AgentChatTextModelIntent {
  if (payload.isApprovedPlanAutoRun) {
    return 'execution'
  }
  if (payload.modelIntent) return payload.modelIntent
  if (payload.postPlanIncremental) {
    return 'execution'
  }
  if (payload.activeContext.chatMode === 'plan') return 'planning'
  return 'chat_default'
}

export function resolveAgentTurnRouting(
  manifest: ModelRoutingManifest,
  payload: AgentTurnRoutingInput,
): AgentChatTurnRouting {
  const modelIntent = resolveAgentChatModelIntent(payload)
  const modelId = getModelForIntent(manifest, modelIntent, { logSelection: true })
  const harnessProfileKey = resolveHarnessProfileKey(modelId)
  const agentProfileId = resolveAgentProfileId(payload)
  const reasoningEffort = resolveReasoningEffort({
    modelId,
    harnessProfileKey,
    agentProfileId,
    modelIntent,
  })
  return { modelIntent, modelId, harnessProfileKey, agentProfileId, reasoningEffort }
}
