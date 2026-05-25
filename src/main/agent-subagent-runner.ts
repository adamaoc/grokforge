/**
 * Bounded read-only child agent sessions (story 112).
 * Intentionally mirrors a slim slice of agent-runner tool loop; consolidate later if needed.
 */

import type { AgentModelChatMessage, AgentModelToolCall } from '../shared/agent-model-message'
import { providerRequestFromSnapshot } from '../shared/agent-turn-snapshot'
import type {
  AgentChatActiveContext,
  AgentChatEventPayload,
  AgentChatToolName,
} from '../shared/agent-chat-contract'
import type { AgentSubagentEventPayload } from '../shared/agent-subagent-contract'
import {
  SUBAGENT_MAX_NESTED_ACTIVITIES,
  SUBAGENT_MAX_TOOL_ROUNDS,
  SpawnSubagentArgs,
  SubagentResultArtifactSchema,
  buildFallbackSubagentArtifact,
  serializeSubagentResultForParent,
} from '../shared/agent-subagent-contract'
import { resolveSubagentTurnRouting } from '../shared/agent-subagent-routing'
import { getAgentProfile } from '../shared/agent-profile'
import { getHarnessProfile } from '../shared/agent-harness-profile'
import type { GrokProjectManifest } from './manifest'
import {
  createHttpAgentChatModelTransport,
  type AgentChatModelTransport,
} from './agent-chat-model-transport'
import { buildAgentToolExecutionContext } from './agent-tool-execution-context-builder'
import { executeAgentToolCall } from './agent-tool-executor'
import { buildTurnSnapshot } from './agent-turn-snapshot-builder'
import {
  AGENT_TOOL_MAX_ITERATIONS,
  buildAgentToolDefinitions,
  filterToolDefinitionsForProfile,
} from './agent-workspace-tools'
import {
  appendSessionEvent,
  finalizeSession,
  initChildSessionFile,
  newChildSessionId,
} from './agent-session-store'
import { clearAgentTurnReads } from './agent-turn-read-registry'

let subagentTransport: AgentChatModelTransport = createHttpAgentChatModelTransport()

export function setAgentSubagentModelTransportForTests(transport: AgentChatModelTransport | null): void {
  subagentTransport = transport ?? createHttpAgentChatModelTransport()
}

export type RunSubagentSessionInput = {
  projectId: string
  parentStreamId: string
  manifest: GrokProjectManifest
  activeContext: AgentChatActiveContext
  args: SpawnSubagentArgs
  abortSignal: AbortSignal
  emit: (payload: AgentChatEventPayload) => void
  waitForCommandApproval: (requestId: string, streamId: string, signal: AbortSignal) => Promise<boolean>
}

export type RunSubagentSessionResult = {
  ok: boolean
  toolContent: string
  displayTitle: string
  displayDetail?: string
}

function activityId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function isAllowedChildToolName(name: string): name is AgentChatToolName {
  return (
    name === 'workspace_index' ||
    name === 'list_directory' ||
    name === 'read_file' ||
    name === 'search_workspace'
  )
}

function accumulateFromToolResult(
  name: string,
  toolContent: string,
  filesRead: string[],
  searchHits: Array<{ query: string; path: string; line?: number }>,
): void {
  if (!toolContent.trim().startsWith('{')) return
  try {
    const parsed = JSON.parse(toolContent) as Record<string, unknown>
    if (name === 'read_file' && typeof parsed.path === 'string') {
      filesRead.push(parsed.path)
    }
    if (name === 'search_workspace' && Array.isArray(parsed.results)) {
      const query = typeof parsed.query === 'string' ? parsed.query : ''
      for (const row of parsed.results) {
        if (!row || typeof row !== 'object') continue
        const r = row as Record<string, unknown>
        if (typeof r.path === 'string') {
          searchHits.push({
            query,
            path: r.path,
            line: typeof r.line === 'number' ? r.line : undefined,
          })
        }
      }
    }
  } catch {
    /* ignore parse errors */
  }
}

async function providerSampleFromSnapshot(
  snapshot: ReturnType<typeof buildTurnSnapshot>,
  signal: AbortSignal,
): Promise<{ content: string; toolCalls: AgentModelToolCall[] }> {
  return subagentTransport.sampleChatCompletion(providerRequestFromSnapshot(snapshot), signal)
}

