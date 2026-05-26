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

/** Single-line label for execute phase UI (story 098). Dev builds append harness profile + reasoning effort (121). */
export function formatAgentTurnRoutingLine(
  routing: AgentChatTurnRouting,
  options?: { verb?: string },
): string {
  const verb = options?.verb ?? 'Executing'
  const base = `${verb} · ${routing.modelId} · ${formatAgentProfileLabel(routing.agentProfileId)}`
  if (!import.meta.env.DEV) return base
  const devParts: string[] = [routing.harnessProfileKey]
  if (routing.reasoningEffort) devParts.push(`effort:${routing.reasoningEffort}`)
  return `${base} · ${devParts.join(' · ')}`
}
