/**
 * Phase-based agent profiles — tool allowlists (story 104).
 * Harness copy tuning remains in agent-harness-profile (103).
 */

import type { AgentChatStartPayload, AgentChatToolName } from './agent-chat-contract'
import { AGENT_TOOLSET_FULL, AGENT_TOOLSET_READ_ONLY, expandToolset } from './agent-toolset'

export type AgentProfileId = 'default' | 'planner' | 'executor' | 'explorer'

export type AgentProfile = {
  id: AgentProfileId
  displayName: string
  allowedTools: readonly AgentChatToolName[]
  /** Tools not in allowedTools (for docs / debugging). */
  deniedTools: readonly AgentChatToolName[]
  maxToolRounds?: number
  canProposeEdits: boolean
  canRunCommand: boolean
}

const ALL_TOOL_NAMES = expandToolset('full')

function deniedToolsFor(allowed: readonly AgentChatToolName[]): AgentChatToolName[] {
  const allowedSet = new Set(allowed)
  return ALL_TOOL_NAMES.filter((t) => !allowedSet.has(t))
}

const PROFILE_PLANNER: AgentProfile = {
  id: 'planner',
  displayName: 'Planner',
  allowedTools: [...AGENT_TOOLSET_READ_ONLY],
  deniedTools: deniedToolsFor(AGENT_TOOLSET_READ_ONLY),
  maxToolRounds: 3,
  canProposeEdits: false,
  canRunCommand: false,
}

const PROFILE_EXECUTOR: AgentProfile = {
  id: 'executor',
  displayName: 'Executor',
  allowedTools: [...AGENT_TOOLSET_FULL, 'spawn_subagent'],
  deniedTools: deniedToolsFor([...AGENT_TOOLSET_FULL, 'spawn_subagent']),
  maxToolRounds: 6,
  canProposeEdits: true,
  canRunCommand: true,
}

const PROFILE_DEFAULT: AgentProfile = {
  id: 'default',
  displayName: 'Default',
  allowedTools: [...AGENT_TOOLSET_FULL, 'spawn_subagent'],
  deniedTools: deniedToolsFor([...AGENT_TOOLSET_FULL, 'spawn_subagent']),
  canProposeEdits: true,
  canRunCommand: true,
}

/** Read-only child subagent profile (story 112). */
const PROFILE_EXPLORER: AgentProfile = {
  id: 'explorer',
  displayName: 'Explorer',
  allowedTools: [...AGENT_TOOLSET_READ_ONLY],
  deniedTools: deniedToolsFor(AGENT_TOOLSET_READ_ONLY),
  maxToolRounds: 5,
  canProposeEdits: false,
  canRunCommand: false,
}

const AGENT_PROFILES: Record<AgentProfileId, AgentProfile> = {
  default: PROFILE_DEFAULT,
  planner: PROFILE_PLANNER,
  executor: PROFILE_EXECUTOR,
  explorer: PROFILE_EXPLORER,
}

export function getAgentProfile(id: AgentProfileId): Readonly<AgentProfile> {
  return AGENT_PROFILES[id] ?? AGENT_PROFILES.default
}

/**
 * Product phase → profile. Plan mode wins over execution intent.
 */
export function resolveAgentProfileId(
  payload: Pick<AgentChatStartPayload, 'modelIntent' | 'activeContext' | 'isApprovedPlanAutoRun'> & {
    postPlanIncremental?: boolean
  },
): AgentProfileId {
  if (payload.activeContext.chatMode === 'plan') return 'planner'
  if (
    payload.isApprovedPlanAutoRun ||
    payload.postPlanIncremental ||
    payload.modelIntent === 'execution'
  ) {
    return 'executor'
  }
  return 'default'
}

export function isToolAllowedForProfile(
  name: AgentChatToolName,
  profile: Readonly<AgentProfile>,
): boolean {
  return profile.allowedTools.includes(name)
}

export function isToolAllowedForProfileId(name: AgentChatToolName, profileId: AgentProfileId): boolean {
  return isToolAllowedForProfile(name, getAgentProfile(profileId))
}
