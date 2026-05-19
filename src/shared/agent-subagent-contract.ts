/**
 * Subagent child sessions and spawn_subagent tool contract (story 112).
 */

import { z } from 'zod'
import type { AgentProfileId } from './agent-profile'
import type { ModelIntent } from './model-router'

export const SUBAGENT_MAX_TOOL_ROUNDS = 5
export const SUBAGENT_MAX_RETURN_CHARS = 4000
export const SUBAGENT_MAX_FILES_READ = 32
export const SUBAGENT_MAX_SEARCH_HITS = 24
export const SUBAGENT_MAX_NESTED_ACTIVITIES = 8

export const SpawnSubagentArgsSchema = z.object({
  task: z.string().min(1).max(8000),
  profile: z.literal('explorer').optional(),
  modelIntent: z.enum(['planning', 'reasoning']).optional(),
})

export type SpawnSubagentArgs = z.infer<typeof SpawnSubagentArgsSchema>

export const SubagentSearchHitSchema = z.object({
  query: z.string(),
  path: z.string(),
  line: z.number().int().positive().optional(),
})

export const SubagentResultArtifactSchema = z.object({
  summary: z.string(),
  filesRead: z.array(z.string()),
  searchHits: z.array(SubagentSearchHitSchema),
})

export type SubagentResultArtifact = z.infer<typeof SubagentResultArtifactSchema>

export type SubagentSessionStatus = 'running' | 'done' | 'error' | 'interrupted'

export type AgentSubagentEventPayload = {
  childSessionId: string
  status: SubagentSessionStatus
  title: string
  profileId: Extract<AgentProfileId, 'explorer'>
  activities: Array<{
    id: string
    tool?: string
    title: string
    detail?: string
    status: 'running' | 'done' | 'error' | 'interrupted'
  }>
  result?: SubagentResultArtifact
  error?: string
}

export type AgentSubagentSessionMeta = {
  type: 'session_meta'
  childSessionId: string
  parentStreamId: string
  parentTurnTraceId?: string
  profileId: 'explorer'
  modelId: string
  modelIntent: Extract<ModelIntent, 'planning' | 'reasoning'>
  createdAt: string
  task: string
}

export type AgentSubagentSessionToolCallEvent = {
  type: 'tool_call'
  at: string
  toolCallId: string
  toolName: string
  arguments: string
}

export type AgentSubagentSessionToolResultEvent = {
  type: 'tool_result'
  at: string
  toolCallId: string
  toolName: string
  ok: boolean
  contentPreview: string
}

export type AgentSubagentSessionSummaryEvent = {
  type: 'summary'
  at: string
  artifact: SubagentResultArtifact
}

export type AgentSubagentSessionTerminalEvent = {
  type: 'terminal'
  at: string
  status: SubagentSessionStatus
  error?: string
}

export type AgentSubagentSessionLine =
  | AgentSubagentSessionMeta
  | AgentSubagentSessionToolCallEvent
  | AgentSubagentSessionToolResultEvent
  | AgentSubagentSessionSummaryEvent
  | AgentSubagentSessionTerminalEvent

export function capSubagentArtifact(artifact: SubagentResultArtifact): SubagentResultArtifact {
  return {
    summary: artifact.summary,
    filesRead: [...new Set(artifact.filesRead)].slice(0, SUBAGENT_MAX_FILES_READ),
    searchHits: artifact.searchHits.slice(0, SUBAGENT_MAX_SEARCH_HITS),
  }
}

/** Serialize artifact for parent tool result, truncating to SUBAGENT_MAX_RETURN_CHARS. */
export function serializeSubagentResultForParent(artifact: SubagentResultArtifact): string {
  const capped = capSubagentArtifact(artifact)
  let json = JSON.stringify(capped)
  if (json.length <= SUBAGENT_MAX_RETURN_CHARS) return json

  const shrink: SubagentResultArtifact = {
    summary: truncateUtf8(capped.summary, Math.floor(SUBAGENT_MAX_RETURN_CHARS * 0.6)),
    filesRead: capped.filesRead.slice(0, 8),
    searchHits: capped.searchHits.slice(0, 8),
  }
  json = JSON.stringify(shrink)
  if (json.length <= SUBAGENT_MAX_RETURN_CHARS) return json

  return JSON.stringify({
    summary: truncateUtf8(shrink.summary, SUBAGENT_MAX_RETURN_CHARS - 80),
    filesRead: shrink.filesRead.slice(0, 4),
    searchHits: [],
  })
}

function truncateUtf8(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`
}

export function buildFallbackSubagentArtifact(input: {
  task: string
  filesRead: string[]
  searchHits: SubagentResultArtifact['searchHits']
  note?: string
}): SubagentResultArtifact {
  const files = [...new Set(input.filesRead)].slice(0, SUBAGENT_MAX_FILES_READ)
  const hits = input.searchHits.slice(0, SUBAGENT_MAX_SEARCH_HITS)
  const parts = [
    input.note ?? 'Exploration completed.',
    files.length > 0 ? `Read ${files.length} file(s).` : 'No files read.',
    hits.length > 0 ? `${hits.length} search hit(s).` : '',
  ].filter(Boolean)
  return capSubagentArtifact({
    summary: parts.join(' '),
    filesRead: files,
    searchHits: hits,
  })
}
