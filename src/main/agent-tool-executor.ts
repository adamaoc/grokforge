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
import type { ViteTemplateId } from '../shared/agent-scaffold-command'
import { buildEditProposalValidationSummary, validateAgentEditProposal } from './agent-edit-proposals'
import { executeRunCommandTool, parseRunCommandToolArgs } from './agent-run-command-tool'
import {
  resolveSearchReplaceToWriteBatch,
  SearchReplaceToolArgsSchema,
} from './agent-search-replace-tool'
import { recordSearchReplaceFailure, shouldBlockSearchReplaceAfterEscalation, ITERATIVE_SEARCH_REPLACE_BLOCKED_REASON } from '../shared/agent-edit-cascade-guard'
import {
  isCreationRecoveryEnforced,
  qualifiesAsCreationRecoveryScaffold,
  recordCreationScaffoldAccepted,
} from '../shared/agent-creation-recovery-enforcement'
import { AGENT_EDIT_CREATE_HASH_STRIPPED_NOTE } from '../shared/agent-content-hash'
import { extractPathsFromEditToolArguments } from '../shared/agent-proposal-rejection-loop'
import {
  AGENT_TOOL_TOTAL_RESULT_CHARS,
  executeWorkspaceTool,
  resolveAgentWorkspacePath,
  type AgentWorkspaceToolResult,
} from './agent-workspace-tools'
import { runSubagentSession } from './agent-subagent-runner'
import { AgentToolBatchPayloadSchema } from '../shared/agent-tool-schema'
import { SpawnSubagentArgsSchema } from '../shared/agent-subagent-contract'
import type { AgentTurn } from './agent-turn'

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
  /** True when iterative Work blocked search_replace after escalation (138). */
  searchReplaceBlockedAfterEscalation?: boolean
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
  /** Expected Vite template from approved plan / user text (scaffold command validation). */
  scaffoldExpectedTemplate?: ViteTemplateId | null
  /** Iterative Work edit routing (138). */
  iterativeWorkEdit?: boolean
  searchReplaceEscalationNudgeIssued?: boolean
  /** Story 153: paths where creation incremental recovery nudge fired. */
  creationRecoveryEnforcedPaths?: Set<string>
  /** Story 153: paths where a minimal scaffold proposal was accepted this turn. */
  creationScaffoldAcceptedPaths?: Set<string>
  /** Story 162: user/plan requests one .html file — shell-first creation recovery. */
  singleFileHtmlIntent?: boolean
  /** New explicit turn lifecycle holder (step toward clearer harness phases). */
  agentTurn?: AgentTurn
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

function markCreationScaffoldsAcceptedFromRawWrites(
  state: AgentToolExecutorTurnState,
  ctx: AgentToolExecutionContext,
  writes: readonly { path: string; content: string }[],
): void {
  if (!state.creationRecoveryEnforcedPaths || !state.creationScaffoldAcceptedPaths) return
  for (const write of writes) {
    const resolved = resolveAgentWorkspacePath(write.path, ctx)
    if (!resolved) continue
    if (!isCreationRecoveryEnforced(state.creationRecoveryEnforcedPaths, resolved)) continue
    const fileExistsOnDisk = false
    if (
      !qualifiesAsCreationRecoveryScaffold({
        content: write.content,
        resolvedPath: resolved,
        fileExistsOnDisk,
        singleFileHtmlIntent: state.singleFileHtmlIntent,
      })
    ) {
      continue
    }
    recordCreationScaffoldAccepted(state.creationScaffoldAcceptedPaths, resolved)
  }
}

function extractRawWriteContents(rawArgs: unknown): { path: string; content: string }[] {
  const parsed = AgentToolBatchPayloadSchema.safeParse(rawArgs)
  if (!parsed.success) return []
  return parsed.data.operations
    .filter((op): op is Extract<typeof op, { op: 'write_file' }> => op.op === 'write_file')
    .map((op) => ({ path: op.path, content: op.content }))
}

