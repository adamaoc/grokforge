/**
 * Agent turn model routing (story 097). Profile axis: agent-profile; model axis: model-router.
 */

import type { AgentChatStartPayload, AgentChatTextModelIntent, AgentChatTurnRouting } from './agent-chat-contract'
import { resolveAgentProfileId } from './agent-profile'
import { resolveHarnessProfileKey } from './agent-harness-profile-contract'
import { resolveReasoningEffort } from './agent-reasoning-effort'
import { getModelForIntent, type ModelRoutingManifest } from './model-router'

/** True when the user picked Planning or Execution chip (not implicit Work/Fast default). */
export function isExplicitComposerModelIntent(
  modelIntent: AgentChatTextModelIntent | undefined,
): boolean {
  return modelIntent === 'planning' || modelIntent === 'execution'
}

export type AgentTurnRoutingInput = Pick<
  AgentChatStartPayload,
  'modelIntent' | 'activeContext' | 'isApprovedPlanAutoRun'
> & {
  /** Story 120: approved/superseded plan exists + incremental Work follow-up. */
  postPlanIncremental?: boolean
  /** Story 130: non-greenfield workspace + edit-intent Work follow-up without replan. */
  iterativeWorkEdit?: boolean
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
 *   2. explicit Planning / Execution chip from composer (not implicit `chat_default`)
 *   3. `postPlanIncremental` → execution when default chip (story 120)
 *   4. `iterativeWorkEdit` → execution when default chip (story 130)
 *   5. `activeContext.chatMode === 'plan'` with no chip → planning
 *   6. else → chat_default
 *
 * Profile precedence (`resolveAgentProfileId` — plan mode wins over execution chip):
 *   1. `activeContext.chatMode === 'plan'` → planner
 *   2. `isApprovedPlanAutoRun` OR `postPlanIncremental` OR `iterativeWorkEdit` OR `modelIntent === 'execution'` → executor
 *   3. else → default
 *
 * Typical combinations (chatMode = Work/fast unless noted):
 *
 *   Condition                          | modelIntent   | manifest slot      | profile
 *   -----------------------------------|---------------|--------------------|----------
 *   Work, default chip                 | chat_default  | models.default     | default
 *   Work, default chip + edit (130)    | execution     | models.execution   | executor
 *   Work, planning chip                | planning      | models.planning    | default
 *   Work, execution chip               | execution     | models.execution   | executor
 *   Plan mode, no chip                 | planning      | models.planning    | planner
 *   Plan mode, default / Fast chip (renderer)  | planning      | models.planning    | planner
 *   Plan mode, planning chip           | planning      | models.planning    | planner
 *   Approve and run (`isApproved…`)    | execution     | models.execution   | executor
 *                                      | (fast ctx)    |                    |
 *   Work, edit on non-greenfield repo   | execution     | models.execution   | executor
 *   (no chip, story 130)               |               |                    |
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
  if (payload.modelIntent === 'planning') {
    return 'planning'
  }
  if (payload.modelIntent === 'execution') {
    return 'execution'
  }
  if (payload.postPlanIncremental) {
    return 'execution'
  }
  if (payload.iterativeWorkEdit) {
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
