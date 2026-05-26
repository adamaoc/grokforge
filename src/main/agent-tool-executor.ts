import type { AgentModelToolCall } from '../shared/agent-model-message'
import type {
  AgentChatEventPayload,
  AgentChatToolName,
  AgentEditProposalPayload,
} from '../shared/agent-chat-contract'
import type { AgentToolExecutionContext } from '../shared/agent-tool-execution-context'
import { findAccumulatedWriteForPath, mergeAgentEditProposals } from '../shared/agent-edit-proposal-merge'
import type { AgentProfile } from '../shared/agent-profile'
import { isToolAllowedForProfile } from '../shared/agent-profile'
import type { GrokProjectManifest } from './manifest'
import { buildEditProposalValidationSummary, validateAgentEditProposal } from './agent-edit-proposals'
import { executeRunCommandTool, parseRunCommandToolArgs } from './agent-run-command-tool'
import {
  resolveSearchReplaceToWriteBatch,
  SearchReplaceToolArgsSchema,
} from './agent-search-replace-tool'
import { recordSearchReplaceFailure } from '../shared/agent-edit-cascade-guard'
import {
  AGENT_TOOL_TOTAL_RESULT_CHARS,
  executeWorkspaceTool,
  resolveAgentWorkspacePath,
  type AgentWorkspaceToolResult,
} from './agent-workspace-tools'
import { runSubagentSession } from './agent-subagent-runner'
import { SpawnSubagentArgsSchema } from '../shared/agent-subagent-contract'

export type AgentToolCallOutcome = {
  ok: boolean
  toolContent: string
  doneTitle: string
  detail?: string
  /** Compact validation outcome for traces / activity when edit tools run. */
  validationSummary?: string
  editProposalCreated?: boolean
  /** True when this turn merged into an existing proposal (story 119). */
  editProposalComposedInTurn?: boolean
  turnProposalAccum?: AgentEditProposalPayload | null
  /** Resolved path for activity compaction (story 119). */
  activitySubjectPath?: string
  totalToolCharsAdded: number
}

export type AgentToolExecutorTurnState = {
  totalToolChars: number
  editProposalCreated: boolean
  turnProposalAccum: AgentEditProposalPayload | null
  agentProfile: AgentProfile
  manifest: GrokProjectManifest
  /** Per-turn failed search_replace count by resolved absolute path. */
  searchReplaceFailuresByPath: Map<string, number>
  userMessageHint?: string
}

function isAllowedToolName(name: string): name is AgentChatToolName {
  return (
    name === 'workspace_index' ||
    name === 'list_directory' ||
    name === 'read_file' ||
    name === 'search_workspace' ||
    name === 'search_replace' ||
    name === 'run_command' ||
    name === 'propose_file_edits' ||
    name === 'spawn_subagent'
  )
}

function parseToolArgs(raw: string): unknown {
  if (!raw.trim()) return {}
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return { __invalidJson: raw }
  }
}

