/**
 * Named agent tool bundles (story 104). Profiles compose toolsets into allowedTools.
 */

import type { AgentChatToolName } from '../../../shared/agent/chat-contract'

export type AgentToolsetId = 'read_only' | 'edit' | 'command' | 'full'

export const AGENT_TOOLSET_READ_ONLY: readonly AgentChatToolName[] = [
  'workspace_index',
  'list_directory',
  'read_file',
  'search_workspace',
] as const

export const AGENT_TOOLSET_EDIT: readonly AgentChatToolName[] = [
  'edit',           // Preferred structured edit tool (Pi-style precise replacements). Use this for modifications.
  'propose_file_edits', // Primarily for new files or very large refactors now.
] as const

export const AGENT_TOOLSET_COMMAND: readonly AgentChatToolName[] = ['run_command'] as const

export const AGENT_TOOLSET_FULL: readonly AgentChatToolName[] = [
  ...AGENT_TOOLSET_READ_ONLY,
  ...AGENT_TOOLSET_EDIT,
  ...AGENT_TOOLSET_COMMAND,
] as const

const TOOLSET_BY_ID: Record<Exclude<AgentToolsetId, 'full'>, readonly AgentChatToolName[]> = {
  read_only: AGENT_TOOLSET_READ_ONLY,
  edit: AGENT_TOOLSET_EDIT,
  command: AGENT_TOOLSET_COMMAND,
}

/** Expand one or more toolset ids to a deduped tool name list. `full` is only valid alone. */
export function expandToolset(ids: AgentToolsetId | readonly AgentToolsetId[]): AgentChatToolName[] {
  const list = Array.isArray(ids) ? ids : [ids]
  if (list.includes('full')) return [...AGENT_TOOLSET_FULL]
  const out = new Set<AgentChatToolName>()
  for (const id of list) {
    if (id === 'full') continue
    const toolset = TOOLSET_BY_ID[id as keyof typeof TOOLSET_BY_ID]
    for (const name of toolset) out.add(name)
  }
  return [...out]
}

export function isToolInToolset(name: AgentChatToolName, toolset: readonly AgentChatToolName[]): boolean {
  return toolset.includes(name)
}
