/**
 * Resolves the harness system prompt for one turn (plan, work, or approved-plan execute).
 */

import type { GrokProjectManifest } from '../../main/project/manifest'
import { buildApprovedPlanSystemInjection } from '../../harness-support/plan/contracts/plan-artifact'
import type { StoredPlanArtifact } from '../../harness-support/plan/contracts/plan-artifact'
import { loadPlanArtifact, planJsonPath } from '../../harness-support/plan/store/plan-store'
import type { AgentChatStartPayload } from '../../shared/agent/chat-contract'
import type { PlanProjectSnapshot } from '../context/project-snapshot'
import { buildHarnessPlanSystemPrompt } from '../profile/plan-profile'
import type { HarnessProfileKey } from '../profile/profile-key'
import type { HarnessTurnMode } from '../profile/turn-routing'
import {
  buildHarnessExecuteSystemPromptAppendix,
  buildHarnessSystemPrompt,
} from '../profile/work-profile'

export type HarnessTurnSystemPromptResult = {
  systemPrompt: string
  approvedPlanArtifact: StoredPlanArtifact | null
}

export function buildHarnessTurnSystemPrompt(input: {
  turnMode: HarnessTurnMode
  manifest: GrokProjectManifest
  snapshot: PlanProjectSnapshot | null
  profileKey: HarnessProfileKey
  payload: AgentChatStartPayload
  projectId: string
}): HarnessTurnSystemPromptResult {
  const { turnMode, manifest, snapshot, profileKey, payload, projectId } = input

  let systemPrompt =
    turnMode === 'plan' && snapshot
      ? buildHarnessPlanSystemPrompt({
          manifest,
          snapshot,
          profileKey,
        })
      : buildHarnessSystemPrompt(manifest)

  let approvedPlanArtifact: StoredPlanArtifact | null = null
  if (payload.isApprovedPlanAutoRun && payload.approvedPlanId) {
    approvedPlanArtifact = loadPlanArtifact(projectId, payload.approvedPlanId)
    if (approvedPlanArtifact) {
      systemPrompt += buildApprovedPlanSystemInjection(
        approvedPlanArtifact,
        planJsonPath(projectId, payload.approvedPlanId),
      )
    }
    systemPrompt += buildHarnessExecuteSystemPromptAppendix()
  }

  return { systemPrompt, approvedPlanArtifact }
}