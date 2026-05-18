import { ipcMain, type BrowserWindow } from 'electron'
import { resolve } from 'node:path'
import { z } from 'zod'
import type { GrokProjectManifest } from './manifest'
import { buildChatSystemPrompt, recordAgentRetrievalDebug, type AgentRetrievalDebugSnapshot } from './agent-context'
import {
  createHttpAgentChatModelTransport,
  type AgentChatModelTransport,
  type AgentModelChatMessage,
  type AgentModelToolCall,
} from './agent-chat-model-transport'
import { getXaiApiKey } from './grok-stream'
import { hasConfiguredXaiApiKey } from './xai-key-store'
import { AGENT_TOOL_FENCE_INFO, AGENT_TOOL_PROTOCOL_VERSION } from '../shared/agent-tool-contract'
import { GF_PLAN_FENCE } from '../shared/gf-plan-contract'
import { shouldIgnoreFsEntry } from './ignore-globs'
import { isPathWithinWorkspaceRoots } from './workspace-path-guard'
import { validateAgentEditProposal } from './agent-edit-proposals'
import { runCommandInRootForAgent } from './run-command'
import { evaluateAgentCommandRisk } from './run-command-policy'
import {
  AGENT_TOOL_MAX_ITERATIONS,
  AGENT_TOOL_TOTAL_RESULT_CHARS,
  buildActiveContextBlock,
  buildLexicalRetrievalContext,
  isLikelySensitivePath,
  runAgentWorkspaceTool,
} from './agent-workspace-tools'
import { sanitizeAttachmentsForTurn } from './chat-attachment-staging'
import {
  applyRetrievalToScratch,
  createTurnTraceScratch,
  finalizeTurnTrace,
  pushToolStep,
  setRetrievalContextBodyChars,
  setRetrievalDetailLines,
  type TurnTraceOutcome,
  type TurnTraceScratch,
} from './agent-turn-trace-builder'
import {
  writeAgentTurnTrace,
  getLastAgentTurnTraceForProject,
  exportSanitizedAgentTurnTraceJson,
  replayRetrievalPreviewFromLatestTrace,
} from './agent-turn-trace-store'
import type {
  AgentChatCapabilitiesResult,
  AgentChatEventPayload,
  AgentChatStartPayload,
  AgentChatStartResult,
  AgentChatToolName,
} from '../shared/agent-chat-contract'
import type {
  ExportSanitizedAgentTurnTraceResult,
  GetLastAgentTurnTraceResult,
  ReplayAgentRetrievalPreviewResult,
} from '../shared/agent-turn-trace-contract'
import {
  AgentCommandApprovalRespondResult,
  AgentCommandApprovalResponse,
  AGENT_CHAT_MAX_MESSAGE_CHARS,
  AGENT_CHAT_MAX_ATTACHMENTS,
  AGENT_CHAT_SELECTION_MAX_CHARS,
  AGENT_CHAT_MAX_OPEN_TABS,
  AGENT_CHAT_MAX_STREAM_ID_LEN,
  AGENT_CHAT_MAX_THREAD_MESSAGES,
  AGENT_CHAT_MAX_USER_TEXT_CHARS,
} from '../shared/agent-chat-contract'
import {
  RUN_COMMAND_DEFAULT_TIMEOUT_MS,
  RUN_COMMAND_MAX_TIMEOUT_MS,
  RUN_COMMAND_MIN_TIMEOUT_MS,
} from '../shared/run-command-contract'

const AGENT_TURN_TIMEOUT_MS = 300_000
const MAX_MODEL_LEN = 128
const ABORT_USER = 'gf:agent-user-cancel'
const ABORT_TIMEOUT = 'gf:agent-timeout'

