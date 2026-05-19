import type { AgentChatTurnRouting } from '@/types'
import type { AgentProfileId } from '../../../shared/agent-profile'

const PROFILE_LABELS: Record<AgentProfileId, string> = {
  planner: 'Planner',
  executor: 'Executor',
  default: 'Default',
  explorer: 'Explorer',
}

export function formatAgentProfileLabel(profileId: AgentProfileId): string {
  return PROFILE_LABELS[profileId] ?? profileId
}

/** Single-line label for execute phase UI (story 098). */
export function formatAgentTurnRoutingLine(
  routing: AgentChatTurnRouting,
  options?: { verb?: string },
): string {
  const verb = options?.verb ?? 'Executing'
  return `${verb} · ${routing.modelId} · ${formatAgentProfileLabel(routing.agentProfileId)}`
}