export async function executeAgentToolCall(
  ctx: AgentToolExecutionContext,
  call: AgentModelToolCall,
  state: AgentToolExecutorTurnState,
  options: {
    emit: (payload: AgentChatEventPayload) => void
    approvalRequestId: string
    waitForCommandApproval?: (requestId: string, streamId: string, signal: AbortSignal) => Promise<boolean>
    reviewEditProposal?: (proposal: AgentEditProposalPayload, toolName: AgentChatToolName) => Promise<AgentEditProposalPayload>
  },
): Promise<AgentToolCallOutcome> {
  const name = call.function.name
  let toolContent = ''
  let doneTitle = 'Tool failed'
  let detail: string | undefined
  let ok = false
  let totalToolCharsAdded = 0
  let editProposalCreated = state.editProposalCreated
  let turnProposalAccum = state.turnProposalAccum
  let validationSummary: string | undefined
  let editProposalComposedInTurn = false
  let activitySubjectPath: string | undefined
  let searchReplaceBlockedAfterEscalation = false

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
  } else if (name === 'search_replace' || name === 'edit' || name === 'propose_file_edits') {
    const rawToolArgs = parseToolArgs(call.function.arguments)
    const isEditTool = name === 'search_replace' || name === 'edit'
    const searchReplaceParsed =
      isEditTool ? SearchReplaceToolArgsSchema.safeParse(rawToolArgs) : null
    if (isEditTool && searchReplaceParsed && !searchReplaceParsed.success) {
      doneTitle = name === 'edit' ? 'Edit failed' : 'Search replace failed'
      detail = searchReplaceParsed.error.message
      toolContent = JSON.stringify({ ok: false, error: searchReplaceParsed.error.message })
    } else {
      let searchReplaceChain: { baseContent?: string } | undefined
      let searchReplaceResolved: string | null = null
      let blockedAfterEscalation = false

      if (isEditTool && searchReplaceParsed?.success) {
        searchReplaceResolved = resolveAgentWorkspacePath(searchReplaceParsed.data.path, ctx)
        if (searchReplaceResolved) {
          activitySubjectPath = searchReplaceResolved
          if (
            shouldBlockSearchReplaceAfterEscalation({
              iterativeWorkEdit: state.iterativeWorkEdit,
              searchReplaceEscalationNudgeIssued: state.searchReplaceEscalationNudgeIssued,
              failuresByPath: state.searchReplaceFailuresByPath,
              resolvedAbsolutePath: searchReplaceResolved,
            })
          ) {
            blockedAfterEscalation = true
            searchReplaceBlockedAfterEscalation = true
            doneTitle = 'Search replace blocked'
            detail = ITERATIVE_SEARCH_REPLACE_BLOCKED_REASON
            toolContent = JSON.stringify({ ok: false, error: ITERATIVE_SEARCH_REPLACE_BLOCKED_REASON })
          } else {
            const prior = findAccumulatedWriteForPath(state.turnProposalAccum, searchReplaceResolved)
            if (prior) {
              searchReplaceChain = { baseContent: prior.content }
            }
          }
        }
      }

      if (!blockedAfterEscalation) {
        const writeBatch =
          isEditTool && searchReplaceParsed?.success
            ? resolveSearchReplaceToWriteBatch(searchReplaceParsed.data, ctx, searchReplaceChain)
            : null
        if (isEditTool && writeBatch && !writeBatch.ok) {
          doneTitle = 'Search replace failed'
          detail = writeBatch.error
          const failPayload: any = { ok: false, error: writeBatch.error }
          if ((writeBatch as any).suggestedMinimalProposal) {
            failPayload.suggestedMinimalProposal = (writeBatch as any).suggestedMinimalProposal
            failPayload.hint = 'Use the suggestedMinimalProposal (small localized write_file) with propose_file_edits instead of a full-file rewrite.'
          }
          toolContent = JSON.stringify(failPayload)
          if (searchReplaceParsed?.success) {
            const resolved = resolveAgentWorkspacePath(searchReplaceParsed.data.path, ctx)
            if (resolved) {
              recordSearchReplaceFailure(state.searchReplaceFailuresByPath, resolved)
              state.agentTurn?.recordSearchReplaceFailure?.(resolved) // migrate toward explicit turn object
            }
          }
        } else {
          if (isEditTool && writeBatch && writeBatch.ok) {
            ctx.recordPathRead(writeBatch.path, writeBatch.contentHash)
          }
          const proposalResult = validateAgentEditProposal(
            name === 'search_replace' && writeBatch && 'batch' in writeBatch ? writeBatch.batch : rawToolArgs,
            ctx,
            {
              searchReplaceFailuresByPath: state.searchReplaceFailuresByPath,
              userMessageHint: state.userMessageHint,
              iterativeWorkEdit: state.iterativeWorkEdit,
              contentSource:
                isEditTool && writeBatch && writeBatch.ok ? 'search_replace' : 'propose',
              creationRecoveryEnforcedPaths: state.creationRecoveryEnforcedPaths,
              creationScaffoldAcceptedPaths: state.creationScaffoldAcceptedPaths,
              singleFileHtmlIntent: state.singleFileHtmlIntent,
            },
          )
          const rejectedList = proposalResult.proposal?.rejected ?? []
          const acceptedCount = proposalResult.proposal?.batch.operations.length ?? 0
          validationSummary = buildEditProposalValidationSummary(rejectedList, acceptedCount)
          if (!proposalResult.ok) {
            doneTitle = isEditTool ? (name === 'edit' ? 'Edit failed' : 'Search replace failed') : 'Edit proposal failed'
            detail = `${proposalResult.error}${rejectedList.length > 0 ? ` · ${validationSummary}` : ''}`
            toolContent = JSON.stringify({
              ok: false,
              error: proposalResult.error,
              rejected: rejectedList,
              validationSummary,
            })
            if (!activitySubjectPath) {
              for (const rejected of rejectedList) {
                if (!rejected.path) continue
                const resolved = resolveAgentWorkspacePath(rejected.path, ctx)
                if (resolved) {
                  activitySubjectPath = resolved
                  break
                }
              }
              if (!activitySubjectPath) {
                for (const path of extractPathsFromEditToolArguments(rawToolArgs)) {
                  const resolved = resolveAgentWorkspacePath(path, ctx)
                  if (resolved) {
                    activitySubjectPath = resolved
                    break
                  }
                }
              }
            }
          } else {
            ok = true
            editProposalCreated = true
            const hadPriorProposal = turnProposalAccum != null
            turnProposalAccum = mergeAgentEditProposals(turnProposalAccum, proposalResult.proposal)
            if (hadPriorProposal) editProposalComposedInTurn = true

            // Record into the explicit turn lifecycle object when available
            state.agentTurn?.recordEditProposal?.(turnProposalAccum, editProposalComposedInTurn)
            if (name === 'propose_file_edits') {
              markCreationScaffoldsAcceptedFromRawWrites(
                state,
                ctx,
                extractRawWriteContents(rawToolArgs),
              )
              const firstOp = proposalResult.proposal?.batch.operations[0]
              if (firstOp?.path) {
                activitySubjectPath =
                  resolveAgentWorkspacePath(firstOp.path, ctx) ?? firstOp.path
              }
              if (options.reviewEditProposal) {
                turnProposalAccum = await options.reviewEditProposal(turnProposalAccum, name)
              }
            }
            options.emit({ streamId: ctx.streamId, phase: 'edit_proposal', proposal: turnProposalAccum })
            const count = turnProposalAccum.batch.operations.length
            const rejected = turnProposalAccum.rejected.length
            doneTitle =
              isEditTool ? (name === 'edit' ? 'Prepared edit proposal' : 'Prepared search_replace proposal') : 'Prepared edit proposal'
            const chainNote =
              name === 'search_replace' &&
              writeBatch &&
              writeBatch.ok &&
              writeBatch.chainedFromAccumulated &&
              searchReplaceResolved
                ? ` · composed with prior edit on ${searchReplaceResolved.split(/[/\\]/).filter(Boolean).pop() ?? 'file'}`
                : ''
            detail = `${count} file${count === 1 ? '' : 's'} ready for review${rejected > 0 ? ` · ${validationSummary}` : ''}${chainNote}`
            const isEditSuccess = isEditTool
            const followUp = isEditSuccess && searchReplaceResolved
              ? {
                  forFollowUpEditsOnThisPath: true,
                  note: 'For additional small changes to the same file later in this turn, you can base your next oldText on the content you just successfully patched (the harness composes internally). Include 4-8 lines of unique context and send the same expectedContentHash you used for this call.',
                  chained: !!(writeBatch && 'chainedFromAccumulated' in writeBatch && writeBatch.chainedFromAccumulated),
                }
              : undefined

            const createHashGuidance =
              proposalResult.createHashStrippedPaths && proposalResult.createHashStrippedPaths.length > 0
                ? {
                    strippedPaths: proposalResult.createHashStrippedPaths,
                    note: AGENT_EDIT_CREATE_HASH_STRIPPED_NOTE,
                  }
                : undefined

            toolContent = JSON.stringify({
              ok: true,
              proposalCreated: true,
              operations: count,
              rejected: turnProposalAccum.rejected,
              validationSummary,
              ...(createHashGuidance ? { createHashGuidance } : {}),
              ...(followUp ? { followUpGuidance: followUp } : {}),
              message:
                'The proposal is now available in GrokForge for user diff review. Do not repeat the full JSON in the final answer.',
            })
          }
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
        scaffoldExpectedTemplate: state.scaffoldExpectedTemplate ?? null,
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
    searchReplaceBlockedAfterEscalation,
  }
}