export async function executeAgentToolCall(
  ctx: AgentToolExecutionContext,
  call: AgentModelToolCall,
  state: AgentToolExecutorTurnState,
  options: {
    emit: (payload: AgentChatEventPayload) => void
    approvalRequestId: string
    waitForCommandApproval?: (requestId: string, streamId: string, signal: AbortSignal) => Promise<boolean>
  },
): Promise<AgentToolCallOutcome> {
  const name = call.function.name
  let toolContent: string
  let doneTitle: string
  let detail: string | undefined
  let ok = false
  let totalToolCharsAdded = 0
  let editProposalCreated = state.editProposalCreated
  let turnProposalAccum = state.turnProposalAccum
  let validationSummary: string | undefined
  let editProposalComposedInTurn = false
  let activitySubjectPath: string | undefined

  if (!isAllowedToolName(name)) {
    toolContent = JSON.stringify({ ok: false, error: `Unknown tool: ${name}` })
    doneTitle = 'Tool failed'
  } else if (name === 'spawn_subagent' && ctx.sessionDepth === 'child') {
    toolContent = JSON.stringify({ ok: false, error: 'spawn_subagent is not available inside a child session.' })
    doneTitle = 'Subagent not allowed'
    detail = 'Nested subagents are disabled in v1.'
  } else if (name === 'spawn_subagent') {
    const parsedArgs = SpawnSubagentArgsSchema.safeParse(parseToolArgs(call.function.arguments))
    if (!parsedArgs.success) {
      toolContent = JSON.stringify({ ok: false, error: parsedArgs.error.message })
      doneTitle = 'Subagent request failed'
    } else {
      const sub = await runSubagentSession({
        projectId: ctx.projectId,
        parentStreamId: ctx.streamId,
        manifest: state.manifest,
        activeContext: ctx.activeContext,
        args: parsedArgs.data,
        abortSignal: ctx.abortSignal,
        emit: options.emit,
        waitForCommandApproval:
          options.waitForCommandApproval ?? (async () => false),
      })
      ok = sub.ok
      doneTitle = sub.displayTitle
      detail = sub.displayDetail
      toolContent = sub.toolContent
      totalToolCharsAdded = Math.min(toolContent.length, AGENT_TOOL_TOTAL_RESULT_CHARS)
    }
  } else if (!isToolAllowedForProfile(name, state.agentProfile)) {
    toolContent = JSON.stringify({
      ok: false,
      error: `Tool "${name}" is not available in the ${state.agentProfile.id} profile.`,
    })
    doneTitle = 'Tool not available'
    detail = `${state.agentProfile.displayName} profile`
  } else if (state.totalToolChars >= AGENT_TOOL_TOTAL_RESULT_CHARS) {
    toolContent = JSON.stringify({ ok: false, error: 'Total tool result budget reached.' })
    doneTitle = 'Tool budget reached'
  } else if (name === 'search_replace' || name === 'propose_file_edits') {
    const rawToolArgs = parseToolArgs(call.function.arguments)
    const searchReplaceParsed =
      name === 'search_replace' ? SearchReplaceToolArgsSchema.safeParse(rawToolArgs) : null
    if (name === 'search_replace' && searchReplaceParsed && !searchReplaceParsed.success) {
      doneTitle = 'Search replace failed'
      detail = searchReplaceParsed.error.message
      toolContent = JSON.stringify({ ok: false, error: searchReplaceParsed.error.message })
    } else {
      let searchReplaceChain: { baseContent?: string } | undefined
      let searchReplaceResolved: string | null = null
      if (name === 'search_replace' && searchReplaceParsed?.success) {
        searchReplaceResolved = resolveAgentWorkspacePath(searchReplaceParsed.data.path, ctx)
        if (searchReplaceResolved) {
          activitySubjectPath = searchReplaceResolved
          const prior = findAccumulatedWriteForPath(state.turnProposalAccum, searchReplaceResolved)
          if (prior) {
            searchReplaceChain = { baseContent: prior.content }
          }
        }
      }
      const writeBatch =
        name === 'search_replace' && searchReplaceParsed?.success
          ? resolveSearchReplaceToWriteBatch(searchReplaceParsed.data, ctx, searchReplaceChain)
          : null
      if (name === 'search_replace' && writeBatch && !writeBatch.ok) {
        doneTitle = 'Search replace failed'
        detail = writeBatch.error
        toolContent = JSON.stringify({ ok: false, error: writeBatch.error })
        if (searchReplaceParsed?.success) {
          const resolved = resolveAgentWorkspacePath(searchReplaceParsed.data.path, ctx)
          if (resolved) recordSearchReplaceFailure(state.searchReplaceFailuresByPath, resolved)
        }
      } else {
        if (name === 'search_replace' && writeBatch && writeBatch.ok) {
          ctx.recordPathRead(writeBatch.path, writeBatch.contentHash)
        }
        const proposalResult = validateAgentEditProposal(
          name === 'search_replace' && writeBatch && 'batch' in writeBatch ? writeBatch.batch : rawToolArgs,
          ctx,
          {
            searchReplaceFailuresByPath: state.searchReplaceFailuresByPath,
            userMessageHint: state.userMessageHint,
            contentSource:
              name === 'search_replace' && writeBatch && writeBatch.ok ? 'search_replace' : 'propose',
          },
        )
        const rejectedList = proposalResult.proposal?.rejected ?? []
        const acceptedCount = proposalResult.proposal?.batch.operations.length ?? 0
        validationSummary = buildEditProposalValidationSummary(rejectedList, acceptedCount)
        if (!proposalResult.ok) {
          doneTitle = name === 'search_replace' ? 'Search replace failed' : 'Edit proposal failed'
          detail = `${proposalResult.error}${rejectedList.length > 0 ? ` · ${validationSummary}` : ''}`
          toolContent = JSON.stringify({
            ok: false,
            error: proposalResult.error,
            rejected: rejectedList,
            validationSummary,
          })
        } else {
          ok = true
          editProposalCreated = true
          const hadPriorProposal = turnProposalAccum != null
          turnProposalAccum = mergeAgentEditProposals(turnProposalAccum, proposalResult.proposal)
          if (hadPriorProposal) editProposalComposedInTurn = true
          if (name === 'propose_file_edits') {
            const firstOp = proposalResult.proposal?.batch.operations[0]
            if (firstOp?.path) {
              activitySubjectPath =
                resolveAgentWorkspacePath(firstOp.path, ctx) ?? firstOp.path
            }
          }
          options.emit({ streamId: ctx.streamId, phase: 'edit_proposal', proposal: turnProposalAccum })
          const count = turnProposalAccum.batch.operations.length
          const rejected = turnProposalAccum.rejected.length
          doneTitle =
            name === 'search_replace' ? 'Prepared search_replace proposal' : 'Prepared edit proposal'
          const chainNote =
            name === 'search_replace' &&
            writeBatch &&
            writeBatch.ok &&
            writeBatch.chainedFromAccumulated &&
            searchReplaceResolved
              ? ` · composed with prior edit on ${searchReplaceResolved.split(/[/\\]/).filter(Boolean).pop() ?? 'file'}`
              : ''
          detail = `${count} file${count === 1 ? '' : 's'} ready for review${rejected > 0 ? ` · ${validationSummary}` : ''}${chainNote}`
          toolContent = JSON.stringify({
            ok: true,
            proposalCreated: true,
            operations: count,
            rejected: turnProposalAccum.rejected,
            validationSummary,
            message:
              'The proposal is now available in GrokForge for user diff review. Do not repeat the full JSON in the final answer.',
          })
        }
      }
    }
  } else if (name === 'run_command') {
    const parsedArgs = parseRunCommandToolArgs(parseToolArgs(call.function.arguments))
    if (!parsedArgs.success) {
      toolContent = JSON.stringify({ ok: false, error: parsedArgs.error.message })
      doneTitle = 'Command request failed'
    } else {
      const cmdResult = await executeRunCommandTool(ctx, parsedArgs.data, {
        requestId: options.approvalRequestId,
        manifest: state.manifest,
      })
      ok = cmdResult.ok
      doneTitle = cmdResult.displayTitle
      detail = cmdResult.displayDetail
      toolContent = cmdResult.content
    }
  } else {
    const toolArgs = parseToolArgs(call.function.arguments)
    const result: AgentWorkspaceToolResult = executeWorkspaceTool(ctx, name, toolArgs)
    ok = result.ok
    doneTitle = result.displayTitle
    detail = result.displayDetail
    const remaining = Math.max(0, AGENT_TOOL_TOTAL_RESULT_CHARS - state.totalToolChars)
    toolContent = result.content.length > remaining
      ? `${result.content.slice(0, remaining)}\n[...total tool result budget reached...]`
      : result.content
    totalToolCharsAdded = toolContent.length
  }

  if (totalToolCharsAdded === 0 && toolContent) {
    const remaining = Math.max(0, AGENT_TOOL_TOTAL_RESULT_CHARS - state.totalToolChars)
    totalToolCharsAdded = Math.min(toolContent.length, remaining)
  }

  return {
    ok,
    toolContent,
    doneTitle,
    detail,
    validationSummary,
    editProposalCreated,
    editProposalComposedInTurn,
    turnProposalAccum,
    activitySubjectPath,
    totalToolCharsAdded,
  }
}