const ActiveContextSchema = z.object({
  activeRootId: z.string().nullable().optional(),
  activeFilePath: z.string().nullable().optional(),
  selectedTreePath: z.string().nullable().optional(),
  openTabs: z
    .array(z.object({ path: z.string().min(1).max(4096), dirty: z.boolean() }))
    .max(AGENT_CHAT_MAX_OPEN_TABS),
  attachments: z
    .array(
      z.object({
        type: z.enum(['file', 'folder']),
        path: z.string().min(1).max(4096),
        source: z.enum(['workspace', 'upload']).optional(),
        displayName: z.string().max(512).optional(),
        mediaType: z.string().max(256).optional(),
        byteSize: z.number().int().nonnegative().max(20 * 1024 * 1024).optional(),
      }),
    )
    .max(AGENT_CHAT_MAX_ATTACHMENTS)
    .optional(),
  editorSelection: z
    .object({
      path: z.string().min(1).max(4096),
      startLine: z.number().int().positive(),
      endLine: z.number().int().positive(),
      text: z.string().max(AGENT_CHAT_SELECTION_MAX_CHARS).optional(),
      truncated: z.boolean(),
    })
    .nullable()
    .optional(),
  chatMode: z.enum(['fast', 'plan']),
})

const ThreadMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(AGENT_CHAT_MAX_MESSAGE_CHARS),
})

const StartPayloadSchema = z.object({
  streamId: z.string().min(1).max(AGENT_CHAT_MAX_STREAM_ID_LEN),
  model: z.string().min(1).max(MAX_MODEL_LEN),
  userText: z.string().min(1).max(AGENT_CHAT_MAX_USER_TEXT_CHARS),
  threadSnapshot: z.array(ThreadMessageSchema).max(AGENT_CHAT_MAX_THREAD_MESSAGES),
  activeContext: ActiveContextSchema,
})

const RunCommandToolArgsSchema = z.object({
  rootId: z.string().min(1).max(256),
  command: z.string().min(1).max(8000),
  timeoutMs: z.number().int().min(RUN_COMMAND_MIN_TIMEOUT_MS).max(RUN_COMMAND_MAX_TIMEOUT_MS).optional(),
  purpose: z.string().min(1).max(500),
})

export type CurrentProjectSnapshot = {
  projectId: string | null
  manifest: GrokProjectManifest | null
}

const activeTurns = new Map<string, AbortController>()
const pendingCommandApprovals = new Map<
  string,
  {
    streamId: string
    resolve: (approved: boolean) => void
  }
>()

const EDIT_INTENT_RE =
  /\b(add|apply|build|change|create|delete|edit|fix|implement|make|move|patch|refactor|remove|rename|replace|update|write)\b/i

let targetWindow: BrowserWindow | null = null
let getCurrentProject: () => CurrentProjectSnapshot = () => ({ projectId: null, manifest: null })

const httpAgentChatModelTransport = createHttpAgentChatModelTransport()
let activeAgentChatModelTransport: AgentChatModelTransport = httpAgentChatModelTransport

/**
 * @internal Vitest — swap the xAI HTTP transport; returned function restores the previous transport.
 */
export function setAgentChatModelTransportForTesting(transport: AgentChatModelTransport | null): () => void {
  const prev = activeAgentChatModelTransport
  activeAgentChatModelTransport = transport ?? httpAgentChatModelTransport
  return () => {
    activeAgentChatModelTransport = prev
  }
}

/**
 * @internal Vitest — override `getCurrentProject` used by the agent loop; restore with the returned function.
 */
export function setGetCurrentProjectForTesting(getter: () => CurrentProjectSnapshot): () => void {
  const prev = getCurrentProject
  getCurrentProject = getter
  return () => {
    getCurrentProject = prev
  }
}

/**
 * @internal Vitest — register `streamId` with an AbortController before calling {@link runAgentTurnJobForEvaluation}.
 */
export function primeActiveAgentTurn(streamId: string, ac: AbortController = new AbortController()): AbortController {
  activeTurns.set(streamId, ac)
  return ac
}

/**
 * @internal Vitest — run the same job as IPC `agent-chat-start` after {@link primeActiveAgentTurn}.
 */
export async function runAgentTurnJobForEvaluation(payload: AgentChatStartPayload): Promise<void> {
  await runTurnJob(payload)
}

function getE2eMockReply(): string | null {
  const raw = process.env['GROKFORGE_E2E_AGENT_REPLY']
  return raw && raw.trim() ? raw : null
}

export function setAgentChatTargetWindow(win: BrowserWindow | null): void {
  targetWindow = win
}

function emit(payload: AgentChatEventPayload): void {
  targetWindow?.webContents.send('agent-chat-event', payload)
}

