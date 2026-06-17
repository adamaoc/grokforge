/**
 * Harness v2 turn routing — profile, model, and IPC metadata from the chat payload.
 */

import type { GrokProjectManifest } from '../../main/project/manifest'
import type {
  AgentChatStartPayload,
  AgentChatTurnRouting,
} from '../../shared/agent/chat-contract'
import { resolveAgentTurnRouting } from '../../harness-support/routing/turn-routing'
import { PLAN_PROFILE, type HarnessPlanProfile } from './plan-profile'
import { WORK_PROFILE, type HarnessWorkProfile } from './work-profile'

export type HarnessTurnMode = 'work' | 'plan'

export type HarnessProfile = HarnessWorkProfile | HarnessPlanProfile

export function resolveHarnessTurnMode(payload: AgentChatStartPayload): HarnessTurnMode {
  if (payload.isApprovedPlanAutoRun) return 'work'
  return payload.activeContext.chatMode === 'plan' ? 'plan' : 'work'
}

export function resolveHarnessProfile(payload: AgentChatStartPayload): HarnessProfile {
  return resolveHarnessTurnMode(payload) === 'plan' ? PLAN_PROFILE : WORK_PROFILE
}

/** IPC `turn_started.routing` — aligned with legacy main routing matrix. */
export function resolveHarnessTurnRouting(
  manifest: GrokProjectManifest,
  payload: AgentChatStartPayload,
): AgentChatTurnRouting {
  return resolveAgentTurnRouting(manifest, {
    modelIntent: payload.modelIntent,
    activeContext: payload.activeContext,
    isApprovedPlanAutoRun: payload.isApprovedPlanAutoRun,
  })
}