function buildSubagentSystemPrompt(task: string): string {
  return [
    'You are a read-only GrokForge codebase explorer subagent.',
    'Use workspace_index, list_directory, read_file, and search_workspace only.',
    'Do not propose edits, run commands, or spawn nested subagents.',
    'Gather enough context to answer the parent task, then stop calling tools.',
    '',
    `Parent task: ${task}`,
  ].join('\n')
}

function parseSummaryArtifact(content: string) {
  const trimmed = content.trim()
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fence ? fence[1].trim() : trimmed
  try {
    return SubagentResultArtifactSchema.safeParse(JSON.parse(candidate))
  } catch {
    return SubagentResultArtifactSchema.safeParse({})
  }
}

export async function runSubagentSession(input: RunSubagentSessionInput): Promise<RunSubagentSessionResult> {
  const childSessionId = newChildSessionId()
  const modelIntent = input.args.modelIntent ?? 'planning'
  const routing = resolveSubagentTurnRouting(input.manifest, modelIntent)
  const harnessProfile = getHarnessProfile(routing.harnessProfileKey)
  const agentProfile = getAgentProfile('explorer')
  const childStreamId = childSessionId
  clearAgentTurnReads(childStreamId)

  const activities: AgentSubagentEventPayload['activities'] = []

  const emitSubagent = (patch: Partial<AgentSubagentEventPayload> & { status: AgentSubagentEventPayload['status'] }) => {
    const payload: AgentSubagentEventPayload = {
      childSessionId,
      status: patch.status,
      title: patch.title ?? 'Subagent: explored codebase',
      profileId: 'explorer',
      activities: activities.slice(-SUBAGENT_MAX_NESTED_ACTIVITIES),
      result: patch.result,
      error: patch.error,
    }
    input.emit({ streamId: input.parentStreamId, phase: 'subagent', subagent: payload })
  }

  initChildSessionFile(input.projectId, {
    type: 'session_meta',
    childSessionId,
    parentStreamId: input.parentStreamId,
    profileId: 'explorer',
    modelId: routing.modelId,
    modelIntent,
    createdAt: new Date().toISOString(),
    task: input.args.task,
  })

  emitSubagent({ status: 'running', title: 'Subagent: exploring codebase' })

  const toolDefinitions = filterToolDefinitionsForProfile(
    buildAgentToolDefinitions(harnessProfile.toolDescriptionOverrides),
    agentProfile,
  )

  const messages: AgentModelChatMessage[] = [
    { role: 'system', content: buildSubagentSystemPrompt(input.args.task) },
    {
      role: 'user',
      content: 'Explore the workspace for the parent task. Use tools as needed, then stop.',
    },
  ]

  const filesRead: string[] = []
  const searchHits: Array<{ query: string; path: string; line?: number }> = []
  let totalToolChars = 0
  const maxToolIterations = Math.min(
    AGENT_TOOL_MAX_ITERATIONS,
    agentProfile.maxToolRounds ?? SUBAGENT_MAX_TOOL_ROUNDS,
    SUBAGENT_MAX_TOOL_ROUNDS,
  )

  let providerRoundIndex = 0

  try {
    for (let i = 0; i < maxToolIterations; i += 1) {
      if (input.abortSignal.aborted) {
        finalizeSession(input.projectId, childSessionId, 'interrupted', {
          error: 'Subagent cancelled',
        })
        emitSubagent({ status: 'interrupted', error: 'Subagent cancelled' })
        return {
          ok: false,
          toolContent: JSON.stringify({ ok: false, error: 'Subagent cancelled' }),
          displayTitle: 'Subagent interrupted',
        }
      }

      const snapshot = buildTurnSnapshot({
        roundIndex: providerRoundIndex,
        roundKind: 'tool_sample',
        streamId: childStreamId,
        routing,
        chatMode: 'fast',
        messages,
        toolDefinitions,
        activeContext: input.activeContext,
      })
      providerRoundIndex += 1

      const sampled = await providerSampleFromSnapshot(snapshot, input.abortSignal)
      if (sampled.toolCalls.length === 0) break

      messages.push({
        role: 'assistant',
        content: sampled.content || null,
        tool_calls: sampled.toolCalls,
      })

      for (const call of sampled.toolCalls) {
        const name = call.function.name
        const actId = activityId()
        const toolName = isAllowedChildToolName(name) ? name : undefined

        appendSessionEvent(input.projectId, childSessionId, {
          type: 'tool_call',
          at: new Date().toISOString(),
          toolCallId: call.id,
          toolName: name,
          arguments: call.function.arguments,
        })

        activities.push({
          id: actId,
          tool: toolName,
          title: toolName ? `Using ${toolName}` : `Unknown tool: ${name}`,
          status: 'running',
        })
        emitSubagent({ status: 'running' })

        const toolCtx = buildAgentToolExecutionContext({
          projectId: input.projectId,
          streamId: input.parentStreamId,
          snapshotId: snapshot.snapshotId,
          toolCallId: call.id,
          activityId: actId,
          toolName,
          routing,
          activeContext: input.activeContext,
          manifest: input.manifest,
          sessionDepth: 'child',
          childSessionId,
          abortSignal: input.abortSignal,
          emit: () => {
            /* child progress merged into subagent block */
          },
          waitForCommandApproval: input.waitForCommandApproval,
        })

        const outcome = await executeAgentToolCall(
          toolCtx,
          call,
          {
            totalToolChars,
            editProposalCreated: false,
            turnProposalAccum: null,
            searchReplaceFailuresByPath: new Map(),
            agentProfile,
            manifest: input.manifest,
          },
          { emit: input.emit, approvalRequestId: activityId() },
        )

        totalToolChars += outcome.totalToolCharsAdded
        accumulateFromToolResult(name, outcome.toolContent, filesRead, searchHits)

        appendSessionEvent(input.projectId, childSessionId, {
          type: 'tool_result',
          at: new Date().toISOString(),
          toolCallId: call.id,
          toolName: name,
          ok: outcome.ok,
          contentPreview: outcome.toolContent.slice(0, 500),
        })

        const actIdx = activities.findIndex((a) => a.id === actId)
        const doneActivity: AgentSubagentEventPayload['activities'][number] = {
          id: actId,
          tool: toolName,
          title: outcome.doneTitle,
          detail: outcome.detail,
          status: outcome.ok ? 'done' : 'error',
        }
        if (actIdx >= 0) activities[actIdx] = doneActivity
        else activities.push(doneActivity)
        emitSubagent({ status: 'running' })

        messages.push({ role: 'tool', tool_call_id: call.id, content: outcome.toolContent })
      }
    }

    messages.push({
      role: 'user',
      content: [
        'Summarize exploration for the parent agent.',
        'Return JSON only with shape:',
        '{"summary":string,"filesRead":string[],"searchHits":[{"query":string,"path":string,"line"?:number}]}',
        'No markdown fences unless needed.',
      ].join(' '),
    })

    const summarySnapshot = buildTurnSnapshot({
      roundIndex: providerRoundIndex,
      roundKind: 'final_stream',
      streamId: childStreamId,
      routing,
      chatMode: 'fast',
      messages,
      toolDefinitions: [],
      activeContext: input.activeContext,
    })

    const summarized = await providerSampleFromSnapshot(summarySnapshot, input.abortSignal)
    const parsed = parseSummaryArtifact(summarized.content)
    const artifact = parsed.success
      ? parsed.data
      : buildFallbackSubagentArtifact({
          task: input.args.task,
          filesRead,
          searchHits,
          note: parsed.success ? undefined : 'Summary parse failed; using tool accumulators.',
        })

    finalizeSession(input.projectId, childSessionId, 'done', { artifact })
    emitSubagent({ status: 'done', result: artifact })

    const toolContent = serializeSubagentResultForParent(artifact)
    return {
      ok: true,
      toolContent,
      displayTitle: 'Subagent exploration complete',
      displayDetail: `${artifact.filesRead.length} file(s) · ${artifact.searchHits.length} search hit(s)`,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Subagent failed'
    finalizeSession(input.projectId, childSessionId, 'error', { error: msg })
    emitSubagent({ status: 'error', error: msg })
    return {
      ok: false,
      toolContent: JSON.stringify({ ok: false, error: msg }),
      displayTitle: 'Subagent failed',
      displayDetail: msg,
    }
  } finally {
    clearAgentTurnReads(childStreamId)
  }
}