function activityId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function emitActivity(
  streamId: string,
  activity: Omit<AgentChatEventPayload & { phase: 'activity' }, 'streamId' | 'phase'>['activity'],
): void {
  emit({ streamId, phase: 'activity', activity })
}

function parseToolArgs(raw: string): unknown {
  if (!raw.trim()) return {}
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return { __invalidJson: raw }
  }
}

async function sampleChatCompletion(
  model: string,
  messages: AgentModelChatMessage[],
  signal: AbortSignal,
): Promise<{ content: string; toolCalls: AgentModelToolCall[] }> {
  return activeAgentChatModelTransport.sampleChatCompletion(model, messages, signal)
}

async function streamFinalAnswer(
  streamId: string,
  model: string,
  messages: AgentModelChatMessage[],
  signal: AbortSignal,
  onFinalChunk?: (delta: string) => void,
): Promise<void> {
  await activeAgentChatModelTransport.streamFinalAnswer(model, messages, signal, (delta) => {
    onFinalChunk?.(delta)
    emit({ streamId, phase: 'final_chunk', delta })
  })
}

function buildInitialMessages(
  manifest: GrokProjectManifest,
  projectId: string,
  payload: AgentChatStartPayload,
  retrievedContext: string,
): AgentModelChatMessage[] {
  const { systemPrompt } = buildChatSystemPrompt(manifest)
  const activeContext = buildActiveContextBlock(payload.activeContext, manifest, projectId)
  const dynamicContext = [
    activeContext,
    retrievedContext.trim() ? `## Relevant workspace context\n${retrievedContext}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
  const prior = payload.threadSnapshot
    .filter((m) => m.content.trim())
    .slice(-40)
    .map((m): AgentModelChatMessage => ({ role: m.role, content: m.content }))
  const planModeBlock =
    payload.activeContext.chatMode === 'plan'
      ? [
          '',
          '## Plan mode (structured plan output)',
          `The user enabled **Plan mode** for this turn. After any necessary read/search tool calls, your final answer must include **exactly one** fenced JSON block with the markdown language tag \`${GF_PLAN_FENCE}\` (not \`${AGENT_TOOL_FENCE_INFO}\`).`,
          'The fence body must be one JSON object with: `schemaVersion` 1, `summary` (string), `filesLikelyTouched` (string array), `risksUnknowns` (string array), `steps` (array of { `id`, `title` } with at least one step), `verification` (string).',
          'You may put readable prose before or after the fence. The JSON must parse as-is. Do not put file-write payloads inside this JSON; use `propose_file_edits` or the grokforge-agent-tools fence for edits as usual.',
        ].join('\n')
      : ''
  return [
    {
      role: 'system',
      content: [
        systemPrompt,
        '',
        '## Agent tool loop',
        'You may use the provided read/search tools to inspect this workspace before answering. Use tools when exact file contents or paths matter. You may request one-shot commands with run_command for tests, typecheck, git inspection, or diagnostics, but GrokForge will always ask the user before running model-requested commands. Do not claim a command ran unless the tool result says it ran. During tool planning, prefer tool calls over drafting the full answer; GrokForge will ask for the final response after tool use finishes.',
        'When you know the complete file changes for a user-requested edit, prefer the `propose_file_edits` tool. It creates a real GrokForge diff review and does not write files until the user applies it. Use the fenced grokforge-agent-tools block only as a compatibility fallback when the tool is not available.',
        planModeBlock,
        dynamicContext,
      ]
        .filter(Boolean)
        .join('\n'),
    },
    ...prior,
    { role: 'user', content: payload.userText },
  ]
}

function finalAnswerContract(userText: string, editProposalCreated: boolean): AgentModelChatMessage {
  const maybeEdit = EDIT_INTENT_RE.test(userText)
  return {
    role: 'system',
    content: [
      '## Final response contract',
      editProposalCreated
        ? 'A first-class edit proposal has already been created with `propose_file_edits`. Do not append a fenced `' + AGENT_TOOL_FENCE_INFO + '` JSON block; briefly tell the user the diff review is ready.'
        : 'If the final answer proposes workspace file changes and you have not already called `propose_file_edits`, append exactly one fenced `' + AGENT_TOOL_FENCE_INFO + '` JSON block after the human-readable summary. The renderer hides that block and turns it into a pending diff review.',
      maybeEdit && !editProposalCreated
        ? 'The user appears to be asking for an edit. Do not stop at prose or a normal code fence if you know the full file contents needed. Emit the machine-readable block so GrokForge can review/apply it.'
        : 'If this is only an explanation or you are missing necessary file contents, omit the block.',
      'Use `write_file` with complete replacement content. Use `delete_file` for a single existing file. For moves, use `write_file` at the destination plus `delete_file` for the source.',
      'JSON version: ' + String(AGENT_TOOL_PROTOCOL_VERSION) + '. Every path must be absolute and under a workspace root.',
    ].join('\n'),
  }
}

function isAllowedToolName(name: string): name is AgentChatToolName {
  return (
    name === 'workspace_index' ||
    name === 'list_directory' ||
    name === 'read_file' ||
    name === 'search_workspace' ||
    name === 'run_command' ||
    name === 'propose_file_edits'
  )
}


function sanitizeActiveContext(
  manifest: GrokProjectManifest,
  projectId: string,
  activeContext: AgentChatStartPayload['activeContext'],
): AgentChatStartPayload['activeContext'] {
  const selection = activeContext.editorSelection
  const selectionPath = selection ? resolve(selection.path) : null
  const safeSelection =
    selection && selectionPath &&
    isPathWithinWorkspaceRoots(selectionPath, manifest.roots) &&
    !shouldIgnoreFsEntry(selectionPath, manifest.roots, manifest.ignore ?? []) &&
    !isLikelySensitivePath(selectionPath)
      ? { ...selection, path: selectionPath }
      : null
  return {
    ...activeContext,
    editorSelection: safeSelection,
    attachments: sanitizeAttachmentsForTurn(manifest, projectId, activeContext.attachments),
  }
}

async function waitForCommandApproval(
  requestId: string,
  streamId: string,
  signal: AbortSignal,
): Promise<boolean> {
  if (signal.aborted) throw signal.reason
  return new Promise((resolvePromise, reject) => {
    const cleanup = () => {
      signal.removeEventListener('abort', onAbort)
      pendingCommandApprovals.delete(requestId)
    }
    const onAbort = () => {
      cleanup()
      reject(signal.reason)
    }
    pendingCommandApprovals.set(requestId, {
      streamId,
      resolve: (approved) => {
        cleanup()
        resolvePromise(approved)
      },
    })
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

async function runAgentTurn(
  payload: AgentChatStartPayload,
  ac: AbortController,
  scratch: TurnTraceScratch | null,
): Promise<void> {
  const snapshot = getCurrentProject()
  const manifest = snapshot.manifest
  const projectId = snapshot.projectId
  if (!manifest || !projectId) {
    emit({ streamId: payload.streamId, phase: 'error', error: 'No project loaded' })
    throw new Error('No project loaded')
  }

  emit({ streamId: payload.streamId, phase: 'turn_started' })
  const safePayload: AgentChatStartPayload = {
    ...payload,
    activeContext: sanitizeActiveContext(manifest, projectId, payload.activeContext),
  }

  const mockReply = getE2eMockReply()
  if (mockReply) {
    if (scratch) {
      const retrievalSnapMock: AgentRetrievalDebugSnapshot = {
        generatedAt: new Date().toISOString(),
        userTextPreview: safePayload.userText.slice(0, 500),
        files: [],
        stale: false,
        skipped: { ignored: 0, generated: 0, binary: 0, sensitive: 0, large: 0 },
        warnings: ['E2E mock: lexical retrieval skipped'],
      }
      applyRetrievalToScratch(scratch, retrievalSnapMock)
      setRetrievalDetailLines(scratch, ['E2E mock — lexical retrieval skipped'])
      setRetrievalContextBodyChars(scratch, 0)
    }
    const id = activityId()
    emitActivity(payload.streamId, {
      id,
      tool: 'retrieval',
      title: 'Using E2E mock agent reply',
      status: 'running',
    })
    emitActivity(payload.streamId, {
      id,
      tool: 'retrieval',
      title: 'E2E mock agent reply ready',
      status: 'done',
    })
    for (let i = 0; i < mockReply.length; i += 80) {
      if (ac.signal.aborted) throw ac.signal.reason
      const chunk = mockReply.slice(i, i + 80)
      if (scratch) scratch.assistantStreamChars += chunk.length
      emit({ streamId: payload.streamId, phase: 'final_chunk', delta: chunk })
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    emit({ streamId: payload.streamId, phase: 'activity_clear_running', reason: 'done' })
    emit({ streamId: payload.streamId, phase: 'done' })
    return
  }

  const retrievalActivityId = activityId()
  emitActivity(payload.streamId, {
    id: retrievalActivityId,
    tool: 'retrieval',
    title: 'Finding relevant workspace context',
    status: 'running',
  })
  const retrieval = buildLexicalRetrievalContext(
    { projectId, manifest, activeContext: safePayload.activeContext, signal: ac.signal },
    safePayload.userText,
  )
  const retrievalSnap: AgentRetrievalDebugSnapshot = {
    generatedAt: new Date().toISOString(),
    userTextPreview: safePayload.userText.slice(0, 500),
    files: retrieval.retrieved,
    stale: retrieval.stale,
    staleReason: retrieval.staleReason,
    skipped: retrieval.skipped,
    warnings: [
      retrieval.stale ? `Stale index: ${retrieval.staleReason ?? 'refresh recommended'}` : '',
      retrieval.skipped.sensitive > 0 ? `${retrieval.skipped.sensitive} sensitive file(s) excluded` : '',
    ].filter(Boolean),
  }
  recordAgentRetrievalDebug(retrievalSnap)
  if (scratch) {
    applyRetrievalToScratch(scratch, retrievalSnap)
    setRetrievalDetailLines(scratch, retrieval.details)
    setRetrievalContextBodyChars(scratch, retrieval.context.length)
  }
  emitActivity(payload.streamId, {
    id: retrievalActivityId,
    tool: 'retrieval',
    title: 'Found relevant workspace context',
    detail: [
      `${retrieval.count} file${retrieval.count === 1 ? '' : 's'}`,
      ...retrieval.details.slice(0, 4),
      retrieval.stale ? `Warning: stale index (${retrieval.staleReason ?? 'refresh recommended'})` : '',
      retrieval.skipped.sensitive > 0 ? `${retrieval.skipped.sensitive} sensitive file(s) excluded` : '',
    ]
      .filter(Boolean)
      .join(' · '),
    status: 'done',
  })

  const messages = buildInitialMessages(manifest, projectId, safePayload, retrieval.context)
  let totalToolChars = 0
  let editProposalCreated = false

  const onFinalChunk = scratch
    ? (delta: string) => {
        scratch.assistantStreamChars += delta.length
      }
    : undefined

  for (let i = 0; i < AGENT_TOOL_MAX_ITERATIONS; i += 1) {
    if (ac.signal.aborted) throw ac.signal.reason
    const sampled = await sampleChatCompletion(payload.model, messages, ac.signal)
    if (sampled.toolCalls.length === 0) {
      messages.push(finalAnswerContract(safePayload.userText, editProposalCreated))
      messages.push({ role: 'user', content: 'Now provide the final answer to the user from the gathered context. Stream the final answer; do not request more tools.' })
      await streamFinalAnswer(payload.streamId, payload.model, messages, ac.signal, onFinalChunk)
      emit({ streamId: payload.streamId, phase: 'activity_clear_running', reason: 'done' })
      emit({ streamId: payload.streamId, phase: 'done' })
      return
    }

    messages.push({
      role: 'assistant',
      content: sampled.content || null,
      tool_calls: sampled.toolCalls,
    })

    for (const call of sampled.toolCalls) {
      const name = call.function.name
      const id = activityId()
      emitActivity(payload.streamId, {
        id,
        tool: isAllowedToolName(name) ? name : undefined,
        title: isAllowedToolName(name) ? `Using ${name}` : `Unknown tool: ${name}`,
        status: 'running',
      })

      let toolContent: string
      let doneTitle: string
      let detail: string | undefined
      let ok = false
      if (!isAllowedToolName(name)) {
        toolContent = JSON.stringify({ ok: false, error: `Unknown tool: ${name}` })
        doneTitle = 'Tool failed'
      } else if (totalToolChars >= AGENT_TOOL_TOTAL_RESULT_CHARS) {
        toolContent = JSON.stringify({ ok: false, error: 'Total tool result budget reached.' })
        doneTitle = 'Tool budget reached'
      } else if (name === 'propose_file_edits') {
        const proposalResult = validateAgentEditProposal(parseToolArgs(call.function.arguments), {
          projectId,
          manifest,
          activeContext: safePayload.activeContext,
          signal: ac.signal,
        })
        if (!proposalResult.ok) {
          doneTitle = 'Edit proposal failed'
          detail = proposalResult.error
          toolContent = JSON.stringify({
            ok: false,
            error: proposalResult.error,
            rejected: proposalResult.proposal?.rejected ?? [],
          })
        } else {
          ok = true
          editProposalCreated = true
          emit({ streamId: payload.streamId, phase: 'edit_proposal', proposal: proposalResult.proposal })
          const count = proposalResult.proposal.batch.operations.length
          const rejected = proposalResult.proposal.rejected.length
          doneTitle = 'Prepared edit proposal'
          detail = `${count} file${count === 1 ? '' : 's'} ready for review${rejected > 0 ? ` · ${rejected} rejected` : ''}`
          toolContent = JSON.stringify({
            ok: true,
            proposalCreated: true,
            operations: count,
            rejected: proposalResult.proposal.rejected,
            message: 'The proposal is now available in GrokForge for user diff review. Do not repeat the full JSON in the final answer.',
          })
        }
      } else if (name === 'run_command') {
        const parsedArgs = RunCommandToolArgsSchema.safeParse(parseToolArgs(call.function.arguments))
        if (!parsedArgs.success) {
          toolContent = JSON.stringify({ ok: false, error: parsedArgs.error.message })
          doneTitle = 'Command request failed'
        } else {
          const args = parsedArgs.data
          const root = manifest.roots.find((r) => r.id === args.rootId)
          const timeoutMs = args.timeoutMs ?? RUN_COMMAND_DEFAULT_TIMEOUT_MS
          if (!root) {
            toolContent = JSON.stringify({ ok: false, error: 'Unknown workspace root.' })
            doneTitle = 'Command request failed'
          } else {
            const risk = evaluateAgentCommandRisk(args.command)
            if (risk.kind === 'blocked') {
              toolContent = JSON.stringify({ ok: false, blocked: true, error: risk.reason })
              doneTitle = 'Command blocked'
              detail = risk.reason
            } else {
              const requestId = activityId()
              emitActivity(payload.streamId, {
                id,
                tool: 'run_command',
                title: 'Command awaiting approval',
                detail: args.command,
                status: 'running',
              })
              emit({
                streamId: payload.streamId,
                phase: 'command_approval_required',
                request: {
                  requestId,
                  streamId: payload.streamId,
                  rootId: root.id,
                  rootLabel: root.label,
                  rootPath: root.path,
                  command: args.command,
                  timeoutMs,
                  purpose: args.purpose,
                  risk: risk.kind,
                  policyReason: risk.reason,
                },
              })
              const approved = await waitForCommandApproval(requestId, payload.streamId, ac.signal)
              if (!approved) {
                toolContent = JSON.stringify({
                  ok: false,
                  rejected: true,
                  error: 'User rejected the command. Continue without claiming it ran.',
                  command: args.command,
                })
                doneTitle = 'Command rejected'
                detail = args.command
              } else {
                emitActivity(payload.streamId, {
                  id,
                  tool: 'run_command',
                  title: 'Running approved command',
                  detail: args.command,
                  status: 'running',
                })
                const result = await runCommandInRootForAgent(manifest, {
                  rootId: args.rootId,
                  command: args.command,
                  timeoutMs,
                  acknowledgedDestructive: true,
                })
                ok = result.ok
                if (result.ok) {
                  doneTitle = 'Command finished'
                  detail = [
                    `exit ${result.exitCode ?? '?'}`,
                    result.signal ? `signal ${result.signal}` : '',
                    result.truncated ? 'output truncated' : '',
                    result.timedOut ? 'timed out' : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')
                  toolContent = JSON.stringify({
                    ok: true,
                    command: args.command,
                    rootId: args.rootId,
                    exitCode: result.exitCode,
                    signal: result.signal,
                    truncated: result.truncated,
                    timedOut: Boolean(result.timedOut),
                    output: result.output,
                  })
                } else {
                  doneTitle = 'Command failed'
                  detail = result.error
                  toolContent = JSON.stringify({
                    ok: false,
                    command: args.command,
                    error: result.error,
                    code: result.code,
                    output: result.output,
                  })
                }
              }
            }
          }
        }
      } else {
        const result = runAgentWorkspaceTool(name, parseToolArgs(call.function.arguments), {
          projectId,
          manifest,
          activeContext: safePayload.activeContext,
          signal: ac.signal,
        })
        ok = result.ok
        doneTitle = result.displayTitle
        detail = result.displayDetail
        const remaining = Math.max(0, AGENT_TOOL_TOTAL_RESULT_CHARS - totalToolChars)
        toolContent = result.content.length > remaining
          ? `${result.content.slice(0, remaining)}\n[...total tool result budget reached...]`
          : result.content
        totalToolChars += toolContent.length
      }
      const truncatedInLoop =
        toolContent.includes('[...total tool result budget reached...]') ||
        toolContent.includes('[...truncated...]')
      if (scratch) {
        pushToolStep(scratch, {
          iteration: i,
          toolCallId: call.id,
          name,
          ok,
          resultChars: toolContent.length,
          truncatedInLoop,
          displayTitle: doneTitle,
          errorSnippet: ok ? undefined : (detail?.slice(0, 500) ?? toolContent.slice(0, 500)),
        })
      }
      emitActivity(payload.streamId, {
        id,
        tool: isAllowedToolName(name) ? name : undefined,
        title: doneTitle,
        detail,
        status: ok ? 'done' : 'error',
      })
      messages.push({ role: 'tool', tool_call_id: call.id, content: toolContent })
    }
    if (scratch) {
      scratch.editProposalCreated = editProposalCreated
      scratch.totalToolCharsAccumulated = totalToolChars
    }
  }

  if (scratch) scratch.maxToolIterationsHit = true
  messages.push({
    role: 'user',
    content:
      'GrokForge reached the maximum read/search tool iterations for this turn. Provide the best grounded answer you can from the gathered context, and say what you could not verify.',
  })
  messages.push(finalAnswerContract(safePayload.userText, editProposalCreated))
  await streamFinalAnswer(payload.streamId, payload.model, messages, ac.signal, onFinalChunk)
  emit({ streamId: payload.streamId, phase: 'activity_clear_running', reason: 'done' })
  emit({ streamId: payload.streamId, phase: 'done' })
}

async function runTurnJob(payload: AgentChatStartPayload): Promise<void> {
  const ac = activeTurns.get(payload.streamId)
  if (!ac) return

  const snap = getCurrentProject()
  let scratch: TurnTraceScratch | null = null
  if (snap.projectId && snap.manifest) {
    try {
      const { systemPrompt } = buildChatSystemPrompt(snap.manifest)
      scratch = createTurnTraceScratch(snap.projectId, payload, systemPrompt.length)
    } catch {
      scratch = null
    }
  }

  let traceOutcome: TurnTraceOutcome = 'completed'
  let traceError: string | undefined

  const timeout = setTimeout(() => ac.abort(ABORT_TIMEOUT), AGENT_TURN_TIMEOUT_MS)
  try {
    await runAgentTurn(payload, ac, scratch)
  } catch (e) {
    if (ac.signal.aborted) {
      if (ac.signal.reason === ABORT_USER) {
        traceOutcome = 'cancelled'
      } else if (ac.signal.reason === ABORT_TIMEOUT) {
        traceOutcome = 'timeout'
        traceError = 'Agent turn timed out'
      } else {
        traceOutcome = 'error'
        traceError =
          typeof ac.signal.reason === 'string' && ac.signal.reason.trim()
            ? ac.signal.reason
            : 'Agent turn aborted'
      }
    } else {
      traceOutcome = 'error'
      traceError = e instanceof Error ? e.message : 'Agent turn failed'
    }

    if (ac.signal.aborted || e === ABORT_USER || e === ABORT_TIMEOUT) {
      emit({
        streamId: payload.streamId,
        phase: 'activity_clear_running',
        reason: ac.signal.reason === ABORT_USER ? 'cancelled' : 'error',
      })
      emit({
        streamId: payload.streamId,
        phase: ac.signal.reason === ABORT_USER ? 'cancelled' : 'error',
        ...(ac.signal.reason === ABORT_USER ? {} : { error: traceError ?? 'Agent turn timed out' }),
      } as AgentChatEventPayload)
      return
    }
    const msg = traceError ?? (e instanceof Error ? e.message : 'Agent turn failed')
    emit({ streamId: payload.streamId, phase: 'activity_clear_running', reason: 'error' })
    emit({ streamId: payload.streamId, phase: 'error', error: msg })
  } finally {
    clearTimeout(timeout)
    activeTurns.delete(payload.streamId)
    if (scratch) {
      try {
        writeAgentTurnTrace(
          scratch.projectId,
          finalizeTurnTrace(scratch, traceOutcome, { errorMessage: traceError }),
        )
      } catch {
        /* ignore trace persistence failures */
      }
    }
  }
}

export function registerAgentChatIpc(options: { getCurrentProject: () => CurrentProjectSnapshot }): void {
  getCurrentProject = options.getCurrentProject

  ipcMain.handle('agent-chat-capabilities', (): AgentChatCapabilitiesResult => ({
    apiKeyConfigured: Boolean(hasConfiguredXaiApiKey() || getE2eMockReply()),
  }))

  ipcMain.handle('agent-chat-start', async (_, raw: unknown): Promise<AgentChatStartResult> => {
    const parsed = StartPayloadSchema.safeParse(raw)
    if (!parsed.success) return { ok: false, error: parsed.error.message }
    if (!getXaiApiKey() && !getE2eMockReply()) {
      return {
        ok: false,
        error: 'Missing XAI API key. Add it in Settings or set XAI_API_KEY / GROKFORGE_XAI_API_KEY.',
      }
    }
    const payload = parsed.data
    if (activeTurns.has(payload.streamId)) return { ok: false, error: 'streamId already in use' }
    const ac = new AbortController()
    activeTurns.set(payload.streamId, ac)
    void runTurnJob(payload)
    return { ok: true, streamId: payload.streamId }
  })

  ipcMain.handle('agent-chat-cancel', async (_, streamId: unknown): Promise<{ ok: boolean }> => {
    if (typeof streamId !== 'string' || !streamId.trim()) return { ok: false }
    const ac = activeTurns.get(streamId)
    if (!ac) return { ok: true }
    ac.abort(ABORT_USER)
    return { ok: true }
  })

  ipcMain.handle('agent-command-approval-respond', async (_, raw: unknown): Promise<AgentCommandApprovalRespondResult> => {
    const parsed = z
      .object({
        streamId: z.string().min(1).max(AGENT_CHAT_MAX_STREAM_ID_LEN),
        requestId: z.string().min(1).max(128),
        approved: z.boolean(),
      })
      .safeParse(raw)
    if (!parsed.success) return { ok: false, error: parsed.error.message }
    const payload: AgentCommandApprovalResponse = parsed.data
    const pending = pendingCommandApprovals.get(payload.requestId)
    if (!pending || pending.streamId !== payload.streamId) {
      return { ok: false, error: 'Approval request is no longer active.' }
    }
    pending.resolve(payload.approved)
    return { ok: true }
  })

  ipcMain.handle('get-last-agent-turn-trace', (): GetLastAgentTurnTraceResult => {
    const { projectId } = getCurrentProject()
    if (!projectId) return { ok: false, error: 'No project loaded.' }
    return getLastAgentTurnTraceForProject(projectId)
  })

  ipcMain.handle('export-sanitized-agent-turn-trace', (): ExportSanitizedAgentTurnTraceResult => {
    const { projectId } = getCurrentProject()
    if (!projectId) return { ok: false, error: 'No project loaded.' }
    return exportSanitizedAgentTurnTraceJson(projectId)
  })

  ipcMain.handle('replay-agent-retrieval-preview', (): ReplayAgentRetrievalPreviewResult => {
    const snap = getCurrentProject()
    if (!snap.projectId || !snap.manifest) return { ok: false, error: 'No project loaded.' }
    return replayRetrievalPreviewFromLatestTrace(snap.projectId, snap.manifest)
  })
}
