import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import type { AgentChatEventPayload, AgentChatStartPayload } from '../shared/agent-chat-contract'
import type { GrokProjectManifest } from './manifest'
import { AGENT_TOOL_MAX_ITERATIONS } from './agent-workspace-tools'
import type { AgentChatModelTransport } from './agent-chat-model-transport'
import { POPULATED_WORK_EDIT_MARKER } from '../shared/populated-workspace-edit'
import { WORK_ITERATIVE_EDIT_MARKER } from '../shared/iterative-work-edit'
import { INCREMENTAL_EDIT_MID_TURN_NUDGE_MARKER } from '../shared/incremental-work-edit-policy'
import { ITERATIVE_EDIT_SCOPE_MARKER } from '../shared/iterative-edit-scope'
import { GREENFIELD_HARNESS_MARKER } from '../shared/workspace-greenfield'
import { GREENFIELD_PLAN_VERIFY_COMMANDS_MARKER } from '../shared/agent-plan-verification'
import {
  AGENT_EVAL_TAG_AGENT_EXECUTOR,
  AGENT_EVAL_TAG_AGENT_PLANNER,
  AGENT_EVAL_TAG_BEHAVIOR_GREENFIELD_EXECUTE,
  AGENT_EVAL_TAG_BEHAVIOR_GREENFIELD_EXECUTE_STATIC_VERIFY_NUDGE,
  AGENT_EVAL_TAG_BEHAVIOR_GREENFIELD_PLAN_NPM_VERIFY_COPY,
  AGENT_EVAL_TAG_BEHAVIOR_GREENFIELD_PLAN_STATIC_VERIFY_COPY,
  AGENT_EVAL_TAG_BEHAVIOR_GREENFIELD_STATIC_PLAN_EXECUTE_HAPPY,
  AGENT_EVAL_TAG_VALIDATION_GREENFIELD_STATIC_HTML_CORRUPTION,
  AGENT_EVAL_TAG_BEHAVIOR_GREENFIELD_VITE_SCAFFOLD,
  AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_WORK_LOCALSTORAGE_LOW_ROUNDS,
  AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_WORK_SR_CONSOLIDATION_NUDGE,
  AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_WORK_STOP_AFTER_PROPOSAL,
  AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_WORK_TRACE_METRICS,
  AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_WORK_SR_FAIL_FAST_ESCALATE,
  AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_WORK_SR_BLOCKED_AFTER_ESCALATE,
  AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_WORK_SR_NO_MAX_ITERATIONS,
  AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_WORK_SR_QUALITY_SECTIONS,
  AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_WORK_SR_TOOL_OVERRIDE,
  AGENT_EVAL_TAG_BEHAVIOR_TRACE_SEARCH_REPLACE_FAILURE_METRICS,
  AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_EDIT_SCOPE_SINGLE_FILE,
  AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_EDIT_SCOPE_PREFER_PROPOSE_NUDGE,
  AGENT_EVAL_TAG_BEHAVIOR_PROACTIVE,
  AGENT_EVAL_TAG_BEHAVIOR_RUN_COMMAND_PLAN_VERIFY,
  AGENT_EVAL_TAG_BEHAVIOR_SCAFFOLD_CLI_ONLY_FIRST,
  AGENT_EVAL_TAG_BEHAVIOR_SCAFFOLD_FILE_BOOTSTRAP_STATIC,
  AGENT_EVAL_TAG_BEHAVIOR_SCAFFOLD_FILE_BOOTSTRAP_NO_FALSE_CONFLICT,
  AGENT_EVAL_TAG_BEHAVIOR_SCAFFOLD_CONFLICT_RECOVERED_FINAL_CONTRACT,
  AGENT_EVAL_TAG_BEHAVIOR_SCAFFOLD_CONFLICT_UNRECOVERED_HONESTY,
  AGENT_EVAL_TAG_BEHAVIOR_SCAFFOLD_HYBRID_NUDGE,
  AGENT_EVAL_TAG_BEHAVIOR_SCAFFOLD_VERIFY_COMMAND_NOT_HYBRID,
  AGENT_EVAL_TAG_BEHAVIOR_SINGLE_FILE,
  AGENT_EVAL_TAG_CONTRACT_PLAN,
  AGENT_EVAL_TAG_PROFILE_GROK_4_3,
  AGENT_EVAL_TAG_PROFILE_GROK_CODE_FAST,
  AGENT_EVAL_TAG_RECOVERY_PARTIAL_BATCH,
  AGENT_EVAL_TAG_RECOVERY_CREATION_INCREMENTAL,
  AGENT_EVAL_TAG_RECOVERY_SCAFFOLD_PARTIAL,
  AGENT_EVAL_TAG_ROUTING_EXISTING_PROJECT_NO_REPLAN,
  AGENT_EVAL_TAG_ROUTING_ITERATIVE_WORK_NO_REPLAN,
  AGENT_EVAL_TAG_ROUTING_EXISTING_PROJECT_NO_SCAFFOLD_NUDGE,
  AGENT_EVAL_TAG_ROUTING_POST_PLAN,
  AGENT_EVAL_TAG_VALIDATION_PACKAGE_JSON,
} from '../shared/agent-eval-tags'
import {
  POST_PLAN_INCREMENTAL_MARKER,
  SINGLE_FILE_EDIT_BIAS_MARKER,
} from '../shared/post-plan-incremental'
import { GF_PLAN_FENCE } from '../shared/gf-plan-contract'
import type { StoredPlanArtifact } from '../shared/agent-plan-artifact'
import { buildApprovedPlanExecuteUserText } from '../shared/agent-plan-artifact'
import { planJsonPath } from './agent-plan-store'
import { appendTurnReceipt } from './agent-turn-receipt-store'
import { writeAgentTurnTrace } from './agent-turn-trace-store'
import { _resetTurnReceiptLifecycleForTesting } from './agent-turn-receipt-lifecycle'
import { TURN_RECOVERY_HINT_MARKER } from '../shared/agent-turn-receipt-contract'
import type { AgentTurnTraceV1 } from '../shared/agent-turn-trace-contract'
import {
  EDIT_INTENT_TOOL_NUDGE_MARKER,
  EDIT_CREATION_INCREMENTAL_RECOVERY_MARKER,
  EDIT_PARTIAL_BATCH_NUDGE_MARKER,
  EDIT_SEARCH_REPLACE_ESCALATION_MARKER,
  EDIT_ITERATIVE_SEARCH_REPLACE_ESCALATION_MARKER,
  PARTIAL_BATCH_PROPOSAL_HONESTY_MARKER,
  PLAN_VERIFY_COMMAND_NUDGE_MARKER,
  SCAFFOLD_STRATEGY_HONESTY_MARKER,
  SCAFFOLD_STRATEGY_NUDGE_MARKER,
} from '../shared/agent-final-answer-contract'
import { SCAFFOLD_STRATEGY_ROUTING_MARKER } from '../shared/agent-scaffold-strategy'
import {
  GREENFIELD_EXECUTE_BOOTSTRAP_SECTIONS,
  GREENFIELD_EXECUTE_CLI_MARKER,
} from '../shared/agent-harness-profile'
import { GREENFIELD_SCAFFOLD_MANIFEST_MARKER, AGENT_EDIT_INVALID_JSON_MANIFEST_REASON } from '../shared/agent-bootstrap-manifest'
import { assessProposalWriteContent } from '../shared/agent-edit-corrupt-content'
import { AGENT_TOOL_PROTOCOL_VERSION } from '../shared/agent-tool-contract'
import {
  ITERATIVE_SEARCH_REPLACE_BLOCKED_REASON,
  SEARCH_REPLACE_FAILURES_BEFORE_ESCALATION_GUARD,
} from '../shared/agent-edit-cascade-guard'
import { computeAgentContentHash } from './agent-content-hash'
import {
  baseEvalPayload,
  manifestForEvalRoot,
  seedApprovedPlanArtifact,
  seedPopulatedWorkspaceIndex,
  seedSmallVanillaWorkspaceIndex,
  seedSingleFileWorkspaceIndex,
  setupEvalTurn,
  staticTodoCrushedIndexHtml,
  staticTodoPlanV1,
  staticTodoValidFiles,
  staticTodoWriteFileOperations,
} from './agent-eval-fixtures'
import {
  primeActiveAgentTurn,
  runAgentTurnJobForEvaluation,
  setAgentChatModelTransportForTesting,
  setAgentChatTargetWindow,
  setCommandApprovalAutoResponderForTesting,
  setGetCurrentProjectForTesting,
} from './agent-runner'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  app: { getPath: () => '/tmp/grokforge-agent-eval-user-data' },
}))

vi.mock('./agent-turn-trace-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./agent-turn-trace-store')>()
  return {
    ...actual,
    writeAgentTurnTrace: vi.fn(),
  }
})

function manifestForRoot(root: string): GrokProjectManifest {
  return manifestForEvalRoot(root)
}

function createEventSink(): { win: BrowserWindow; payloads: AgentChatEventPayload[] } {
  const payloads: AgentChatEventPayload[] = []
  const win = {
    webContents: {
      send: (_channel: string, payload: AgentChatEventPayload) => {
        payloads.push(payload)
      },
    },
  } as unknown as BrowserWindow
  return { win, payloads }
}

function basePayload(streamId: string, userText: string): AgentChatStartPayload {
  return baseEvalPayload(streamId, userText)
}

function transportReadThenAnswer(absReadPath: string, finalText: string): AgentChatModelTransport {
  let samples = 0
  return {
    async sampleChatCompletion() {
      samples += 1
      if (samples === 1) {
        return {
          content: '',
          toolCalls: [
            {
              id: 'tc1',
              type: 'function',
              function: {
                name: 'read_file',
                arguments: JSON.stringify({ path: absReadPath }),
              },
            },
          ],
        }
      }
      return { content: '', toolCalls: [] }
    },
    async streamFinalAnswer(_request, _signal, emitChunk) {
      emitChunk(finalText)
    },
  }
}

function transportSearchThenAnswer(query: string, finalText: string): AgentChatModelTransport {
  let samples = 0
  return {
    async sampleChatCompletion() {
      samples += 1
      if (samples === 1) {
        return {
          content: '',
          toolCalls: [
            {
              id: 'tc_search',
              type: 'function',
              function: {
                name: 'search_workspace',
                arguments: JSON.stringify({ query }),
              },
            },
          ],
        }
      }
      return { content: '', toolCalls: [] }
    },
    async streamFinalAnswer(_request, _signal, emitChunk) {
      emitChunk(finalText)
    },
  }
}

function transportCaptureSystemThenAnswer(finalText: string): {
  transport: AgentChatModelTransport
  getSystemPrompt: () => string
} {
  let systemPrompt = ''
  let samples = 0
  const transport: AgentChatModelTransport = {
    async sampleChatCompletion(request, _signal) {
      samples += 1
      if (samples === 1) {
        const first = request.messages[0]
        systemPrompt = first && typeof first.content === 'string' ? first.content : ''
      }
      return { content: '', toolCalls: [] }
    },
    async streamFinalAnswer(_request, _signal, emitChunk) {
      emitChunk(finalText)
    },
  }
  return {
    transport,
    getSystemPrompt: () => systemPrompt,
  }
}

function transportAlwaysToolRead(path: string): AgentChatModelTransport {
  let n = 0
  return {
    async sampleChatCompletion() {
      n += 1
      return {
        content: '',
        toolCalls: [
          {
            id: `tc_${n}`,
            type: 'function',
            function: {
              name: 'read_file',
              arguments: JSON.stringify({ path }),
            },
          },
        ],
      }
    },
    async streamFinalAnswer(_request, _signal, emitChunk) {
      emitChunk('cap')
    },
  }
}

describe('agent runner evaluation harness', () => {
  const restores: Array<() => void> = []

  beforeEach(() => {
    delete process.env.GROKFORGE_E2E_AGENT_REPLY
  })

  afterEach(() => {
    while (restores.length) {
      restores.pop()?.()
    }
    setAgentChatTargetWindow(null)
    delete process.env.GROKFORGE_E2E_AGENT_REPLY
  })

  it('injects greenfield harness marker on plan-mode turns over an empty workspace', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-eval-greenfield-'))

    const { win, payloads } = createEventSink()
    setAgentChatTargetWindow(win)
    const { transport, getSystemPrompt } = transportCaptureSystemThenAnswer('Plan ready.')
    restores.push(setAgentChatModelTransportForTesting(transport))
    restores.push(
      setGetCurrentProjectForTesting(() => ({
        projectId: 'eval-proj-greenfield',
        manifest: manifestForRoot(root),
      })),
    )

    const streamId = 'eval-stream-greenfield'
    primeActiveAgentTurn(streamId)
    const payload = basePayload(streamId, 'Build a todo app')
    payload.activeContext.chatMode = 'plan'
    await runAgentTurnJobForEvaluation(payload)

    expect(getSystemPrompt()).toContain(GREENFIELD_HARNESS_MARKER)
    expect(getSystemPrompt()).toContain(GREENFIELD_PLAN_VERIFY_COMMANDS_MARKER)
    const retrievalDone = payloads.find(
      (p) => p.phase === 'activity' && p.activity.tool === 'retrieval' && p.activity.status === 'done',
    )
    expect(retrievalDone).toBeDefined()
    if (retrievalDone?.phase === 'activity') {
      expect(retrievalDone.activity.title).toBe('No indexed files yet')
      expect(retrievalDone.activity.detail).not.toMatch(/0 files/)
      expect(retrievalDone.activity.title).not.toContain('Found relevant')
    }
    expect(payloads.some((p) => p.phase === 'done')).toBe(true)
  })

  it('records distinct snapshotIds for tool sample and final stream in one turn', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-eval-snapshots-'))
    const appTs = join(root, 'src', 'app.ts')
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(appTs, 'export const app = 1\n', 'utf8')

    const snapshotIds: string[] = []
    const transport: AgentChatModelTransport = {
      async sampleChatCompletion(request) {
        snapshotIds.push(request.snapshotId)
        return {
          content: '',
          toolCalls: [
            {
              id: 'tc1',
              type: 'function',
              function: {
                name: 'read_file',
                arguments: JSON.stringify({ path: appTs }),
              },
            },
          ],
        }
      },
      async streamFinalAnswer(request, _signal, emitChunk) {
        snapshotIds.push(request.snapshotId)
        emitChunk('Done.')
      },
    }

    const { win, payloads } = createEventSink()
    setAgentChatTargetWindow(win)
    restores.push(setAgentChatModelTransportForTesting(transport))
    restores.push(
      setGetCurrentProjectForTesting(() => ({
        projectId: 'eval-proj-snapshots',
        manifest: manifestForRoot(root),
      })),
    )

    const streamId = 'eval-stream-snapshots'
    primeActiveAgentTurn(streamId)
    await runAgentTurnJobForEvaluation(basePayload(streamId, 'What is in src/app.ts?'))

    expect(snapshotIds.length).toBeGreaterThanOrEqual(2)
    expect(new Set(snapshotIds).size).toBe(snapshotIds.length)
    expect(payloads.some((p) => p.phase === 'done')).toBe(true)
  })

  it('emits retrieval, read_file activity, final chunks, and done for a scripted tool then final flow', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-eval-'))
    mkdirSync(join(root, 'src'), { recursive: true })
    const appTs = join(root, 'src', 'app.ts')
    writeFileSync(appTs, 'export const app = 1\n', 'utf8')

    const { win, payloads } = createEventSink()
    setAgentChatTargetWindow(win)
    restores.push(setAgentChatModelTransportForTesting(transportReadThenAnswer(appTs, 'All good.')))
    restores.push(
      setGetCurrentProjectForTesting(() => ({
        projectId: 'eval-proj-1',
        manifest: manifestForRoot(root),
      })),
    )

    const streamId = 'eval-stream-1'
    primeActiveAgentTurn(streamId)
    await runAgentTurnJobForEvaluation(basePayload(streamId, 'What is in src/app.ts?'))

    const turnStarted = payloads.find((p) => p.phase === 'turn_started')
    expect(turnStarted?.phase).toBe('turn_started')
    if (turnStarted?.phase === 'turn_started') {
      expect(turnStarted.routing.modelIntent).toBe('chat_default')
      expect(turnStarted.routing.modelId).toBe('grok-build-0.1')
      expect(turnStarted.routing.harnessProfileKey).toBe('grok_code_fast')
      expect(turnStarted.routing.agentProfileId).toBe('default')
    }
    expect(payloads.some((p) => p.phase === 'activity' && p.activity.tool === 'retrieval')).toBe(true)
    expect(
      payloads.some(
        (p) => p.phase === 'activity' && p.activity.tool === 'read_file' && p.activity.status === 'running',
      ),
    ).toBe(true)
    expect(
      payloads.some(
        (p) => p.phase === 'activity' && p.activity.tool === 'read_file' && p.activity.status === 'done',
      ),
    ).toBe(true)
    const chunks = payloads.filter((p) => p.phase === 'final_chunk').map((p) => p.delta)
    expect(chunks.join('')).toContain('All good.')
    expect(payloads.some((p) => p.phase === 'done')).toBe(true)
  })

  it('runs search_workspace for feature-named edit requests without a path', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-eval-'))
    mkdirSync(join(root, 'src', 'admin'), { recursive: true })
    writeFileSync(join(root, 'src', 'admin', 'page.tsx'), 'export function AdminPage() { return null }\n', 'utf8')

    const { win, payloads } = createEventSink()
    setAgentChatTargetWindow(win)
    restores.push(
      setAgentChatModelTransportForTesting(
        transportSearchThenAnswer('admin', 'Updated admin page styling in src/admin/page.tsx.'),
      ),
    )
    restores.push(
      setGetCurrentProjectForTesting(() => ({
        projectId: 'eval-proj-admin',
        manifest: manifestForRoot(root),
      })),
    )

    const streamId = 'eval-stream-admin'
    primeActiveAgentTurn(streamId)
    await runAgentTurnJobForEvaluation(basePayload(streamId, 'Update the admin page styling'))

    const searchDone = payloads.some(
      (p) => p.phase === 'activity' && p.activity.tool === 'search_workspace' && p.activity.status === 'done',
    )
    expect(searchDone).toBe(true)
    const doneIdx = payloads.findIndex((p) => p.phase === 'done')
    const searchIdx = payloads.findIndex(
      (p) => p.phase === 'activity' && p.activity.tool === 'search_workspace',
    )
    expect(searchIdx).toBeGreaterThanOrEqual(0)
    expect(doneIdx).toBeGreaterThan(searchIdx)
    const finalText = payloads
      .filter((p) => p.phase === 'final_chunk')
      .map((p) => p.delta)
      .join('')
    expect(finalText).toContain('admin')
    expect(/provide (the )?(exact )?file path/i.test(finalText)).toBe(false)
    expect(payloads.some((p) => p.phase === 'done')).toBe(true)
  })

  it('marks sensitive read_file as error and still completes', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-eval-'))
    writeFileSync(join(root, '.env'), 'XAI_API_KEY=secret\n', 'utf8')
    const envPath = join(root, '.env')

    const { win, payloads } = createEventSink()
    setAgentChatTargetWindow(win)
    restores.push(setAgentChatModelTransportForTesting(transportReadThenAnswer(envPath, 'Cannot read secrets.')))
    restores.push(
      setGetCurrentProjectForTesting(() => ({
        projectId: 'eval-proj-2',
        manifest: manifestForRoot(root),
      })),
    )

    const streamId = 'eval-stream-2'
    primeActiveAgentTurn(streamId)
    await runAgentTurnJobForEvaluation(basePayload(streamId, 'Read my env'))

    expect(
      payloads.some(
        (p) => p.phase === 'activity' && p.activity.tool === 'read_file' && p.activity.status === 'error',
      ),
    ).toBe(true)
    expect(payloads.some((p) => p.phase === 'done')).toBe(true)
  })

  it('marks ignored-path read_file as error and still completes', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-eval-'))
    mkdirSync(join(root, 'ignored'), { recursive: true })
    const hidden = join(root, 'ignored', 'x.ts')
    writeFileSync(hidden, '// n\n', 'utf8')

    const { win, payloads } = createEventSink()
    setAgentChatTargetWindow(win)
    restores.push(setAgentChatModelTransportForTesting(transportReadThenAnswer(hidden, 'Skipped ignored.')))
    restores.push(
      setGetCurrentProjectForTesting(() => ({
        projectId: 'eval-proj-3',
        manifest: manifestForRoot(root),
      })),
    )

    const streamId = 'eval-stream-3'
    primeActiveAgentTurn(streamId)
    await runAgentTurnJobForEvaluation(basePayload(streamId, 'Read ignored/x.ts'))

    expect(
      payloads.some(
        (p) => p.phase === 'activity' && p.activity.tool === 'read_file' && p.activity.status === 'error',
      ),
    ).toBe(true)
    expect(payloads.some((p) => p.phase === 'done')).toBe(true)
  })

  it('re-samples once when edit-intent fast turn returns zero tools on first sample', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-eval-edit-nudge-'))
    const file = join(root, 'index.html')
    writeFileSync(file, '<html><body>hi</body></html>', 'utf8')

    let sampleCount = 0
    let sawNudgeOnSecondSample = false
    const transport: AgentChatModelTransport = {
      async sampleChatCompletion(request) {
        sampleCount += 1
        const hasNudge = request.messages.some(
          (m) =>
            m.role === 'user' &&
            typeof m.content === 'string' &&
            m.content.includes(EDIT_INTENT_TOOL_NUDGE_MARKER),
        )
        if (sampleCount === 2) sawNudgeOnSecondSample = hasNudge
        if (sampleCount === 1) return { content: '', toolCalls: [] }
        if (sampleCount === 2) {
          return {
            content: '',
            toolCalls: [
              {
                id: 'tc-read',
                type: 'function',
                function: {
                  name: 'read_file',
                  arguments: JSON.stringify({ path: file }),
                },
              },
            ],
          }
        }
        return { content: '', toolCalls: [] }
      },
      async streamFinalAnswer(_request, _signal, emitChunk) {
        emitChunk('Done.')
      },
    }

    const { win, payloads } = createEventSink()
    setAgentChatTargetWindow(win)
    restores.push(setAgentChatModelTransportForTesting(transport))
    restores.push(
      setGetCurrentProjectForTesting(() => ({
        projectId: 'eval-edit-nudge',
        manifest: manifestForRoot(root),
      })),
    )

    const streamId = 'eval-edit-nudge'
    primeActiveAgentTurn(streamId)
    await runAgentTurnJobForEvaluation(
      basePayload(streamId, 'In index.html, change the page title text and add a footer paragraph.'),
    )

    expect(sampleCount).toBeGreaterThanOrEqual(2)
    expect(sawNudgeOnSecondSample).toBe(true)
    expect(
      payloads.some(
        (p) => p.phase === 'activity' && p.activity.tool === 'read_file' && p.activity.status === 'done',
      ),
    ).toBe(true)
    expect(payloads.some((p) => p.phase === 'done')).toBe(true)
  })

  it('injects search_replace escalation nudge after repeated failures then accepts propose_file_edits', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-eval-sr-escalation-'))
    const file = join(root, 'docs', 'overview.md')
    mkdirSync(dirname(file), { recursive: true })
    const original = '# TaskBoard Overview\n\n## Tech Stack (planned)\n- Frontend: Likely React\n'
    writeFileSync(file, original, 'utf8')
    const hash = computeAgentContentHash(original)

    let sampleCount = 0
    let sawEscalationOnSample = false
    const transport: AgentChatModelTransport = {
      async sampleChatCompletion(request) {
        sampleCount += 1
        const hasEscalation = request.messages.some(
          (m) =>
            m.role === 'user' &&
            typeof m.content === 'string' &&
            m.content.includes(EDIT_SEARCH_REPLACE_ESCALATION_MARKER),
        )
        if (hasEscalation) sawEscalationOnSample = true

        if (sampleCount === 1) {
          return {
            content: '',
            toolCalls: [
              {
                id: 'tc-read',
                type: 'function',
                function: { name: 'read_file', arguments: JSON.stringify({ path: file }) },
              },
            ],
          }
        }
        if (sampleCount === 2 || sampleCount === 3) {
          return {
            content: '',
            toolCalls: [
              {
                id: `tc-sr-${sampleCount}`,
                type: 'function',
                function: {
                  name: 'search_replace',
                  arguments: JSON.stringify({
                    path: file,
                    old_string: '## Tech Stack (planned)\n- Frontend: NOT_ON_DISK',
                    new_string: '## Tech Stack\n- Frontend: React + TypeScript\n',
                    expectedContentHash: hash,
                  }),
                },
              },
            ],
          }
        }
        if (sampleCount === 4) {
          expect(hasEscalation).toBe(true)
          expect(
            request.messages.some(
              (m) =>
                m.role === 'user' &&
                typeof m.content === 'string' &&
                m.content.includes(EDIT_ITERATIVE_SEARCH_REPLACE_ESCALATION_MARKER),
            ),
          ).toBe(false)
          const updated = original.replace('Likely React', 'React + TypeScript')
          return {
            content: '',
            toolCalls: [
              {
                id: 'tc-propose',
                type: 'function',
                function: {
                  name: 'propose_file_edits',
                  arguments: JSON.stringify({
                    version: AGENT_TOOL_PROTOCOL_VERSION,
                    operations: [
                      {
                        op: 'write_file',
                        path: file,
                        content: updated,
                        expectedContentHash: hash,
                      },
                    ],
                  }),
                },
              },
            ],
          }
        }
        return { content: '', toolCalls: [] }
      },
      async streamFinalAnswer(_request, _signal, emitChunk) {
        emitChunk('Proposal ready for review.')
      },
    }

    const { win, payloads } = createEventSink()
    setAgentChatTargetWindow(win)
    restores.push(setAgentChatModelTransportForTesting(transport))
    restores.push(
      setGetCurrentProjectForTesting(() => ({
        projectId: 'eval-sr-escalation',
        manifest: manifestForRoot(root),
      })),
    )

    const streamId = 'eval-sr-escalation'
    primeActiveAgentTurn(streamId)
    await runAgentTurnJobForEvaluation(
      basePayload(streamId, 'Update overview.md tech stack to React + TypeScript.'),
    )

    expect(sawEscalationOnSample).toBe(true)
    expect(sampleCount).toBeGreaterThanOrEqual(4)
    expect(sampleCount).toBeGreaterThanOrEqual(
      SEARCH_REPLACE_FAILURES_BEFORE_ESCALATION_GUARD + 2,
    )
    expect(payloads.some((p) => p.phase === 'done')).toBe(true)
  })

  it(`${AGENT_EVAL_TAG_BEHAVIOR_GREENFIELD_EXECUTE} — approve-and-run bootstrap includes script.js in proposal`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-eval-gf-exec-'))
    const projectId = 'eval-greenfield-execute-124'
    const { planId } = seedApprovedPlanArtifact(projectId, { plan: staticTodoPlanV1 })

    let sampleCount = 0
    let systemPrompt = ''
    const transport: AgentChatModelTransport = {
      async sampleChatCompletion(request) {
        sampleCount += 1
        if (sampleCount === 1) {
          const first = request.messages[0]
          systemPrompt = first && typeof first.content === 'string' ? first.content : ''
          return {
            content: '',
            toolCalls: [
              {
                id: 'tc-bootstrap',
                type: 'function',
                function: {
                  name: 'propose_file_edits',
                  arguments: JSON.stringify({
                    version: AGENT_TOOL_PROTOCOL_VERSION,
                    operations: staticTodoWriteFileOperations(root),
                  }),
                },
              },
            ],
          }
        }
        return { content: '', toolCalls: [] }
      },
      async streamFinalAnswer(_request, _signal, emitChunk) {
        emitChunk('Bootstrap proposal ready.')
      },
    }

    const { win, payloads } = createEventSink()
    setAgentChatTargetWindow(win)
    restores.push(setAgentChatModelTransportForTesting(transport))
    restores.push(
      setGetCurrentProjectForTesting(() => ({
        projectId,
        manifest: manifestForRoot(root),
      })),
    )

    const streamId = 'eval-greenfield-execute-124'
    primeActiveAgentTurn(streamId)
    await runAgentTurnJobForEvaluation({
      ...basePayload(streamId, buildApprovedPlanExecuteUserText(planId, 'Vanilla todo app')),
      isApprovedPlanAutoRun: true,
      approvedPlanId: planId,
      modelIntent: 'execution',
    })

    expect(systemPrompt).toContain(GREENFIELD_EXECUTE_BOOTSTRAP_SECTIONS[0])
    expect(systemPrompt).toContain(GREENFIELD_EXECUTE_CLI_MARKER)
    expect(systemPrompt).toMatch(/script\.js/i)
    const proposal = payloads.find((p) => p.phase === 'edit_proposal')
    expect(proposal?.phase).toBe('edit_proposal')
    if (proposal?.phase === 'edit_proposal') {
      const paths = proposal.proposal.batch.operations.map((op) => op.path)
      expect(paths.some((p) => p.endsWith('script.js'))).toBe(true)
      expect(proposal.proposal.rejected.length).toBe(0)
    }
    expect(payloads.some((p) => p.phase === 'done')).toBe(true)
  })

  it(`${AGENT_EVAL_TAG_BEHAVIOR_RUN_COMMAND_PLAN_VERIFY} — injects command nudge when verify step skipped`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-eval-cmd-nudge-'))
    const projectId = 'eval-run-command-nudge-126'
    const { planId } = seedApprovedPlanArtifact(projectId, {
      plan: {
        schemaVersion: 1,
        summary: 'Vite React app',
        filesLikelyTouched: ['package.json'],
        risksUnknowns: [],
        steps: [{ id: '1', title: 'npm install dependencies' }],
        verification: 'npm run typecheck',
      },
    })

    let sampleCount = 0
    let sawNudge = false
    const transport: AgentChatModelTransport = {
      async sampleChatCompletion(request) {
        sampleCount += 1
        const joined = request.messages
          .map((m) => (typeof m.content === 'string' ? m.content : ''))
          .join('\n')
        if (joined.includes(PLAN_VERIFY_COMMAND_NUDGE_MARKER)) sawNudge = true
        if (sampleCount === 1) return { content: '', toolCalls: [] }
        return { content: '', toolCalls: [] }
      },
      async streamFinalAnswer(_request, _signal, emitChunk) {
        emitChunk('Need to run typecheck via run_command.')
      },
    }

    const { win } = createEventSink()
    setAgentChatTargetWindow(win)
    restores.push(setAgentChatModelTransportForTesting(transport))
    restores.push(
      setGetCurrentProjectForTesting(() => ({
        projectId,
        manifest: manifestForRoot(root),
      })),
    )

    const streamId = 'eval-run-command-nudge-126'
    primeActiveAgentTurn(streamId)
    await runAgentTurnJobForEvaluation({
      ...basePayload(streamId, buildApprovedPlanExecuteUserText(planId, 'Vite React app')),
      isApprovedPlanAutoRun: true,
      approvedPlanId: planId,
      modelIntent: 'execution',
    })

    expect(sawNudge).toBe(true)
    expect(sampleCount).toBeGreaterThanOrEqual(2)
  })

  it(`${AGENT_EVAL_TAG_BEHAVIOR_GREENFIELD_PLAN_STATIC_VERIFY_COPY} — planner prompt includes static verify marker`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-eval-static-verify-copy-'))

    const { win } = createEventSink()
    setAgentChatTargetWindow(win)
    const { transport, getSystemPrompt } = transportCaptureSystemThenAnswer('Plan ready.')
    restores.push(setAgentChatModelTransportForTesting(transport))
    restores.push(
      setGetCurrentProjectForTesting(() => ({
        projectId: 'eval-proj-static-verify-copy',
        manifest: manifestForRoot(root),
      })),
    )

    const streamId = 'eval-stream-static-verify-copy'
    primeActiveAgentTurn(streamId)
    const payload = basePayload(streamId, 'Build a static todo app with HTML CSS and JS')
    payload.activeContext.chatMode = 'plan'
    await runAgentTurnJobForEvaluation(payload)

    const prompt = getSystemPrompt()
    expect(prompt).toContain(GREENFIELD_PLAN_VERIFY_COMMANDS_MARKER)
    expect(prompt).toMatch(/npx --yes serve/i)
    expect(prompt).toMatch(/python3 -m http\.server/i)
    expect(prompt).toMatch(/browser-only/i)
  })

  it(`${AGENT_EVAL_TAG_BEHAVIOR_GREENFIELD_PLAN_NPM_VERIFY_COPY} — planner prompt includes npm verify examples`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-eval-npm-verify-copy-'))

    const { win } = createEventSink()
    setAgentChatTargetWindow(win)
    const { transport, getSystemPrompt } = transportCaptureSystemThenAnswer('Plan ready.')
    restores.push(setAgentChatModelTransportForTesting(transport))
    restores.push(
      setGetCurrentProjectForTesting(() => ({
        projectId: 'eval-proj-npm-verify-copy',
        manifest: manifestForRoot(root),
      })),
    )

    const streamId = 'eval-stream-npm-verify-copy'
    primeActiveAgentTurn(streamId)
    const payload = basePayload(streamId, 'Build a Vite React todo app')
    payload.activeContext.chatMode = 'plan'
    await runAgentTurnJobForEvaluation(payload)

    const prompt = getSystemPrompt()
    expect(prompt).toContain(GREENFIELD_PLAN_VERIFY_COMMANDS_MARKER)
    expect(prompt).toMatch(/npm run typecheck/i)
    expect(prompt).toMatch(/npm run dev/i)
  })

  it(`${AGENT_EVAL_TAG_BEHAVIOR_GREENFIELD_EXECUTE_STATIC_VERIFY_NUDGE} — static plan injects serve command nudge`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-eval-static-verify-nudge-'))
    const projectId = 'eval-static-verify-nudge-132'
    const { planId } = seedApprovedPlanArtifact(projectId, {
      plan: {
        schemaVersion: 1,
        summary: 'Vanilla static todo app',
        filesLikelyTouched: ['index.html', 'styles.css', 'script.js'],
        risksUnknowns: [],
        steps: [{ id: '1', title: 'Create index.html, styles.css, script.js' }],
        verification: 'Open in browser and test the todo app',
      },
    })

    let sampleCount = 0
    let nudgeContent = ''
    const transport: AgentChatModelTransport = {
      async sampleChatCompletion(request) {
        sampleCount += 1
        const joined = request.messages
          .map((m) => (typeof m.content === 'string' ? m.content : ''))
          .join('\n')
        if (joined.includes(PLAN_VERIFY_COMMAND_NUDGE_MARKER)) {
          const idx = joined.indexOf(PLAN_VERIFY_COMMAND_NUDGE_MARKER)
          nudgeContent = joined.slice(idx, idx + 800)
        }
        if (sampleCount === 1) return { content: '', toolCalls: [] }
        return { content: '', toolCalls: [] }
      },
      async streamFinalAnswer(_request, _signal, emitChunk) {
        emitChunk('Files created; serve locally to verify.')
      },
    }

    const { win } = createEventSink()
    setAgentChatTargetWindow(win)
    restores.push(setAgentChatModelTransportForTesting(transport))
    restores.push(
      setGetCurrentProjectForTesting(() => ({
        projectId,
        manifest: manifestForRoot(root),
      })),
    )

    const streamId = 'eval-static-verify-nudge-132'
    primeActiveAgentTurn(streamId)
    await runAgentTurnJobForEvaluation({
      ...basePayload(streamId, buildApprovedPlanExecuteUserText(planId, 'Vanilla static todo app')),
      isApprovedPlanAutoRun: true,
      approvedPlanId: planId,
      modelIntent: 'execution',
    })

    expect(nudgeContent).toContain(PLAN_VERIFY_COMMAND_NUDGE_MARKER)
    expect(nudgeContent).toMatch(/npx.*serve|http\.server/i)
    expect(sampleCount).toBeGreaterThanOrEqual(2)
  })

  it(`${AGENT_EVAL_TAG_BEHAVIOR_GREENFIELD_STATIC_PLAN_EXECUTE_HAPPY} — plan marker then execute bootstrap with valid HTML`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-eval-static-plan-exec-133-'))
    const projectId = 'eval-static-plan-exec-133'

    const { win: winPlan } = createEventSink()
    setAgentChatTargetWindow(winPlan)
    const { transport: planTransport, getSystemPrompt: getPlanPrompt } =
      transportCaptureSystemThenAnswer('Plan ready.')
    restores.push(setAgentChatModelTransportForTesting(planTransport))
    restores.push(
      setGetCurrentProjectForTesting(() => ({
        projectId,
        manifest: manifestForRoot(root),
      })),
    )

    const planStreamId = 'eval-static-plan-133'
    primeActiveAgentTurn(planStreamId)
    const planPayload = basePayload(planStreamId, 'Build a static todo app with HTML CSS and JS')
    planPayload.activeContext.chatMode = 'plan'
    await runAgentTurnJobForEvaluation(planPayload)

    expect(getPlanPrompt()).toContain(GREENFIELD_HARNESS_MARKER)
    expect(getPlanPrompt()).toContain(GREENFIELD_PLAN_VERIFY_COMMANDS_MARKER)

    const { planId } = seedApprovedPlanArtifact(projectId, { plan: staticTodoPlanV1 })
    const { html } = staticTodoValidFiles()

    let executeSystemPrompt = ''
    const transport: AgentChatModelTransport = {
      async sampleChatCompletion(request) {
        const first = request.messages[0]
        executeSystemPrompt = first && typeof first.content === 'string' ? first.content : ''
        return {
          content: '',
          toolCalls: [
            {
              id: 'tc-static-bootstrap-133',
              type: 'function',
              function: {
                name: 'propose_file_edits',
                arguments: JSON.stringify({
                  version: AGENT_TOOL_PROTOCOL_VERSION,
                  operations: staticTodoWriteFileOperations(root),
                }),
              },
            },
          ],
        }
      },
      async streamFinalAnswer(_request, _signal, emitChunk) {
        emitChunk('Static bootstrap ready.')
      },
    }

    const { win, payloads } = createEventSink()
    setAgentChatTargetWindow(win)
    restores.push(setAgentChatModelTransportForTesting(transport))

    const streamId = 'eval-static-exec-133'
    primeActiveAgentTurn(streamId)
    await runAgentTurnJobForEvaluation({
      ...basePayload(streamId, buildApprovedPlanExecuteUserText(planId, staticTodoPlanV1.summary)),
      isApprovedPlanAutoRun: true,
      approvedPlanId: planId,
      modelIntent: 'execution',
    })

    expect(executeSystemPrompt).toContain(GREENFIELD_EXECUTE_BOOTSTRAP_SECTIONS[0])
    expect(executeSystemPrompt).toContain(GREENFIELD_EXECUTE_CLI_MARKER)
    expect(executeSystemPrompt).toContain(SCAFFOLD_STRATEGY_ROUTING_MARKER)
    expect(executeSystemPrompt).toMatch(/file_bootstrap/i)
    expect(executeSystemPrompt).toMatch(/script\.js/i)
    expect(
      payloads.some(
        (p) => p.phase === 'activity' && p.activity.title === 'Harness: scaffold strategy conflict',
      ),
    ).toBe(false)

    const proposal = payloads.find((p) => p.phase === 'edit_proposal')
    expect(proposal?.phase).toBe('edit_proposal')
    if (proposal?.phase === 'edit_proposal') {
      expect(proposal.proposal.rejected.length).toBe(0)
      const paths = proposal.proposal.batch.operations.map((op) => op.path)
      expect(paths.some((p) => p.endsWith('index.html'))).toBe(true)
      expect(paths.some((p) => p.endsWith('styles.css'))).toBe(true)
      expect(paths.some((p) => p.endsWith('script.js'))).toBe(true)
      const htmlOp = proposal.proposal.batch.operations.find(
        (op) => op.op === 'write_file' && op.path.endsWith('index.html'),
      )
      if (htmlOp && htmlOp.op === 'write_file') {
        expect(
          assessProposalWriteContent(htmlOp.content, { resolvedPath: htmlOp.path }).ok,
        ).toBe(true)
      }
    }
    expect(assessProposalWriteContent(html, { resolvedPath: join(root, 'index.html') }).ok).toBe(
      true,
    )
    expect(payloads.some((p) => p.phase === 'done')).toBe(true)
  })

  // Expected rejection reason substring: crushed|jammed|script (see agent-edit-corrupt-content.test.ts)
  it(`${AGENT_EVAL_TAG_VALIDATION_GREENFIELD_STATIC_HTML_CORRUPTION} — rejects crushed one-line index.html`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-eval-static-html-corrupt-133-'))
    const projectId = 'eval-static-html-corrupt-133'
    const { planId } = seedApprovedPlanArtifact(projectId, { plan: staticTodoPlanV1 })

    const transport: AgentChatModelTransport = {
      async sampleChatCompletion() {
        return {
          content: '',
          toolCalls: [
            {
              id: 'tc-crushed-html',
              type: 'function',
              function: {
                name: 'propose_file_edits',
                arguments: JSON.stringify({
                  version: AGENT_TOOL_PROTOCOL_VERSION,
                  operations: [
                    {
                      op: 'write_file',
                      path: join(root, 'index.html'),
                      content: staticTodoCrushedIndexHtml(),
                    },
                  ],
                }),
              },
            },
          ],
        }
      },
      async streamFinalAnswer(_request, _signal, emitChunk) {
        emitChunk('Proposal needs review.')
      },
    }

    const { win, payloads } = createEventSink()
    setAgentChatTargetWindow(win)
    restores.push(setAgentChatModelTransportForTesting(transport))
    restores.push(
      setGetCurrentProjectForTesting(() => ({
        projectId,
        manifest: manifestForRoot(root),
      })),
    )

    const streamId = 'eval-static-html-corrupt-133'
    primeActiveAgentTurn(streamId)
    await runAgentTurnJobForEvaluation({
      ...basePayload(streamId, buildApprovedPlanExecuteUserText(planId, staticTodoPlanV1.summary)),
      isApprovedPlanAutoRun: true,
      approvedPlanId: planId,
      modelIntent: 'execution',
    })

    expect(payloads.some((p) => p.phase === 'edit_proposal')).toBe(false)
    expect(
      assessProposalWriteContent(staticTodoCrushedIndexHtml(), {
        resolvedPath: join(root, 'index.html'),
      }).ok,
    ).toBe(false)
    const failedActivity = payloads.find(
      (p) =>
        p.phase === 'activity' &&
        p.activity.title === 'Edit proposal failed' &&
        p.activity.status === 'error',
    )
    expect(failedActivity).toBeDefined()
    expect(failedActivity?.phase === 'activity' ? failedActivity.activity.detail : '').toMatch(
      /crushed|jammed|script/i,
    )
    expect(payloads.some((p) => p.phase === 'done')).toBe(true)
  })

  it(`${AGENT_EVAL_TAG_BEHAVIOR_RUN_COMMAND_PLAN_VERIFY} — samples run_command when model requests verify`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-eval-cmd-sample-'))
    const projectId = 'eval-run-command-sample-126'
    const { planId } = seedApprovedPlanArtifact(projectId, {
      plan: {
        schemaVersion: 1,
        summary: 'Install deps',
        filesLikelyTouched: ['package.json'],
        risksUnknowns: [],
        steps: [{ id: '1', title: 'npm install' }],
        verification: 'npm run typecheck',
      },
    })

    let sampledRunCommand = false
    const transport: AgentChatModelTransport = {
      async sampleChatCompletion() {
        sampledRunCommand = true
        return {
          content: '',
          toolCalls: [
            {
              id: 'tc-cmd',
              type: 'function',
              function: {
                name: 'run_command',
                arguments: JSON.stringify({
                  rootId: 'root',
                  command: 'npm run typecheck',
                  purpose: 'Verify project typechecks per approved plan',
                }),
              },
            },
          ],
        }
      },
      async streamFinalAnswer(_request, _signal, emitChunk) {
        emitChunk('Typecheck command was rejected in eval.')
      },
    }

    const { win, payloads } = createEventSink()
    setAgentChatTargetWindow(win)
    restores.push(setAgentChatModelTransportForTesting(transport))
    restores.push(setCommandApprovalAutoResponderForTesting(() => false))
    restores.push(
      setGetCurrentProjectForTesting(() => ({
        projectId,
        manifest: manifestForRoot(root),
      })),
    )

    const streamId = 'eval-run-command-sample-126'
    primeActiveAgentTurn(streamId)
    await runAgentTurnJobForEvaluation({
      ...basePayload(streamId, buildApprovedPlanExecuteUserText(planId, 'Install deps')),
      isApprovedPlanAutoRun: true,
      approvedPlanId: planId,
      modelIntent: 'execution',
    })

    expect(sampledRunCommand).toBe(true)
    const activities = payloads.filter((p) => p.phase === 'activity')
    expect(
      activities.some(
        (p) =>
          p.phase === 'activity' &&
          p.activity.title === 'Command rejected' &&
          p.activity.status === 'rejected',
      ),
    ).toBe(true)
  })

  it(`${AGENT_EVAL_TAG_RECOVERY_PARTIAL_BATCH} — injects nudge when batch accepts HTML/CSS and rejects script.js`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-eval-partial-batch-'))
    const projectId = 'eval-partial-batch-124'
    const { planId } = seedApprovedPlanArtifact(projectId, {
      plan: {
        schemaVersion: 1,
        summary: 'Vanilla todo app',
        filesLikelyTouched: ['index.html', 'styles.css', 'script.js'],
        risksUnknowns: [],
        steps: [{ id: '1', title: 'Create index.html, styles.css, script.js' }],
        verification: 'Open index.html',
      },
    })

    const html = `<!DOCTYPE html>
<html lang="en"><head><title>Todo</title><link rel="stylesheet" href="styles.css"></head>
<body><h1>Todo</h1><script src="script.js"></script></body></html>`
    const css = 'body { font-family: sans-serif; margin: 0; }\n'
    const corruptJs = `function init() {
)
)
)
);
)
)
`
    const validJs = `function init() {\n  document.addEventListener('DOMContentLoaded', () => {});\n}\ninit();\n`

    let sampleCount = 0
    let sawPartialNudge = false
    let partialBatchRecovered = false
    const transport: AgentChatModelTransport = {
      async sampleChatCompletion(request) {
        sampleCount += 1
        const hasPartialNudge = request.messages.some(
          (m) =>
            m.role === 'user' &&
            typeof m.content === 'string' &&
            m.content.includes(EDIT_PARTIAL_BATCH_NUDGE_MARKER),
        )
        if (hasPartialNudge) sawPartialNudge = true

        if (sampleCount === 1) {
          return {
            content: '',
            toolCalls: [
              {
                id: 'tc-partial',
                type: 'function',
                function: {
                  name: 'propose_file_edits',
                  arguments: JSON.stringify({
                    version: AGENT_TOOL_PROTOCOL_VERSION,
                    operations: [
                      { op: 'write_file', path: join(root, 'index.html'), content: html },
                      { op: 'write_file', path: join(root, 'styles.css'), content: css },
                      { op: 'write_file', path: join(root, 'script.js'), content: corruptJs },
                    ],
                  }),
                },
              },
            ],
          }
        }
        if (sampleCount === 2) {
          expect(hasPartialNudge).toBe(true)
          partialBatchRecovered = true
          return {
            content: '',
            toolCalls: [
              {
                id: 'tc-fix-js',
                type: 'function',
                function: {
                  name: 'propose_file_edits',
                  arguments: JSON.stringify({
                    version: AGENT_TOOL_PROTOCOL_VERSION,
                    operations: [{ op: 'write_file', path: join(root, 'script.js'), content: validJs }],
                  }),
                },
              },
            ],
          }
        }
        return { content: '', toolCalls: [] }
      },
      async streamFinalAnswer(request, _signal, emitChunk) {
        const hasHonesty = request.messages.some(
          (m) =>
            m.role === 'system' &&
            typeof m.content === 'string' &&
            m.content.includes(PARTIAL_BATCH_PROPOSAL_HONESTY_MARKER),
        )
        if (sawPartialNudge && !partialBatchRecovered) expect(hasHonesty).toBe(true)
        emitChunk('Partial bootstrap — review diff.')
      },
    }

    const { win, payloads } = createEventSink()
    setAgentChatTargetWindow(win)
    restores.push(setAgentChatModelTransportForTesting(transport))
    restores.push(
      setGetCurrentProjectForTesting(() => ({
        projectId,
        manifest: manifestForRoot(root),
      })),
    )

    const streamId = 'eval-partial-batch-124'
    primeActiveAgentTurn(streamId)
    await runAgentTurnJobForEvaluation({
      ...basePayload(streamId, buildApprovedPlanExecuteUserText(planId, 'Vanilla todo app')),
      isApprovedPlanAutoRun: true,
      approvedPlanId: planId,
      modelIntent: 'execution',
    })

    expect(sawPartialNudge).toBe(true)
    expect(sampleCount).toBeGreaterThanOrEqual(2)
    expect(
      payloads.some(
        (p) => p.phase === 'activity' && p.activity.title === 'Harness: retry rejected paths',
      ),
    ).toBe(true)
    const proposals = payloads.filter((p) => p.phase === 'edit_proposal')
    expect(proposals.length).toBeGreaterThanOrEqual(2)
    const finalProposal = proposals.at(-1)
    if (finalProposal?.phase === 'edit_proposal') {
      expect(finalProposal.proposal.batch.operations.length).toBe(3)
      expect(finalProposal.proposal.rejected).toHaveLength(0)
    }
    expect(payloads.some((p) => p.phase === 'done')).toBe(true)
  })

  it(`${AGENT_EVAL_TAG_RECOVERY_CREATION_INCREMENTAL} — injects incremental recovery after 2 all-rejected failures on new path`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-eval-creation-incremental-'))
    const projectId = 'eval-creation-incremental'
    const { planId } = seedApprovedPlanArtifact(projectId, {
      plan: {
        schemaVersion: 1,
        summary: 'Vanilla todo app',
        filesLikelyTouched: ['script.js'],
        risksUnknowns: [],
        steps: [{ id: '1', title: 'Create script.js' }],
        verification: 'Open in browser',
      },
    })

    const corruptJs = `function init() {
)
)
);
)
`
    let sampleCount = 0
    let sawCreationRecoveryBeforeThirdSample = false
    const transport: AgentChatModelTransport = {
      async sampleChatCompletion(request) {
        sampleCount += 1
        const hasCreationRecovery = request.messages.some(
          (m) =>
            m.role === 'user' &&
            typeof m.content === 'string' &&
            m.content.includes(EDIT_CREATION_INCREMENTAL_RECOVERY_MARKER),
        )
        if (sampleCount < 3 && hasCreationRecovery) {
          sawCreationRecoveryBeforeThirdSample = true
        }

        if (sampleCount <= 2) {
          return {
            content: '',
            toolCalls: [
              {
                id: `tc-fail-${sampleCount}`,
                type: 'function',
                function: {
                  name: 'propose_file_edits',
                  arguments: JSON.stringify({
                    version: AGENT_TOOL_PROTOCOL_VERSION,
                    operations: [
                      { op: 'write_file', path: join(root, 'script.js'), content: corruptJs },
                    ],
                  }),
                },
              },
            ],
          }
        }
        if (sampleCount === 3) {
          expect(hasCreationRecovery).toBe(true)
        }
        return { content: '', toolCalls: [] }
      },
      async streamFinalAnswer(_request, _signal, emitChunk) {
        emitChunk('Bootstrap attempted — review harness recovery.')
      },
    }

    const { win, payloads } = createEventSink()
    setAgentChatTargetWindow(win)
    restores.push(setAgentChatModelTransportForTesting(transport))
    restores.push(
      setGetCurrentProjectForTesting(() => ({
        projectId,
        manifest: manifestForRoot(root),
      })),
    )

    const streamId = 'eval-creation-incremental'
    primeActiveAgentTurn(streamId)
    await runAgentTurnJobForEvaluation({
      ...basePayload(streamId, buildApprovedPlanExecuteUserText(planId, 'Vanilla todo app')),
      isApprovedPlanAutoRun: true,
      approvedPlanId: planId,
      modelIntent: 'execution',
    })

    expect(sawCreationRecoveryBeforeThirdSample).toBe(false)
    expect(sampleCount).toBeGreaterThanOrEqual(3)
    expect(
      payloads.some(
        (p) =>
          p.phase === 'activity' && p.activity.title === 'Harness: incremental file creation',
      ),
    ).toBe(true)
    expect(
      payloads.some(
        (p) =>
          p.phase === 'activity' &&
          p.activity.title === 'Harness: multi-line JavaScript required',
      ),
    ).toBe(false)
    expect(payloads.some((p) => p.phase === 'edit_proposal')).toBe(false)
    expect(payloads.some((p) => p.phase === 'done')).toBe(true)
  })

  it(`${AGENT_EVAL_TAG_BEHAVIOR_GREENFIELD_VITE_SCAFFOLD} — accepts valid package.json and entry file on approve-and-run`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-eval-vite-scaffold-127-'))
    const projectId = 'eval-vite-scaffold-127'
    const { planId } = seedApprovedPlanArtifact(projectId, {
      plan: {
        schemaVersion: 1,
        summary: 'Vite React TypeScript todo app',
        filesLikelyTouched: ['package.json', 'index.html', 'src/main.tsx'],
        risksUnknowns: [],
        steps: [
          { id: '1', title: 'Create package.json and Vite entry files' },
          { id: '2', title: 'npm install dependencies' },
        ],
        verification: 'npm run typecheck',
      },
    })

    const packageJson = '{"name":"todo-vite","private":true,"version":"0.0.0","type":"module"}'
    const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Todo</title></head>
<body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>
</html>`
    const mainTsx = `import React from 'react';\nimport ReactDOM from 'react-dom/client';\n\nReactDOM.createRoot(document.getElementById('root')!).render(<h1>Todo</h1>);\n`

    let systemPrompt = ''
    const transport: AgentChatModelTransport = {
      async sampleChatCompletion(request) {
        const first = request.messages[0]
        systemPrompt = first && typeof first.content === 'string' ? first.content : ''
        return {
          content: '',
          toolCalls: [
            {
              id: 'tc-vite',
              type: 'function',
              function: {
                name: 'propose_file_edits',
                arguments: JSON.stringify({
                  version: AGENT_TOOL_PROTOCOL_VERSION,
                  operations: [
                    { op: 'write_file', path: join(root, 'package.json'), content: packageJson },
                    { op: 'write_file', path: join(root, 'index.html'), content: indexHtml },
                    { op: 'write_file', path: join(root, 'src', 'main.tsx'), content: mainTsx },
                  ],
                }),
              },
            },
          ],
        }
      },
      async streamFinalAnswer(_request, _signal, emitChunk) {
        emitChunk('Vite scaffold proposal ready.')
      },
    }

    const { win, payloads } = createEventSink()
    setAgentChatTargetWindow(win)
    restores.push(setAgentChatModelTransportForTesting(transport))
    restores.push(
      setGetCurrentProjectForTesting(() => ({
        projectId,
        manifest: manifestForRoot(root),
      })),
    )

    const streamId = 'eval-vite-scaffold-127'
    primeActiveAgentTurn(streamId)
    await runAgentTurnJobForEvaluation({
      ...basePayload(streamId, buildApprovedPlanExecuteUserText(planId, 'Vite React TypeScript todo app')),
      isApprovedPlanAutoRun: true,
      approvedPlanId: planId,
      modelIntent: 'execution',
    })

    expect(systemPrompt).toContain(GREENFIELD_SCAFFOLD_MANIFEST_MARKER)
    expect(systemPrompt).not.toContain(SINGLE_FILE_EDIT_BIAS_MARKER)
    const proposal = payloads.find((p) => p.phase === 'edit_proposal')
    expect(proposal?.phase).toBe('edit_proposal')
    if (proposal?.phase === 'edit_proposal') {
      expect(proposal.proposal.rejected.length).toBe(0)
      const paths = proposal.proposal.batch.operations.map((op) => op.path)
      expect(paths.some((p) => p.endsWith('package.json'))).toBe(true)
      expect(paths.some((p) => p.endsWith('main.tsx'))).toBe(true)
    }
    expect(payloads.some((p) => p.phase === 'done')).toBe(true)
  })

  it(`${AGENT_EVAL_TAG_RECOVERY_SCAFFOLD_PARTIAL} — injects package.json hint when config rejected and HTML accepted`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-eval-scaffold-partial-127-'))
    const projectId = 'eval-scaffold-partial-127'
    const { planId } = seedApprovedPlanArtifact(projectId, {
      plan: {
        schemaVersion: 1,
        summary: 'Vite todo app bootstrap',
        filesLikelyTouched: ['package.json', 'index.html'],
        risksUnknowns: [],
        steps: [{ id: '1', title: 'Create package.json and index.html' }],
        verification: 'npm install',
      },
    })

    const badPackageJson = '{name: todo, private: true'
    const indexHtml = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Todo</title></head>
<body><div id="root"></div></body></html>`

    let sampleCount = 0
    let sawPartialNudge = false
    let sawPackageJsonHint = false
    const transport: AgentChatModelTransport = {
      async sampleChatCompletion(request) {
        sampleCount += 1
        const partialMsg = request.messages.find(
          (m) =>
            m.role === 'user' &&
            typeof m.content === 'string' &&
            m.content.includes(EDIT_PARTIAL_BATCH_NUDGE_MARKER),
        )
        if (partialMsg && typeof partialMsg.content === 'string') {
          sawPartialNudge = true
          if (partialMsg.content.includes('package.json')) sawPackageJsonHint = true
        }

        if (sampleCount === 1) {
          return {
            content: '',
            toolCalls: [
              {
                id: 'tc-scaffold-partial',
                type: 'function',
                function: {
                  name: 'propose_file_edits',
                  arguments: JSON.stringify({
                    version: AGENT_TOOL_PROTOCOL_VERSION,
                    operations: [
                      { op: 'write_file', path: join(root, 'package.json'), content: badPackageJson },
                      { op: 'write_file', path: join(root, 'index.html'), content: indexHtml },
                    ],
                  }),
                },
              },
            ],
          }
        }
        return { content: '', toolCalls: [] }
      },
      async streamFinalAnswer(request, _signal, emitChunk) {
        const hasHonesty = request.messages.some(
          (m) =>
            m.role === 'system' &&
            typeof m.content === 'string' &&
            m.content.includes(PARTIAL_BATCH_PROPOSAL_HONESTY_MARKER),
        )
        if (sawPartialNudge) expect(hasHonesty).toBe(true)
        emitChunk('Partial scaffold — package.json needs fix.')
      },
    }

    const { win, payloads } = createEventSink()
    setAgentChatTargetWindow(win)
    restores.push(setAgentChatModelTransportForTesting(transport))
    restores.push(
      setGetCurrentProjectForTesting(() => ({
        projectId,
        manifest: manifestForRoot(root),
      })),
    )

    const streamId = 'eval-scaffold-partial-127'
    primeActiveAgentTurn(streamId)
    await runAgentTurnJobForEvaluation({
      ...basePayload(streamId, buildApprovedPlanExecuteUserText(planId, 'Vite todo app bootstrap')),
      isApprovedPlanAutoRun: true,
      approvedPlanId: planId,
      modelIntent: 'execution',
    })

    expect(sawPartialNudge).toBe(true)
    expect(sawPackageJsonHint).toBe(true)
    const proposal = payloads.find((p) => p.phase === 'edit_proposal')
    if (proposal?.phase === 'edit_proposal') {
      expect(proposal.proposal.rejected.some((r) => r.path?.endsWith('package.json'))).toBe(true)
      expect(proposal.proposal.rejected[0]?.reason).toMatch(/npm create|npm init|valid JSON/i)
      expect(proposal.proposal.batch.operations.some((op) => op.path.endsWith('index.html'))).toBe(true)
    }
    expect(payloads.some((p) => p.phase === 'done')).toBe(true)
  })

  it(`${AGENT_EVAL_TAG_VALIDATION_PACKAGE_JSON} — rejects invalid new package.json with actionable reason`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-eval-pkg-json-127-'))
    const projectId = 'eval-pkg-json-127'
    const { planId } = seedApprovedPlanArtifact(projectId, {
      plan: {
        schemaVersion: 1,
        summary: 'Add package.json',
        filesLikelyTouched: ['package.json'],
        risksUnknowns: [],
        steps: [{ id: '1', title: 'Create package.json' }],
        verification: 'npm install',
      },
    })

    const transport: AgentChatModelTransport = {
      async sampleChatCompletion() {
        return {
          content: '',
          toolCalls: [
            {
              id: 'tc-bad-pkg',
              type: 'function',
              function: {
                name: 'propose_file_edits',
                arguments: JSON.stringify({
                  version: AGENT_TOOL_PROTOCOL_VERSION,
                  operations: [
                    {
                      op: 'write_file',
                      path: join(root, 'package.json'),
                      content: '{name: broken',
                    },
                  ],
                }),
              },
            },
          ],
        }
      },
      async streamFinalAnswer(_request, _signal, emitChunk) {
        emitChunk('package.json rejected.')
      },
    }

    const { win, payloads } = createEventSink()
    setAgentChatTargetWindow(win)
    restores.push(setAgentChatModelTransportForTesting(transport))
    restores.push(
      setGetCurrentProjectForTesting(() => ({
        projectId,
        manifest: manifestForRoot(root),
      })),
    )

    const streamId = 'eval-pkg-json-127'
    primeActiveAgentTurn(streamId)
    await runAgentTurnJobForEvaluation({
      ...basePayload(streamId, buildApprovedPlanExecuteUserText(planId, 'Add package.json')),
      isApprovedPlanAutoRun: true,
      approvedPlanId: planId,
      modelIntent: 'execution',
    })

    const proposal = payloads.find((p) => p.phase === 'edit_proposal')
    if (proposal?.phase === 'edit_proposal') {
      expect(proposal.proposal.rejected.length).toBe(1)
      expect(proposal.proposal.rejected[0]?.reason).toContain(
        AGENT_EDIT_INVALID_JSON_MANIFEST_REASON.slice(0, 20),
      )
    }
    expect(payloads.some((p) => p.phase === 'done')).toBe(true)
  })

  it(`${AGENT_EVAL_TAG_BEHAVIOR_SCAFFOLD_CLI_ONLY_FIRST} — Vite plan includes strategy routing and accepts CLI-only first sample`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-eval-cli-only-128-'))
    const projectId = 'eval-cli-only-128'
    const { planId } = seedApprovedPlanArtifact(projectId, {
      plan: {
        schemaVersion: 1,
        summary: 'Vite React TypeScript app',
        filesLikelyTouched: ['package.json', 'src/main.tsx'],
        risksUnknowns: [],
        steps: [{ id: '1', title: 'npm create vite@latest . -- --template react-ts' }],
        verification: 'npm install',
      },
    })

    let systemPrompt = ''
    const transport: AgentChatModelTransport = {
      async sampleChatCompletion(request) {
        const first = request.messages[0]
        systemPrompt = first && typeof first.content === 'string' ? first.content : ''
        return {
          content: '',
          toolCalls: [
            {
              id: 'tc-cli',
              type: 'function',
              function: {
                name: 'run_command',
                arguments: JSON.stringify({
                  rootId: 'root',
                  command: 'npm create vite@latest . -- --template react-ts',
                  purpose: 'Scaffold Vite React TS project per approved plan',
                }),
              },
            },
          ],
        }
      },
      async streamFinalAnswer(_request, _signal, emitChunk) {
        emitChunk('Awaiting CLI scaffold approval.')
      },
    }

    const { win, payloads } = createEventSink()
    setAgentChatTargetWindow(win)
    restores.push(setAgentChatModelTransportForTesting(transport))
    restores.push(setCommandApprovalAutoResponderForTesting(() => false))
    restores.push(
      setGetCurrentProjectForTesting(() => ({
        projectId,
        manifest: manifestForRoot(root),
      })),
    )

    const streamId = 'eval-cli-only-128'
    primeActiveAgentTurn(streamId)
    await runAgentTurnJobForEvaluation({
      ...basePayload(streamId, buildApprovedPlanExecuteUserText(planId, 'Vite React TypeScript app')),
      isApprovedPlanAutoRun: true,
      approvedPlanId: planId,
      modelIntent: 'execution',
    })

    expect(systemPrompt).toContain(SCAFFOLD_STRATEGY_ROUTING_MARKER)
    expect(systemPrompt).toMatch(/cli_scaffold/i)
    expect(payloads.some((p) => p.phase === 'edit_proposal')).toBe(false)
    expect(
      payloads.some(
        (p) => p.phase === 'activity' && p.activity.title === 'Command rejected',
      ),
    ).toBe(true)
    expect(payloads.some((p) => p.phase === 'done')).toBe(true)
  })

  it(`${AGENT_EVAL_TAG_BEHAVIOR_SCAFFOLD_FILE_BOOTSTRAP_STATIC} — static plan accepts file proposals without npm create nudge`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-eval-file-bootstrap-128-'))
    const projectId = 'eval-file-bootstrap-128'
    const { planId } = seedApprovedPlanArtifact(projectId, {
      plan: {
        schemaVersion: 1,
        summary: 'Static vanilla todo page',
        filesLikelyTouched: ['index.html', 'styles.css', 'script.js'],
        risksUnknowns: [],
        steps: [{ id: '1', title: 'Create index.html, styles.css, script.js' }],
        verification: 'Open index.html in browser',
      },
    })

    const html = `<!DOCTYPE html><html lang="en"><head><title>Todo</title></head><body><script src="script.js"></script></body></html>`
    const css = 'body { margin: 0; }\n'
    const js = 'function init() {}\ninit();\n'

    let sawScaffoldNudge = false
    const transport: AgentChatModelTransport = {
      async sampleChatCompletion(request) {
        sawScaffoldNudge = request.messages.some(
          (m) =>
            typeof m.content === 'string' && m.content.includes(SCAFFOLD_STRATEGY_NUDGE_MARKER),
        )
        return {
          content: '',
          toolCalls: [
            {
              id: 'tc-static',
              type: 'function',
              function: {
                name: 'propose_file_edits',
                arguments: JSON.stringify({
                  version: AGENT_TOOL_PROTOCOL_VERSION,
                  operations: [
                    { op: 'write_file', path: join(root, 'index.html'), content: html },
                    { op: 'write_file', path: join(root, 'styles.css'), content: css },
                    { op: 'write_file', path: join(root, 'script.js'), content: js },
                  ],
                }),
              },
            },
          ],
        }
      },
      async streamFinalAnswer(_request, _signal, emitChunk) {
        emitChunk('Static bootstrap ready.')
      },
    }

    const { win, payloads } = createEventSink()
    setAgentChatTargetWindow(win)
    restores.push(setAgentChatModelTransportForTesting(transport))
    restores.push(
      setGetCurrentProjectForTesting(() => ({
        projectId,
        manifest: manifestForRoot(root),
      })),
    )

    const streamId = 'eval-file-bootstrap-128'
    primeActiveAgentTurn(streamId)
    await runAgentTurnJobForEvaluation({
      ...basePayload(streamId, buildApprovedPlanExecuteUserText(planId, 'Static vanilla todo page')),
      isApprovedPlanAutoRun: true,
      approvedPlanId: planId,
      modelIntent: 'execution',
    })

    expect(sawScaffoldNudge).toBe(false)
    expect(
      payloads.some(
        (p) => p.phase === 'activity' && p.activity.title === 'Harness: scaffold strategy conflict',
      ),
    ).toBe(false)
    expect(payloads.some((p) => p.phase === 'edit_proposal')).toBe(true)
    expect(payloads.some((p) => p.phase === 'done')).toBe(true)
  })

  it(`${AGENT_EVAL_TAG_BEHAVIOR_SCAFFOLD_FILE_BOOTSTRAP_NO_FALSE_CONFLICT} — ambiguous user text + static plan + edits only has no conflict activity`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-eval-file-bootstrap-no-conflict-131-'))
    const projectId = 'eval-file-bootstrap-no-conflict-131'
    const { planId } = seedApprovedPlanArtifact(projectId, {
      plan: {
        schemaVersion: 1,
        summary: 'Static vanilla todo page',
        filesLikelyTouched: ['index.html', 'styles.css', 'script.js'],
        risksUnknowns: [],
        steps: [{ id: '1', title: 'Create index.html, styles.css, script.js' }],
        verification: 'Open index.html in browser',
      },
    })

    const html = `<!DOCTYPE html><html lang="en"><head><title>Todo</title></head><body></body></html>`
    let sawScaffoldNudge = false
    const transport: AgentChatModelTransport = {
      async sampleChatCompletion(request) {
        sawScaffoldNudge = request.messages.some(
          (m) =>
            typeof m.content === 'string' && m.content.includes(SCAFFOLD_STRATEGY_NUDGE_MARKER),
        )
        return {
          content: '',
          toolCalls: [
            {
              id: 'tc-static-ambiguous',
              type: 'function',
              function: {
                name: 'propose_file_edits',
                arguments: JSON.stringify({
                  version: AGENT_TOOL_PROTOCOL_VERSION,
                  operations: [
                    { op: 'write_file', path: join(root, 'index.html'), content: html },
                  ],
                }),
              },
            },
          ],
        }
      },
      async streamFinalAnswer(_request, _signal, emitChunk) {
        emitChunk('Static bootstrap ready.')
      },
    }

    const { win, payloads } = createEventSink()
    setAgentChatTargetWindow(win)
    restores.push(setAgentChatModelTransportForTesting(transport))
    restores.push(
      setGetCurrentProjectForTesting(() => ({
        projectId,
        manifest: manifestForRoot(root),
      })),
    )

    const streamId = 'eval-file-bootstrap-no-conflict-131'
    primeActiveAgentTurn(streamId)
    await runAgentTurnJobForEvaluation({
      ...basePayload(
        streamId,
        buildApprovedPlanExecuteUserText(planId, 'Scaffold a static todo page with html/css/js'),
      ),
      isApprovedPlanAutoRun: true,
      approvedPlanId: planId,
      modelIntent: 'execution',
    })

    expect(sawScaffoldNudge).toBe(false)
    expect(
      payloads.some(
        (p) => p.phase === 'activity' && p.activity.title === 'Harness: scaffold strategy conflict',
      ),
    ).toBe(false)
    expect(payloads.some((p) => p.phase === 'done')).toBe(true)
  })

  it(`${AGENT_EVAL_TAG_BEHAVIOR_SCAFFOLD_VERIFY_COMMAND_NOT_HYBRID} — serve command + edits on static plan does not trigger strategy nudge`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-eval-verify-not-hybrid-131-'))
    const projectId = 'eval-verify-not-hybrid-131'
    const { planId } = seedApprovedPlanArtifact(projectId, {
      plan: {
        schemaVersion: 1,
        summary: 'Static vanilla todo page',
        filesLikelyTouched: ['index.html', 'styles.css', 'script.js'],
        risksUnknowns: [],
        steps: [{ id: '1', title: 'Create index.html, styles.css, script.js' }],
        verification: 'Open index.html in browser',
      },
    })

    const html = `<!DOCTYPE html><html lang="en"><head><title>Todo</title></head><body></body></html>`
    let sawScaffoldNudge = false
    const transport: AgentChatModelTransport = {
      async sampleChatCompletion(request) {
        sawScaffoldNudge = request.messages.some(
          (m) =>
            typeof m.content === 'string' && m.content.includes(SCAFFOLD_STRATEGY_NUDGE_MARKER),
        )
        return {
          content: '',
          toolCalls: [
            {
              id: 'tc-serve',
              type: 'function',
              function: {
                name: 'run_command',
                arguments: JSON.stringify({
                  rootId: 'root',
                  command: 'npx serve',
                  purpose: 'Preview static site',
                }),
              },
            },
            {
              id: 'tc-static-edits',
              type: 'function',
              function: {
                name: 'propose_file_edits',
                arguments: JSON.stringify({
                  version: AGENT_TOOL_PROTOCOL_VERSION,
                  operations: [
                    { op: 'write_file', path: join(root, 'index.html'), content: html },
                  ],
                }),
              },
            },
          ],
        }
      },
      async streamFinalAnswer(_request, _signal, emitChunk) {
        emitChunk('Static bootstrap with preview command.')
      },
    }

    const { win, payloads } = createEventSink()
    setAgentChatTargetWindow(win)
    restores.push(setAgentChatModelTransportForTesting(transport))
    restores.push(setCommandApprovalAutoResponderForTesting(() => false))
    restores.push(
      setGetCurrentProjectForTesting(() => ({
        projectId,
        manifest: manifestForRoot(root),
      })),
    )

    const streamId = 'eval-verify-not-hybrid-131'
    primeActiveAgentTurn(streamId)
    await runAgentTurnJobForEvaluation({
      ...basePayload(streamId, buildApprovedPlanExecuteUserText(planId, 'Static vanilla todo page')),
      isApprovedPlanAutoRun: true,
      approvedPlanId: planId,
      modelIntent: 'execution',
    })

    expect(sawScaffoldNudge).toBe(false)
    expect(
      payloads.some(
        (p) => p.phase === 'activity' && p.activity.title === 'Harness: scaffold strategy conflict',
      ),
    ).toBe(false)
    expect(payloads.some((p) => p.phase === 'done')).toBe(true)
  })

  it(`${AGENT_EVAL_TAG_BEHAVIOR_SCAFFOLD_HYBRID_NUDGE} — injects one strategy nudge when CLI and edits sampled together`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-eval-hybrid-128-'))
    const projectId = 'eval-hybrid-128'
    const { planId } = seedApprovedPlanArtifact(projectId, {
      plan: {
        schemaVersion: 1,
        summary: 'Vite React app',
        filesLikelyTouched: ['package.json', 'index.html'],
        risksUnknowns: [],
        steps: [{ id: '1', title: 'npm create vite' }],
        verification: 'npm install',
      },
    })

    let sampleCount = 0
    let nudgeCount = 0
    const transport: AgentChatModelTransport = {
      async sampleChatCompletion(request) {
        sampleCount += 1
        nudgeCount += request.messages.filter(
          (m) =>
            typeof m.content === 'string' && m.content.includes(SCAFFOLD_STRATEGY_NUDGE_MARKER),
        ).length
        if (sampleCount === 1) {
          return {
            content: '',
            toolCalls: [
              {
                id: 'tc-hybrid-cmd',
                type: 'function',
                function: {
                  name: 'run_command',
                  arguments: JSON.stringify({
                    rootId: 'root',
                    command: 'npm create vite@latest .',
                    purpose: 'Scaffold Vite project',
                  }),
                },
              },
              {
                id: 'tc-hybrid-edit',
                type: 'function',
                function: {
                  name: 'propose_file_edits',
                  arguments: JSON.stringify({
                    version: AGENT_TOOL_PROTOCOL_VERSION,
                    operations: [
                      {
                        op: 'write_file',
                        path: join(root, 'package.json'),
                        content: '{"name":"bad"}',
                      },
                    ],
                  }),
                },
              },
            ],
          }
        }
        return { content: '', toolCalls: [] }
      },
      async streamFinalAnswer(request, _signal, emitChunk) {
        const hasHonesty = request.messages.some(
          (m) =>
            typeof m.content === 'string' && m.content.includes(SCAFFOLD_STRATEGY_HONESTY_MARKER),
        )
        expect(hasHonesty).toBe(true)
        emitChunk('Hybrid scaffold conflict — CLI first.')
      },
    }

    const { win, payloads } = createEventSink()
    setAgentChatTargetWindow(win)
    restores.push(setAgentChatModelTransportForTesting(transport))
    restores.push(setCommandApprovalAutoResponderForTesting(() => false))
    restores.push(
      setGetCurrentProjectForTesting(() => ({
        projectId,
        manifest: manifestForRoot(root),
      })),
    )

    const streamId = 'eval-hybrid-128'
    primeActiveAgentTurn(streamId)
    await runAgentTurnJobForEvaluation({
      ...basePayload(streamId, buildApprovedPlanExecuteUserText(planId, 'Vite React app')),
      isApprovedPlanAutoRun: true,
      approvedPlanId: planId,
      modelIntent: 'execution',
    })

    expect(nudgeCount).toBe(1)
    expect(sampleCount).toBeGreaterThanOrEqual(2)
    expect(
      payloads.some(
        (p) =>
          p.phase === 'activity' &&
          p.activity.title.startsWith('Scaffold routing') &&
          p.activity.harnessKind === 'correction',
      ),
    ).toBe(true)
    expect(
      payloads.some(
        (p) =>
          p.phase === 'activity' &&
          p.activity.title === 'Harness: scaffold strategy conflict',
      ),
    ).toBe(false)
    expect(payloads.some((p) => p.phase === 'done')).toBe(true)
  })

  it(`${AGENT_EVAL_TAG_BEHAVIOR_SCAFFOLD_CONFLICT_UNRECOVERED_HONESTY} — strong scaffold honesty when hybrid nudge does not recover`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-eval-hybrid-unrecovered-134-'))
    const projectId = 'eval-hybrid-unrecovered-134'
    const { planId } = seedApprovedPlanArtifact(projectId, {
      plan: {
        schemaVersion: 1,
        summary: 'Vite React app',
        filesLikelyTouched: ['package.json', 'index.html'],
        risksUnknowns: [],
        steps: [{ id: '1', title: 'npm create vite' }],
        verification: 'npm install',
      },
    })

    let sampleCount = 0
    const transport: AgentChatModelTransport = {
      async sampleChatCompletion() {
        sampleCount += 1
        if (sampleCount === 1) {
          return {
            content: '',
            toolCalls: [
              {
                id: 'tc-hybrid-cmd',
                type: 'function',
                function: {
                  name: 'run_command',
                  arguments: JSON.stringify({
                    rootId: 'root',
                    command: 'npm create vite@latest .',
                    purpose: 'Scaffold Vite project',
                  }),
                },
              },
              {
                id: 'tc-hybrid-edit',
                type: 'function',
                function: {
                  name: 'propose_file_edits',
                  arguments: JSON.stringify({
                    version: AGENT_TOOL_PROTOCOL_VERSION,
                    operations: [
                      {
                        op: 'write_file',
                        path: join(root, 'package.json'),
                        content: '{"name":"bad"}',
                      },
                    ],
                  }),
                },
              },
            ],
          }
        }
        return { content: '', toolCalls: [] }
      },
      async streamFinalAnswer(request, _signal, emitChunk) {
        const honesty = request.messages.find(
          (m) =>
            typeof m.content === 'string' && m.content.includes(SCAFFOLD_STRATEGY_HONESTY_MARKER),
        )
        expect(honesty).toBeDefined()
        expect(String(honesty?.content)).toMatch(/scaffold strategy conflict/i)
        emitChunk('Still need CLI scaffold before files are ready.')
      },
    }

    const { win, payloads } = createEventSink()
    setAgentChatTargetWindow(win)
    restores.push(setAgentChatModelTransportForTesting(transport))
    restores.push(setCommandApprovalAutoResponderForTesting(() => false))
    restores.push(
      setGetCurrentProjectForTesting(() => ({
        projectId,
        manifest: manifestForRoot(root),
      })),
    )

    const streamId = 'eval-hybrid-unrecovered-134'
    primeActiveAgentTurn(streamId)
    await runAgentTurnJobForEvaluation({
      ...basePayload(streamId, buildApprovedPlanExecuteUserText(planId, 'Vite React app')),
      isApprovedPlanAutoRun: true,
      approvedPlanId: planId,
      modelIntent: 'execution',
    })

    expect(
      payloads.some(
        (p) =>
          p.phase === 'activity' &&
          p.activity.detail !== 'Corrected on retry' &&
          p.activity.title.startsWith('Scaffold routing'),
      ),
    ).toBe(true)
    expect(payloads.some((p) => p.phase === 'done')).toBe(true)
  })

  it(`${AGENT_EVAL_TAG_BEHAVIOR_SCAFFOLD_CONFLICT_RECOVERED_FINAL_CONTRACT} — soft final honesty after compliant resample and proposal`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-eval-hybrid-recovered-134-'))
    const projectId = 'eval-hybrid-recovered-134'
    const { planId } = seedApprovedPlanArtifact(projectId, {
      plan: {
        ...staticTodoPlanV1,
        verification: 'Open index.html in browser after files are created',
      },
    })
    let sampleCount = 0
    let finalStreamMessages: readonly { role: string; content?: string | null }[] = []
    const transport: AgentChatModelTransport = {
      async sampleChatCompletion() {
        sampleCount += 1
        if (sampleCount === 1) {
          return {
            content: '',
            toolCalls: [
              {
                id: 'tc-cli-on-static',
                type: 'function',
                function: {
                  name: 'run_command',
                  arguments: JSON.stringify({
                    rootId: 'root',
                    command: 'npm create vite@latest .',
                    purpose: 'Scaffold (should not run on static plan)',
                  }),
                },
              },
            ],
          }
        }
        if (sampleCount === 2) {
          return {
            content: '',
            toolCalls: [
              {
                id: 'tc-static-only',
                type: 'function',
                function: {
                  name: 'propose_file_edits',
                  arguments: JSON.stringify({
                    version: AGENT_TOOL_PROTOCOL_VERSION,
                    operations: staticTodoWriteFileOperations(root),
                  }),
                },
              },
            ],
          }
        }
        return { content: '', toolCalls: [] }
      },
      async streamFinalAnswer(request, _signal, emitChunk) {
        finalStreamMessages = request.messages
        emitChunk('Static bootstrap proposal is ready for review.')
      },
    }

    const { win, payloads } = createEventSink()
    setAgentChatTargetWindow(win)
    restores.push(setAgentChatModelTransportForTesting(transport))
    restores.push(setCommandApprovalAutoResponderForTesting(() => false))
    restores.push(
      setGetCurrentProjectForTesting(() => ({
        projectId,
        manifest: manifestForRoot(root),
      })),
    )

    const streamId = 'eval-hybrid-recovered-134'
    primeActiveAgentTurn(streamId)
    await runAgentTurnJobForEvaluation({
      ...basePayload(streamId, buildApprovedPlanExecuteUserText(planId, 'Static todo page')),
      isApprovedPlanAutoRun: true,
      approvedPlanId: planId,
      modelIntent: 'execution',
    })

    expect(payloads.some((p) => p.phase === 'edit_proposal')).toBe(true)
    expect(
      payloads.some(
        (p) =>
          p.phase === 'activity' &&
          p.activity.detail === 'Corrected on retry' &&
          p.activity.title.startsWith('Scaffold routing'),
      ),
    ).toBe(true)
    expect(payloads.some((p) => p.phase === 'done')).toBe(true)
    const honesty = finalStreamMessages.find(
      (m) =>
        typeof m.content === 'string' && m.content.includes(SCAFFOLD_STRATEGY_HONESTY_MARKER),
    )
    expect(honesty).toBeDefined()
    expect(String(honesty?.content)).not.toMatch(/CLI scaffold is not complete/i)
    expect(String(honesty?.content)).not.toMatch(
      /detected a \*\*scaffold strategy conflict\*\*/i,
    )
  })

  it('forces final answer after post-escalation rounds without hanging on more search_replace', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-eval-sr-stall-'))
    const file = join(root, 'overview.md')
    const original = '# Overview\n\n## Tech\n- old\n'
    writeFileSync(file, original, 'utf8')
    const hash = computeAgentContentHash(original)

    let sampleCount = 0
    const transport: AgentChatModelTransport = {
      async sampleChatCompletion(request) {
        sampleCount += 1
        const hasEscalation = request.messages.some(
          (m) =>
            m.role === 'user' &&
            typeof m.content === 'string' &&
            m.content.includes(EDIT_SEARCH_REPLACE_ESCALATION_MARKER),
        )
        if (sampleCount === 1) {
          return {
            content: '',
            toolCalls: [
              {
                id: 'tc-read',
                type: 'function',
                function: { name: 'read_file', arguments: JSON.stringify({ path: file }) },
              },
            ],
          }
        }
        if (sampleCount <= 5) {
          return {
            content: '',
            toolCalls: [
              {
                id: `tc-sr-${sampleCount}`,
                type: 'function',
                function: {
                  name: 'search_replace',
                  arguments: JSON.stringify({
                    path: file,
                    old_string: 'MISSING',
                    new_string: 'new\n',
                    expectedContentHash: hash,
                  }),
                },
              },
            ],
          }
        }
        expect(hasEscalation).toBe(true)
        throw new Error('should not sample again after forced final')
      },
      async streamFinalAnswer(_request, _signal, emitChunk) {
        emitChunk('Edit tools failed; please retry with propose_file_edits.')
      },
    }

    const { win, payloads } = createEventSink()
    setAgentChatTargetWindow(win)
    restores.push(setAgentChatModelTransportForTesting(transport))
    restores.push(
      setGetCurrentProjectForTesting(() => ({
        projectId: 'eval-sr-stall',
        manifest: manifestForRoot(root),
      })),
    )

    const streamId = 'eval-sr-stall'
    primeActiveAgentTurn(streamId)
    await runAgentTurnJobForEvaluation(
      basePayload(streamId, 'Update overview.md tech section.'),
    )

    expect(sampleCount).toBeLessThanOrEqual(6)
    expect(
      payloads.some(
        (p) =>
          p.phase === 'activity' &&
          (p.activity.title.includes('Finishing turn') ||
            p.activity.title.includes('Edit attempts paused')),
      ),
    ).toBe(true)
    expect(payloads.some((p) => p.phase === 'done')).toBe(true)
  })

  it('finishes with done after max tool iterations', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-eval-'))
    const marker = join(root, 'loop.txt')
    writeFileSync(marker, 'x\n', 'utf8')

    const { win, payloads } = createEventSink()
    setAgentChatTargetWindow(win)
    restores.push(setAgentChatModelTransportForTesting(transportAlwaysToolRead(marker)))
    restores.push(
      setGetCurrentProjectForTesting(() => ({
        projectId: 'eval-proj-4',
        manifest: manifestForRoot(root),
      })),
    )

    const streamId = 'eval-stream-4'
    primeActiveAgentTurn(streamId)
    await runAgentTurnJobForEvaluation(basePayload(streamId, 'Keep reading'))

    const readDone = payloads.filter(
      (p) => p.phase === 'activity' && p.activity.tool === 'read_file' && p.activity.status === 'done',
    )
    expect(readDone.length).toBe(AGENT_TOOL_MAX_ITERATIONS)
    expect(payloads.some((p) => p.phase === 'final_chunk')).toBe(true)
    expect(payloads.some((p) => p.phase === 'done')).toBe(true)
  })

  it('calls xAI with canonical modelId when renderer hint differs', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-eval-canonical-'))
    writeFileSync(join(root, 'readme.txt'), 'hello\n', 'utf8')

    const modelsUsed: string[] = []
    const transport: AgentChatModelTransport = {
      async sampleChatCompletion(request) {
        modelsUsed.push(request.model)
        return { content: 'ok', toolCalls: [] }
      },
      async streamFinalAnswer(request, _signal, emitChunk) {
        modelsUsed.push(request.model)
        emitChunk('Done.')
      },
    }

    const { win, payloads } = createEventSink()
    setAgentChatTargetWindow(win)
    restores.push(setAgentChatModelTransportForTesting(transport))
    restores.push(
      setGetCurrentProjectForTesting(() => ({
        projectId: 'eval-canonical',
        manifest: manifestForRoot(root),
      })),
    )

    const streamId = 'eval-canonical-model'
    primeActiveAgentTurn(streamId)
    await runAgentTurnJobForEvaluation({
      ...basePayload(streamId, 'Say hi'),
      model: 'wrong-renderer-hint',
    })

    expect(modelsUsed.every((m) => m === 'grok-build-0.1')).toBe(true)
    const turnStarted = payloads.find((p) => p.phase === 'turn_started')
    expect(turnStarted?.phase).toBe('turn_started')
    if (turnStarted?.phase === 'turn_started') {
      expect(turnStarted.routing.modelId).toBe('grok-build-0.1')
    }
  })

  it('routes approve-and-run to execution model and executor profile', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-eval-autorun-'))
    writeFileSync(join(root, 'a.txt'), 'a\n', 'utf8')

    const modelsUsed: string[] = []
    const transport: AgentChatModelTransport = {
      async sampleChatCompletion(request) {
        modelsUsed.push(request.model)
        return { content: 'ok', toolCalls: [] }
      },
      async streamFinalAnswer(request, _signal, emitChunk) {
        modelsUsed.push(request.model)
        emitChunk('Executed.')
      },
    }

    const { win, payloads } = createEventSink()
    setAgentChatTargetWindow(win)
    restores.push(setAgentChatModelTransportForTesting(transport))
    restores.push(
      setGetCurrentProjectForTesting(() => ({
        projectId: 'eval-autorun',
        manifest: manifestForRoot(root),
      })),
    )

    const streamId = 'eval-autorun'
    primeActiveAgentTurn(streamId)
    await runAgentTurnJobForEvaluation({
      ...basePayload(streamId, 'Execute the approved plan.'),
      isApprovedPlanAutoRun: true,
      modelIntent: 'execution',
    })

    const turnStarted = payloads.find((p) => p.phase === 'turn_started')
    expect(turnStarted?.phase).toBe('turn_started')
    if (turnStarted?.phase === 'turn_started') {
      expect(turnStarted.routing.modelIntent).toBe('execution')
      expect(turnStarted.routing.modelId).toBe('grok-build-0.1')
      expect(turnStarted.routing.agentProfileId).toBe('executor')
    }
    expect(modelsUsed.every((m) => m === 'grok-build-0.1')).toBe(true)
  })

  it('injects compact approved plan artifact summary when approvedPlanId is set (109)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-eval-plan-art-'))
    const projectId = 'eval-plan-artifact-109'
    const planId = randomUUID()
    const artifact: StoredPlanArtifact = {
      schemaVersion: 1,
      planId,
      threadMessageId: 'plan-msg-eval',
      createdAt: new Date().toISOString(),
      status: 'approved',
      approvedAt: new Date().toISOString(),
      plan: {
        schemaVersion: 1,
        summary: 'Compact summary for eval needle',
        filesLikelyTouched: ['src/a.ts'],
        risksUnknowns: [],
        steps: Array.from({ length: 12 }, (_, i) => ({
          id: `step-${i + 1}`,
          title: `Step ${i + 1} with a longer title to inflate JSON`,
        })),
        verification: 'npm test',
      },
    }
    const planFile = planJsonPath(projectId, planId)
    mkdirSync(dirname(planFile), { recursive: true })
    writeFileSync(planFile, JSON.stringify(artifact, null, 2), 'utf8')

    const { transport, getSystemPrompt } = transportCaptureSystemThenAnswer('Executed.')
    const { win, payloads } = createEventSink()
    setAgentChatTargetWindow(win)
    restores.push(setAgentChatModelTransportForTesting(transport))
    restores.push(
      setGetCurrentProjectForTesting(() => ({
        projectId,
        manifest: manifestForRoot(root),
      })),
    )

    const streamId = 'eval-plan-artifact-109'
    primeActiveAgentTurn(streamId)
    const userText = buildApprovedPlanExecuteUserText(planId, artifact.plan.summary)
    await runAgentTurnJobForEvaluation({
      ...basePayload(streamId, userText),
      isApprovedPlanAutoRun: true,
      approvedPlanId: planId,
      approvedPlanMessageId: 'plan-msg-eval',
      modelIntent: 'execution',
    })

    const system = getSystemPrompt()
    expect(system).toContain(planId)
    expect(system).toMatch(/Approved plan artifact/i)
    expect(system).toContain('Compact summary for eval needle')
    expect(system).not.toContain('Step 12 with a longer title')
    expect(payloads.some((p) => p.phase === 'done')).toBe(true)
  })

  it('injects turn recovery hint after interrupted receipt boundary (110)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-eval-receipt-'))
    const projectId = 'eval-turn-receipt-110'
    _resetTurnReceiptLifecycleForTesting()
    appendTurnReceipt(projectId, {
      schemaVersion: 1,
      streamId: 'prior-stream',
      status: 'in_progress',
      endedAt: '2026-05-19T10:00:00.000Z',
      modelId: 'grok-build-0.1',
      harnessProfileKey: 'grok_code_fast',
      agentProfileId: 'default',
      toolCallsStarted: 2,
      toolCallsCompleted: 1,
    })

    const { transport, getSystemPrompt } = transportCaptureSystemThenAnswer('Recovered.')
    const { win } = createEventSink()
    setAgentChatTargetWindow(win)
    restores.push(setAgentChatModelTransportForTesting(transport))
    restores.push(
      setGetCurrentProjectForTesting(() => ({
        projectId,
        manifest: manifestForRoot(root),
      })),
    )

    const streamId = 'eval-turn-receipt-110'
    primeActiveAgentTurn(streamId)
    await runAgentTurnJobForEvaluation(basePayload(streamId, 'Continue after crash.'))

    expect(getSystemPrompt()).toContain(TURN_RECOVERY_HINT_MARKER)
    _resetTurnReceiptLifecycleForTesting()
  })

  it('emits cancelled when the turn is aborted', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-eval-'))
    writeFileSync(join(root, 'a.txt'), 'a\n', 'utf8')

    const blockedTransport: AgentChatModelTransport = {
      async sampleChatCompletion(_request, signal) {
        await new Promise<never>((_, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        })
        return { content: '', toolCalls: [] }
      },
      async streamFinalAnswer() {
        /* unreachable for this scenario */
      },
    }

    const { win, payloads } = createEventSink()
    setAgentChatTargetWindow(win)
    restores.push(setAgentChatModelTransportForTesting(blockedTransport))
    restores.push(
      setGetCurrentProjectForTesting(() => ({
        projectId: 'eval-proj-5',
        manifest: manifestForRoot(root),
      })),
    )

    const streamId = 'eval-stream-5'
    const ac = primeActiveAgentTurn(streamId)
    const job = runAgentTurnJobForEvaluation(basePayload(streamId, 'Wait'))

    await new Promise<void>((resolve) => setImmediate(resolve))
    ac.abort('gf:agent-user-cancel')
    await job

    expect(payloads.some((p) => p.phase === 'cancelled')).toBe(true)
  })

  describe('harness matrix (108)', () => {
    const matrixRestores: Array<() => void> = []

    afterEach(() => {
      while (matrixRestores.length) matrixRestores.pop()?.()
    })

    function transportNoToolsFinal(finalText: string) {
      return {
        async sampleChatCompletion() {
          return { content: '', toolCalls: [] }
        },
        async streamFinalAnswer(_request: unknown, _signal: unknown, emitChunk: (d: string) => void) {
          emitChunk(finalText)
        },
      }
    }

    it(`${AGENT_EVAL_TAG_PROFILE_GROK_CODE_FAST} — fast chat uses grok-build-0.1 harness copy`, async () => {
      const root = mkdtempSync(join(tmpdir(), 'gf-eval-matrix-fast-'))
      writeFileSync(join(root, 'a.txt'), 'a\n', 'utf8')

      const { payloads, getRecords, restore } = await setupEvalTurn({
        root,
        projectId: 'eval-matrix-fast',
        innerTransport: transportNoToolsFinal('Done.'),
        payload: baseEvalPayload('eval-matrix-fast', 'Fix a.txt'),
      })
      matrixRestores.push(restore)

      const samples = getRecords().filter((r) => r.phase === 'sample')
      expect(samples.length).toBeGreaterThan(0)
      expect(samples[0]?.model).toBe('grok-build-0.1')
      expect(samples[0]?.systemText).toMatch(/Harness profile \(fast execution\)/i)
      expect(samples[0]?.reasoningEffort).toBeUndefined()

      const turnStarted = payloads.find((p) => p.phase === 'turn_started')
      if (turnStarted?.phase === 'turn_started') {
        expect(turnStarted.routing.harnessProfileKey).toBe('grok_code_fast')
        expect(turnStarted.routing.modelId).toBe('grok-build-0.1')
      }
    })

    it(`${AGENT_EVAL_TAG_PROFILE_GROK_4_3} — plan mode uses grok-4.3 capable planning harness`, async () => {
      const root = mkdtempSync(join(tmpdir(), 'gf-eval-matrix-plan-'))
      writeFileSync(join(root, 'readme.txt'), 'hello\n', 'utf8')

      const payload = baseEvalPayload('eval-matrix-plan', 'Plan a small feature')
      payload.activeContext.chatMode = 'plan'

      const { payloads, getRecords, restore } = await setupEvalTurn({
        root,
        projectId: 'eval-matrix-plan',
        innerTransport: transportNoToolsFinal('Plan ready.'),
        payload,
      })
      matrixRestores.push(restore)

      const samples = getRecords().filter((r) => r.phase === 'sample')
      expect(samples[0]?.model).toBe('grok-4.3')
      expect(samples[0]?.systemText).toMatch(/capable planning/i)

      const turnStarted = payloads.find((p) => p.phase === 'turn_started')
      if (turnStarted?.phase === 'turn_started') {
        expect(turnStarted.routing.harnessProfileKey).toBe('grok_4_3')
        expect(turnStarted.routing.modelIntent).toBe('planning')
        expect(turnStarted.routing.agentProfileId).toBe('planner')
        expect(turnStarted.routing.reasoningEffort).toBe('medium')
      }

      expect(samples[0]?.reasoningEffort).toBe('medium')
    })

    it(`${AGENT_EVAL_TAG_AGENT_PLANNER} — plan mode tool defs exclude edit and command tools`, async () => {
      const root = mkdtempSync(join(tmpdir(), 'gf-eval-matrix-planner-tools-'))
      writeFileSync(join(root, 'x.txt'), 'x\n', 'utf8')

      const payload = baseEvalPayload('eval-matrix-planner-tools', 'Plan only')
      payload.activeContext.chatMode = 'plan'

      const { getRecords, restore } = await setupEvalTurn({
        root,
        projectId: 'eval-matrix-planner',
        innerTransport: transportNoToolsFinal('Plan.'),
        payload,
      })
      matrixRestores.push(restore)

      for (const record of getRecords().filter((r) => r.phase === 'sample')) {
        expect(record.toolNames).not.toContain('propose_file_edits')
        expect(record.toolNames).not.toContain('search_replace')
        expect(record.toolNames).not.toContain('run_command')
        expect(record.toolNames).toContain('read_file')
      }
    })

    it(`${AGENT_EVAL_TAG_AGENT_EXECUTOR} — approve-and-run exposes edit tools to provider`, async () => {
      const root = mkdtempSync(join(tmpdir(), 'gf-eval-matrix-executor-'))
      writeFileSync(join(root, 'a.txt'), 'a\n', 'utf8')

      const { getRecords, restore } = await setupEvalTurn({
        root,
        projectId: 'eval-matrix-executor',
        innerTransport: transportNoToolsFinal('Executed.'),
        payload: {
          ...baseEvalPayload('eval-matrix-executor', 'Run the approved plan.'),
          isApprovedPlanAutoRun: true,
          modelIntent: 'execution',
        },
      })
      matrixRestores.push(restore)

      const withTools = getRecords().filter((r) => r.toolNames.length > 0)
      expect(withTools.length).toBeGreaterThan(0)
      expect(withTools.some((r) => r.toolNames.includes('propose_file_edits'))).toBe(true)
      expect(withTools.some((r) => r.toolNames.includes('search_replace'))).toBe(true)
      expect(withTools.some((r) => r.toolNames.includes('run_command'))).toBe(true)
    })

    it(`${AGENT_EVAL_TAG_CONTRACT_PLAN} — final stream includes gf-plan contract`, async () => {
      const root = mkdtempSync(join(tmpdir(), 'gf-eval-matrix-contract-'))
      writeFileSync(join(root, 'a.txt'), 'a\n', 'utf8')

      const payload = baseEvalPayload('eval-matrix-contract', 'Build a dashboard')
      payload.activeContext.chatMode = 'plan'

      const { getRecords, restore } = await setupEvalTurn({
        root,
        projectId: 'eval-matrix-contract',
        innerTransport: transportNoToolsFinal('```gf-plan\n{}\n```'),
        payload,
      })
      matrixRestores.push(restore)

      const finals = getRecords().filter((r) => r.phase === 'final')
      expect(finals.length).toBeGreaterThan(0)
      const lastFinal = finals[finals.length - 1]
      expect(lastFinal?.systemText).toMatch(/Final response contract \(Plan mode\)/i)
      expect(lastFinal?.systemText).toContain(GF_PLAN_FENCE)
    })

    it(`${AGENT_EVAL_TAG_BEHAVIOR_PROACTIVE} — plan mode runs search_workspace for feature-named request`, async () => {
      const root = mkdtempSync(join(tmpdir(), 'gf-eval-matrix-proactive-'))
      mkdirSync(join(root, 'src', 'admin'), { recursive: true })
      writeFileSync(join(root, 'src', 'admin', 'page.tsx'), 'export function AdminPage() {}\n', 'utf8')

      const payload = baseEvalPayload('eval-matrix-proactive', 'Build the admin page layout')
      payload.activeContext.chatMode = 'plan'

      const { payloads, restore } = await setupEvalTurn({
        root,
        projectId: 'eval-matrix-proactive',
        innerTransport: transportSearchThenAnswer('admin', 'Plan with admin paths.'),
        payload,
      })
      matrixRestores.push(restore)

      const searchDone = payloads.some(
        (p) => p.phase === 'activity' && p.activity.tool === 'search_workspace' && p.activity.status === 'done',
      )
      expect(searchDone).toBe(true)
      const finalIdx = payloads.findIndex((p) => p.phase === 'final_chunk')
      const searchIdx = payloads.findIndex(
        (p) => p.phase === 'activity' && p.activity.tool === 'search_workspace',
      )
      expect(searchIdx).toBeGreaterThanOrEqual(0)
      expect(finalIdx).toBeGreaterThan(searchIdx)
    })

    it('profile diff — same user text differs by chatMode routing and system prompt', async () => {
      const root = mkdtempSync(join(tmpdir(), 'gf-eval-matrix-diff-'))
      writeFileSync(join(root, 'a.txt'), 'a\n', 'utf8')
      const userText = 'Add logging to the app'

      const fast = await setupEvalTurn({
        root,
        projectId: 'eval-matrix-diff',
        innerTransport: transportNoToolsFinal('Fast.'),
        payload: baseEvalPayload('eval-diff-fast', userText),
      })
      matrixRestores.push(fast.restore)

      const planPayload = baseEvalPayload('eval-diff-plan', userText)
      planPayload.activeContext.chatMode = 'plan'
      const plan = await setupEvalTurn({
        root,
        projectId: 'eval-matrix-diff',
        innerTransport: transportNoToolsFinal('Plan.'),
        payload: planPayload,
      })
      matrixRestores.push(plan.restore)

      const fastSample = fast.getRecords().find((r) => r.phase === 'sample')
      const planSample = plan.getRecords().find((r) => r.phase === 'sample')
      expect(fastSample?.model).toBe('grok-build-0.1')
      expect(planSample?.model).toBe('grok-4.3')
      expect(fastSample?.systemText).not.toBe(planSample?.systemText)
    })

    it(`${AGENT_EVAL_TAG_ROUTING_POST_PLAN} — incremental Work follow-up routes to executor`, async () => {
      const root = mkdtempSync(join(tmpdir(), 'gf-eval-post-plan-120-'))
      writeFileSync(join(root, 'index.html'), '<!DOCTYPE html><html></html>\n', 'utf8')
      const projectId = 'eval-post-plan-120'
      seedApprovedPlanArtifact(projectId)

      const { payloads, getRecords, restore } = await setupEvalTurn({
        root,
        projectId,
        innerTransport: transportNoToolsFinal('Added delete button.'),
        payload: baseEvalPayload('eval-post-plan-inc', 'add delete button'),
      })
      matrixRestores.push(restore)

      const turnStarted = payloads.find((p) => p.phase === 'turn_started')
      expect(turnStarted?.phase).toBe('turn_started')
      if (turnStarted?.phase === 'turn_started') {
        expect(turnStarted.routing.modelIntent).toBe('execution')
        expect(turnStarted.routing.agentProfileId).toBe('executor')
      }

      const sample = getRecords().find((r) => r.phase === 'sample')
      expect(sample?.systemText).toContain(POST_PLAN_INCREMENTAL_MARKER)
      expect(sample?.systemText).toMatch(/Approved plan artifact/i)

      const finals = getRecords().filter((r) => r.phase === 'final')
      const lastFinal = finals[finals.length - 1]
      expect(lastFinal?.systemText).toMatch(/Post-plan incremental/i)
      expect(lastFinal?.systemText).not.toMatch(/Final response contract \(Plan mode\)/i)
    })

    it(`${AGENT_EVAL_TAG_CONTRACT_PLAN} — explicit replan in Plan mode still requires gf-plan`, async () => {
      const root = mkdtempSync(join(tmpdir(), 'gf-eval-replan-120-'))
      writeFileSync(join(root, 'a.txt'), 'a\n', 'utf8')
      const projectId = 'eval-replan-120'
      seedApprovedPlanArtifact(projectId)

      const payload = baseEvalPayload('eval-replan-plan', 'create a new plan for the app')
      payload.activeContext.chatMode = 'plan'

      const { getRecords, restore } = await setupEvalTurn({
        root,
        projectId,
        innerTransport: transportNoToolsFinal('```gf-plan\n{}\n```'),
        payload,
      })
      matrixRestores.push(restore)

      const finals = getRecords().filter((r) => r.phase === 'final')
      const lastFinal = finals[finals.length - 1]
      expect(lastFinal?.systemText).toMatch(/Final response contract \(Plan mode\)/i)
      expect(lastFinal?.systemText).toContain(GF_PLAN_FENCE)
    })

    it(`${AGENT_EVAL_TAG_BEHAVIOR_SINGLE_FILE} — single-file index injects edit bias marker`, async () => {
      const root = mkdtempSync(join(tmpdir(), 'gf-eval-single-file-120-'))
      writeFileSync(join(root, 'index.html'), '<!DOCTYPE html><html></html>\n', 'utf8')
      const projectId = 'eval-single-file-120'
      seedApprovedPlanArtifact(projectId)
      seedSingleFileWorkspaceIndex(projectId, root)

      const { getRecords, restore } = await setupEvalTurn({
        root,
        projectId,
        innerTransport: transportNoToolsFinal('Updated styling.'),
        payload: baseEvalPayload('eval-single-file', 'add dark mode styling'),
      })
      matrixRestores.push(restore)

      const sample = getRecords().find((r) => r.phase === 'sample')
      expect(sample?.systemText).toContain(SINGLE_FILE_EDIT_BIAS_MARKER)
      expect(sample?.systemText).toContain('index.html')
    })

    it(`${AGENT_EVAL_TAG_ROUTING_EXISTING_PROJECT_NO_REPLAN} — populated repo incremental edit routes executor without gf-plan`, async () => {
      const root = mkdtempSync(join(tmpdir(), 'gf-eval-existing-no-replan-127-'))
      mkdirSync(join(root, 'src'), { recursive: true })
      writeFileSync(join(root, 'src', 'app.ts'), 'export const todos: string[] = [];\n', 'utf8')
      writeFileSync(join(root, 'package.json'), '{"name":"eval-app"}\n', 'utf8')
      const projectId = 'eval-existing-no-replan-127'
      seedPopulatedWorkspaceIndex(projectId, root)

      const { payloads, getRecords, restore } = await setupEvalTurn({
        root,
        projectId,
        innerTransport: transportNoToolsFinal('Added localStorage persistence.'),
        payload: {
          ...baseEvalPayload('eval-existing-no-replan', 'add localStorage persistence for todos'),
          modelIntent: 'chat_default',
        },
      })
      matrixRestores.push(restore)

      const turnStarted = payloads.find((p) => p.phase === 'turn_started')
      expect(turnStarted?.phase).toBe('turn_started')
      if (turnStarted?.phase === 'turn_started') {
        expect(turnStarted.routing.agentProfileId).toBe('executor')
        expect(turnStarted.routing.modelIntent).toBe('execution')
      }

      const sample = getRecords().find((r) => r.phase === 'sample')
      expect(sample?.systemText).toContain(WORK_ITERATIVE_EDIT_MARKER)
      expect(sample?.systemText).toContain(POPULATED_WORK_EDIT_MARKER)
      expect(sample?.systemText).not.toContain(GREENFIELD_HARNESS_MARKER)

      const finals = getRecords().filter((r) => r.phase === 'final')
      const lastFinal = finals[finals.length - 1]
      expect(lastFinal?.systemText).toMatch(/Incremental Work edit/i)
      expect(lastFinal?.systemText).not.toMatch(/Final response contract \(Plan mode\)/i)
      expect(lastFinal?.systemText).not.toMatch(/exactly one.*```gf-plan/i)
    })

    it(`${AGENT_EVAL_TAG_ROUTING_ITERATIVE_WORK_NO_REPLAN} — small vanilla repo routes executor with harness 130`, async () => {
      const root = mkdtempSync(join(tmpdir(), 'gf-eval-iterative-vanilla-130-'))
      writeFileSync(join(root, 'index.html'), '<!DOCTYPE html><html></html>\n', 'utf8')
      writeFileSync(join(root, 'script.js'), 'console.log("app");\n', 'utf8')
      const projectId = 'eval-iterative-vanilla-130'
      seedSmallVanillaWorkspaceIndex(projectId, root)

      const { payloads, getRecords, restore } = await setupEvalTurn({
        root,
        projectId,
        innerTransport: transportNoToolsFinal('Added dark mode toggle.'),
        payload: {
          ...baseEvalPayload('eval-iterative-vanilla', 'add a dark mode toggle to the page'),
          modelIntent: 'chat_default',
        },
      })
      matrixRestores.push(restore)

      const turnStarted = payloads.find((p) => p.phase === 'turn_started')
      expect(turnStarted?.phase).toBe('turn_started')
      if (turnStarted?.phase === 'turn_started') {
        expect(turnStarted.routing.agentProfileId).toBe('executor')
        expect(turnStarted.routing.modelIntent).toBe('execution')
      }

      const sample = getRecords().find((r) => r.phase === 'sample')
      expect(sample?.systemText).toContain(WORK_ITERATIVE_EDIT_MARKER)
      expect(sample?.systemText).not.toContain(GREENFIELD_HARNESS_MARKER)

      const finals = getRecords().filter((r) => r.phase === 'final')
      const lastFinal = finals[finals.length - 1]
      expect(lastFinal?.systemText).toMatch(/Incremental Work edit/i)
      expect(lastFinal?.systemText).not.toMatch(/exactly one.*```gf-plan/i)
    })

    it(`${AGENT_EVAL_TAG_ROUTING_EXISTING_PROJECT_NO_SCAFFOLD_NUDGE} — populated repo incremental edit has no scaffold strategy nudge`, async () => {
      const root = mkdtempSync(join(tmpdir(), 'gf-eval-no-scaffold-nudge-128-'))
      mkdirSync(join(root, 'src'), { recursive: true })
      writeFileSync(join(root, 'src', 'app.ts'), 'export const todos: string[] = [];\n', 'utf8')
      writeFileSync(join(root, 'package.json'), '{"name":"eval-app"}\n', 'utf8')
      const projectId = 'eval-no-scaffold-nudge-128'
      seedPopulatedWorkspaceIndex(projectId, root)

      const innerTransport = {
        async sampleChatCompletion() {
          return {
            content: '',
            toolCalls: [
              {
                id: 'tc-css',
                type: 'function',
                function: {
                  name: 'propose_file_edits',
                  arguments: JSON.stringify({
                    version: AGENT_TOOL_PROTOCOL_VERSION,
                    operations: [
                      {
                        op: 'write_file',
                        path: join(root, 'src', 'styles.css'),
                        content: 'body { padding: 1rem; }\n',
                      },
                    ],
                  }),
                },
              },
            ],
          }
        },
        async streamFinalAnswer(_request: unknown, _signal: unknown, emitChunk: (delta: string) => void) {
          emitChunk('Added CSS.')
        },
      }

      let sawScaffoldNudge = false
      const wrappedTransport: AgentChatModelTransport = {
        async sampleChatCompletion(request) {
          sawScaffoldNudge = request.messages.some(
            (m) =>
              typeof m.content === 'string' && m.content.includes(SCAFFOLD_STRATEGY_NUDGE_MARKER),
          )
          return innerTransport.sampleChatCompletion()
        },
        async streamFinalAnswer(request, signal, emitChunk) {
          return innerTransport.streamFinalAnswer(request, signal, emitChunk)
        },
      }

      const { restore } = await setupEvalTurn({
        root,
        projectId,
        innerTransport: wrappedTransport,
        payload: baseEvalPayload('eval-no-scaffold-nudge', 'add CSS styling'),
      })
      matrixRestores.push(restore)

      expect(sawScaffoldNudge).toBe(false)
    })

    it(`${AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_WORK_SR_CONSOLIDATION_NUDGE} — 2× search_replace same path injects thrash nudge once`, async () => {
      const root = mkdtempSync(join(tmpdir(), 'gf-eval-iterative-sr-thrash-135-'))
      const scriptPath = join(root, 'script.js')
      const original = staticTodoValidFiles().js
      writeFileSync(scriptPath, original, 'utf8')
      writeFileSync(join(root, 'index.html'), staticTodoValidFiles().html, 'utf8')
      const projectId = 'eval-iterative-sr-thrash-135'
      seedSmallVanillaWorkspaceIndex(projectId, root)
      const hash = computeAgentContentHash(original)

      let sampleCount = 0
      let thrashNudgeCount = 0
      const transport: AgentChatModelTransport = {
        async sampleChatCompletion(request) {
          sampleCount += 1
          const thrashMessages = request.messages.filter(
            (m) =>
              m.role === 'user' &&
              typeof m.content === 'string' &&
              m.content.includes(INCREMENTAL_EDIT_MID_TURN_NUDGE_MARKER),
          )
          thrashNudgeCount += thrashMessages.length

          if (sampleCount === 1) {
            return {
              content: '',
              toolCalls: [
                {
                  id: 'tc-read',
                  type: 'function',
                  function: {
                    name: 'read_file',
                    arguments: JSON.stringify({ path: scriptPath }),
                  },
                },
              ],
            }
          }
          if (sampleCount === 2) {
            return {
              content: '',
              toolCalls: [
                {
                  id: 'tc-sr-1',
                  type: 'function',
                  function: {
                    name: 'search_replace',
                    arguments: JSON.stringify({
                      path: scriptPath,
                      old_string: 'NOT_ON_DISK',
                      new_string: 'const x = 1;\n',
                      expectedContentHash: hash,
                    }),
                  },
                },
                {
                  id: 'tc-sr-2',
                  type: 'function',
                  function: {
                    name: 'search_replace',
                    arguments: JSON.stringify({
                      path: scriptPath,
                      old_string: 'ALSO_NOT_ON_DISK',
                      new_string: 'const y = 2;\n',
                      expectedContentHash: hash,
                    }),
                  },
                },
              ],
            }
          }
          if (sampleCount === 3) {
            expect(thrashNudgeCount).toBeGreaterThanOrEqual(1)
            return { content: '', toolCalls: [] }
          }
          return { content: '', toolCalls: [] }
        },
        async streamFinalAnswer(_request, _signal, emitChunk) {
          emitChunk('Consolidate edits into one proposal.')
        },
      }

      const { restore } = await setupEvalTurn({
        root,
        projectId,
        innerTransport: transport,
        payload: baseEvalPayload('eval-iterative-sr-thrash', 'add localStorage persistence for todos'),
      })
      matrixRestores.push(restore)

      expect(thrashNudgeCount).toBe(1)
      const trace = vi.mocked(writeAgentTurnTrace).mock.calls.at(-1)?.[1] as AgentTurnTraceV1
      expect(trace.harnessMetrics?.nudgesIssued).toContain('iterative_commit_proposal')
    })

    it(`${AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_WORK_STOP_AFTER_PROPOSAL} — stops tool_sample after edit proposal`, async () => {
      const root = mkdtempSync(join(tmpdir(), 'gf-eval-iterative-stop-proposal-135-'))
      const scriptPath = join(root, 'script.js')
      const original = staticTodoValidFiles().js
      writeFileSync(scriptPath, original, 'utf8')
      writeFileSync(join(root, 'index.html'), staticTodoValidFiles().html, 'utf8')
      const projectId = 'eval-iterative-stop-proposal-135'
      seedSmallVanillaWorkspaceIndex(projectId, root)
      const hash = computeAgentContentHash(original)
      const updated = `${original}\nlocalStorage.setItem(STORAGE_KEY, JSON.stringify(todos));\n`

      let sampleCount = 0
      const transport: AgentChatModelTransport = {
        async sampleChatCompletion() {
          sampleCount += 1
          if (sampleCount === 1) {
            return {
              content: '',
              toolCalls: [
                {
                  id: 'tc-read',
                  type: 'function',
                  function: {
                    name: 'read_file',
                    arguments: JSON.stringify({ path: scriptPath }),
                  },
                },
              ],
            }
          }
          if (sampleCount === 2) {
            return {
              content: '',
              toolCalls: [
                {
                  id: 'tc-propose',
                  type: 'function',
                  function: {
                    name: 'propose_file_edits',
                    arguments: JSON.stringify({
                      version: AGENT_TOOL_PROTOCOL_VERSION,
                      operations: [
                        {
                          op: 'write_file',
                          path: scriptPath,
                          content: updated,
                          expectedContentHash: hash,
                        },
                      ],
                    }),
                  },
                },
              ],
            }
          }
          throw new Error('should not sample tools after iterative edit proposal')
        },
        async streamFinalAnswer(_request, _signal, emitChunk) {
          emitChunk('Proposal ready for review.')
        },
      }

      const { getRecords, restore } = await setupEvalTurn({
        root,
        projectId,
        innerTransport: transport,
        payload: baseEvalPayload('eval-iterative-stop-proposal', 'add localStorage persistence'),
      })
      matrixRestores.push(restore)

      expect(sampleCount).toBe(2)
      expect(getRecords().filter((r) => r.phase === 'sample').length).toBe(2)
    })

    it(`${AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_WORK_LOCALSTORAGE_LOW_ROUNDS} — bounded rounds and one edit proposal`, async () => {
      const root = mkdtempSync(join(tmpdir(), 'gf-eval-iterative-localstorage-135-'))
      const scriptPath = join(root, 'script.js')
      const original = staticTodoValidFiles().js
      writeFileSync(scriptPath, original, 'utf8')
      writeFileSync(join(root, 'index.html'), staticTodoValidFiles().html, 'utf8')
      const projectId = 'eval-iterative-localstorage-135'
      seedSmallVanillaWorkspaceIndex(projectId, root)
      const hash = computeAgentContentHash(original)
      const updated = `${original}\nfunction saveTodos() {\n  localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));\n}\n`

      let sampleCount = 0
      const transport: AgentChatModelTransport = {
        async sampleChatCompletion() {
          sampleCount += 1
          if (sampleCount === 1) {
            return {
              content: '',
              toolCalls: [
                {
                  id: 'tc-read',
                  type: 'function',
                  function: {
                    name: 'read_file',
                    arguments: JSON.stringify({ path: scriptPath }),
                  },
                },
              ],
            }
          }
          if (sampleCount === 2) {
            return {
              content: '',
              toolCalls: [
                {
                  id: 'tc-propose',
                  type: 'function',
                  function: {
                    name: 'propose_file_edits',
                    arguments: JSON.stringify({
                      version: AGENT_TOOL_PROTOCOL_VERSION,
                      operations: [
                        {
                          op: 'write_file',
                          path: scriptPath,
                          content: updated,
                          expectedContentHash: hash,
                        },
                      ],
                    }),
                  },
                },
              ],
            }
          }
          return { content: '', toolCalls: [] }
        },
        async streamFinalAnswer(_request, _signal, emitChunk) {
          emitChunk('Added localStorage persistence.')
        },
      }

      const { payloads, getRecords, restore } = await setupEvalTurn({
        root,
        projectId,
        innerTransport: transport,
        payload: baseEvalPayload(
          'eval-iterative-localstorage',
          'add localStorage persistence for todos',
        ),
      })
      matrixRestores.push(restore)

      const samples = getRecords().filter((r) => r.phase === 'sample')
      expect(samples.length).toBeLessThanOrEqual(4)
      const proposals = payloads.filter((p) => p.phase === 'edit_proposal')
      expect(proposals.length).toBe(1)
      expect(payloads.some((p) => p.phase === 'done')).toBe(true)
    })

    it(`${AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_WORK_TRACE_METRICS} — turn trace includes harnessMetrics`, async () => {
      const root = mkdtempSync(join(tmpdir(), 'gf-eval-iterative-trace-metrics-137-'))
      const scriptPath = join(root, 'script.js')
      const original = staticTodoValidFiles().js
      writeFileSync(scriptPath, original, 'utf8')
      writeFileSync(join(root, 'index.html'), staticTodoValidFiles().html, 'utf8')
      const projectId = 'eval-iterative-trace-metrics-137'
      seedSmallVanillaWorkspaceIndex(projectId, root)
      const hash = computeAgentContentHash(original)
      const updated = `${original}\nfunction saveTodos() {\n  localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));\n}\n`

      vi.mocked(writeAgentTurnTrace).mockClear()

      let sampleCount = 0
      const proposeTransport: AgentChatModelTransport = {
        async sampleChatCompletion() {
          sampleCount += 1
          if (sampleCount === 1) {
            return {
              content: '',
              toolCalls: [
                {
                  id: 'tc-read',
                  type: 'function',
                  function: {
                    name: 'read_file',
                    arguments: JSON.stringify({ path: scriptPath }),
                  },
                },
              ],
            }
          }
          if (sampleCount === 2) {
            return {
              content: '',
              toolCalls: [
                {
                  id: 'tc-propose',
                  type: 'function',
                  function: {
                    name: 'propose_file_edits',
                    arguments: JSON.stringify({
                      version: AGENT_TOOL_PROTOCOL_VERSION,
                      operations: [
                        {
                          op: 'write_file',
                          path: scriptPath,
                          content: updated,
                          expectedContentHash: hash,
                        },
                      ],
                    }),
                  },
                },
              ],
            }
          }
          return { content: '', toolCalls: [] }
        },
        async streamFinalAnswer(_request, _signal, emitChunk) {
          emitChunk('Added localStorage persistence.')
        },
      }

      const { restore } = await setupEvalTurn({
        root,
        projectId,
        innerTransport: proposeTransport,
        payload: baseEvalPayload(
          'eval-iterative-trace-metrics',
          'add localStorage persistence for todos',
        ),
      })
      matrixRestores.push(restore)

      expect(writeAgentTurnTrace).toHaveBeenCalled()
      const trace = vi.mocked(writeAgentTurnTrace).mock.calls.at(-1)?.[1] as AgentTurnTraceV1
      expect(trace.harnessMetrics?.iterativeWorkEdit).toBe(true)
      expect(trace.harnessMetrics?.editProposalAtRound).toBeLessThanOrEqual(4)
      expect(trace.harnessMetrics?.toolRoundCount).toBeDefined()
      expect((trace.harnessMetrics?.nudgesIssued?.length ?? 0)).toBeLessThanOrEqual(12)
      expect(trace.harnessMetrics?.stoppedAfterProposal).toBe(true)
    })

    it(`${AGENT_EVAL_TAG_BEHAVIOR_TRACE_SEARCH_REPLACE_FAILURE_METRICS} — trace includes S&R failure metrics after escalation`, async () => {
      const root = mkdtempSync(join(tmpdir(), 'gf-eval-sr-failure-metrics-140-'))
      const scriptPath = join(root, 'script.js')
      const original = staticTodoValidFiles().js
      writeFileSync(scriptPath, original, 'utf8')
      writeFileSync(join(root, 'index.html'), staticTodoValidFiles().html, 'utf8')
      const projectId = 'eval-sr-failure-metrics-140'
      seedSmallVanillaWorkspaceIndex(projectId, root)
      const hash = computeAgentContentHash(original)

      vi.mocked(writeAgentTurnTrace).mockClear()

      let sampleCount = 0
      const transport: AgentChatModelTransport = {
        async sampleChatCompletion() {
          sampleCount += 1
          if (sampleCount === 1) {
            return {
              content: '',
              toolCalls: [
                {
                  id: 'tc-read',
                  type: 'function',
                  function: {
                    name: 'read_file',
                    arguments: JSON.stringify({ path: scriptPath }),
                  },
                },
              ],
            }
          }
          if (sampleCount === 2) {
            const srFailScript = {
              path: scriptPath,
              old_string: 'function NOT_ON_DISK() {}',
              new_string: 'function removeTodo() {}\n',
              expectedContentHash: hash,
            }
            const htmlPath = join(root, 'index.html')
            const htmlHash = computeAgentContentHash(staticTodoValidFiles().html)
            return {
              content: '',
              toolCalls: [
                {
                  id: 'tc-sr-fail-script',
                  type: 'function',
                  function: {
                    name: 'search_replace',
                    arguments: JSON.stringify(srFailScript),
                  },
                },
                {
                  id: 'tc-sr-fail-html',
                  type: 'function',
                  function: {
                    name: 'search_replace',
                    arguments: JSON.stringify({
                      path: htmlPath,
                      old_string: '<div id="NOT_ON_DISK"></div>',
                      new_string: '<button type="button">Remove</button>\n',
                      expectedContentHash: htmlHash,
                    }),
                  },
                },
              ],
            }
          }
          return { content: '', toolCalls: [] }
        },
        async streamFinalAnswer(_request, _signal, emitChunk) {
          emitChunk('Could not patch script.js — retry with propose_file_edits.')
        },
      }

      const { restore } = await setupEvalTurn({
        root,
        projectId,
        innerTransport: transport,
        payload: baseEvalPayload('eval-sr-failure-metrics-140', 'add remove todo button'),
      })
      matrixRestores.push(restore)

      expect(writeAgentTurnTrace).toHaveBeenCalled()
      const trace = vi.mocked(writeAgentTurnTrace).mock.calls.at(-1)?.[1] as AgentTurnTraceV1
      expect(trace.harnessMetrics?.searchReplace?.totalFailures).toBeGreaterThanOrEqual(2)
      expect(trace.harnessMetrics?.searchReplace?.escalationIssued).toBe(true)
      expect(trace.harnessMetrics?.nudgesIssued).toContain('search_replace_escalation')
      expect(trace.harnessMetrics?.searchReplace?.lastFailureReasons?.length).toBeGreaterThan(0)
    })

    it(`${AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_WORK_SR_FAIL_FAST_ESCALATE} — escalation after 1 S&R failure before round 3`, async () => {
      const root = mkdtempSync(join(tmpdir(), 'gf-eval-iterative-sr-fail-fast-138-'))
      const scriptPath = join(root, 'script.js')
      const original = staticTodoValidFiles().js
      writeFileSync(scriptPath, original, 'utf8')
      writeFileSync(join(root, 'index.html'), staticTodoValidFiles().html, 'utf8')
      const projectId = 'eval-iterative-sr-fail-fast-138'
      seedSmallVanillaWorkspaceIndex(projectId, root)
      const hash = computeAgentContentHash(original)

      let sampleCount = 0
      let saw138EscalationOnSample = false
      const transport: AgentChatModelTransport = {
        async sampleChatCompletion(request) {
          sampleCount += 1
          const has138Escalation = request.messages.some(
            (m) =>
              m.role === 'user' &&
              typeof m.content === 'string' &&
              m.content.includes(EDIT_ITERATIVE_SEARCH_REPLACE_ESCALATION_MARKER),
          )
          if (has138Escalation) saw138EscalationOnSample = true

          if (sampleCount === 1) {
            return {
              content: '',
              toolCalls: [
                {
                  id: 'tc-read',
                  type: 'function',
                  function: {
                    name: 'read_file',
                    arguments: JSON.stringify({ path: scriptPath }),
                  },
                },
              ],
            }
          }
          if (sampleCount === 2) {
            return {
              content: '',
              toolCalls: [
                {
                  id: 'tc-sr-fail',
                  type: 'function',
                  function: {
                    name: 'search_replace',
                    arguments: JSON.stringify({
                      path: scriptPath,
                      old_string: 'function NOT_ON_DISK() {}',
                      new_string: 'function removeTodo() {}\n',
                      expectedContentHash: hash,
                    }),
                  },
                },
              ],
            }
          }
          if (sampleCount === 3) {
            expect(has138Escalation).toBe(true)
            return { content: '', toolCalls: [] }
          }
          return { content: '', toolCalls: [] }
        },
        async streamFinalAnswer(_request, _signal, emitChunk) {
          emitChunk('Retry with propose_file_edits.')
        },
      }

      const { restore } = await setupEvalTurn({
        root,
        projectId,
        innerTransport: transport,
        payload: baseEvalPayload(
          'eval-iterative-sr-fail-fast',
          'add remove todo button',
        ),
      })
      matrixRestores.push(restore)

      expect(saw138EscalationOnSample).toBe(true)
      expect(sampleCount).toBeLessThanOrEqual(3)
    })

    it(`${AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_WORK_SR_BLOCKED_AFTER_ESCALATE} — post-escalation S&R blocked with harness reason`, async () => {
      const root = mkdtempSync(join(tmpdir(), 'gf-eval-iterative-sr-blocked-138-'))
      const scriptPath = join(root, 'script.js')
      const original = staticTodoValidFiles().js
      writeFileSync(scriptPath, original, 'utf8')
      writeFileSync(join(root, 'index.html'), staticTodoValidFiles().html, 'utf8')
      const projectId = 'eval-iterative-sr-blocked-138'
      seedSmallVanillaWorkspaceIndex(projectId, root)
      const hash = computeAgentContentHash(original)

      let sampleCount = 0
      const transport: AgentChatModelTransport = {
        async sampleChatCompletion(request) {
          sampleCount += 1
          const has138Escalation = request.messages.some(
            (m) =>
              m.role === 'user' &&
              typeof m.content === 'string' &&
              m.content.includes(EDIT_ITERATIVE_SEARCH_REPLACE_ESCALATION_MARKER),
          )

          if (sampleCount === 1) {
            return {
              content: '',
              toolCalls: [
                {
                  id: 'tc-read',
                  type: 'function',
                  function: {
                    name: 'read_file',
                    arguments: JSON.stringify({ path: scriptPath }),
                  },
                },
              ],
            }
          }
          if (sampleCount === 2) {
            return {
              content: '',
              toolCalls: [
                {
                  id: 'tc-sr-fail',
                  type: 'function',
                  function: {
                    name: 'search_replace',
                    arguments: JSON.stringify({
                      path: scriptPath,
                      old_string: 'NOT_ON_DISK',
                      new_string: 'function removeTodo() {}\n',
                      expectedContentHash: hash,
                    }),
                  },
                },
              ],
            }
          }
          if (sampleCount === 3) {
            expect(has138Escalation).toBe(true)
            return {
              content: '',
              toolCalls: [
                {
                  id: 'tc-sr-retry',
                  type: 'function',
                  function: {
                    name: 'search_replace',
                    arguments: JSON.stringify({
                      path: scriptPath,
                      old_string: 'NOT_ON_DISK_AGAIN',
                      new_string: 'function removeTodo() {}\n',
                      expectedContentHash: hash,
                    }),
                  },
                },
              ],
            }
          }
          return { content: '', toolCalls: [] }
        },
        async streamFinalAnswer(_request, _signal, emitChunk) {
          emitChunk('Use propose_file_edits with full script.js.')
        },
      }

      const { payloads, restore } = await setupEvalTurn({
        root,
        projectId,
        innerTransport: transport,
        payload: baseEvalPayload(
          'eval-iterative-sr-blocked',
          'add remove todo button',
        ),
      })
      matrixRestores.push(restore)

      expect(
        payloads.some(
          (p) =>
            p.phase === 'activity' &&
            p.activity.title === 'Search replace blocked' &&
            p.activity.detail?.includes(ITERATIVE_SEARCH_REPLACE_BLOCKED_REASON),
        ),
      ).toBe(true)
      expect(payloads.some((p) => p.phase === 'done')).toBe(true)
    })

    it(`${AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_WORK_SR_NO_MAX_ITERATIONS} — cooperative propose after 1 S&R fail completes without max iterations`, async () => {
      const root = mkdtempSync(join(tmpdir(), 'gf-eval-iterative-sr-no-max-138-'))
      const scriptPath = join(root, 'script.js')
      const original = staticTodoValidFiles().js
      writeFileSync(scriptPath, original, 'utf8')
      writeFileSync(join(root, 'index.html'), staticTodoValidFiles().html, 'utf8')
      const projectId = 'eval-iterative-sr-no-max-138'
      seedSmallVanillaWorkspaceIndex(projectId, root)
      const hash = computeAgentContentHash(original)
      const updated = `${original}\nfunction removeTodo(id) { todos = todos.filter(t => t.id !== id); renderTodos(); }\n`

      vi.mocked(writeAgentTurnTrace).mockClear()

      let sampleCount = 0
      const transport: AgentChatModelTransport = {
        async sampleChatCompletion(request) {
          sampleCount += 1
          const has138Escalation = request.messages.some(
            (m) =>
              m.role === 'user' &&
              typeof m.content === 'string' &&
              m.content.includes(EDIT_ITERATIVE_SEARCH_REPLACE_ESCALATION_MARKER),
          )

          if (sampleCount === 1) {
            return {
              content: '',
              toolCalls: [
                {
                  id: 'tc-read',
                  type: 'function',
                  function: {
                    name: 'read_file',
                    arguments: JSON.stringify({ path: scriptPath }),
                  },
                },
              ],
            }
          }
          if (sampleCount === 2) {
            return {
              content: '',
              toolCalls: [
                {
                  id: 'tc-sr-fail',
                  type: 'function',
                  function: {
                    name: 'search_replace',
                    arguments: JSON.stringify({
                      path: scriptPath,
                      old_string: 'NOT_ON_DISK',
                      new_string: 'function removeTodo() {}\n',
                      expectedContentHash: hash,
                    }),
                  },
                },
              ],
            }
          }
          if (sampleCount === 3) {
            expect(has138Escalation).toBe(true)
            return {
              content: '',
              toolCalls: [
                {
                  id: 'tc-propose',
                  type: 'function',
                  function: {
                    name: 'propose_file_edits',
                    arguments: JSON.stringify({
                      version: AGENT_TOOL_PROTOCOL_VERSION,
                      operations: [
                        {
                          op: 'write_file',
                          path: scriptPath,
                          content: updated,
                          expectedContentHash: hash,
                        },
                      ],
                    }),
                  },
                },
              ],
            }
          }
          return { content: '', toolCalls: [] }
        },
        async streamFinalAnswer(_request, _signal, emitChunk) {
          emitChunk('Added remove todo button.')
        },
      }

      const { payloads, restore } = await setupEvalTurn({
        root,
        projectId,
        innerTransport: transport,
        payload: baseEvalPayload(
          'eval-iterative-sr-no-max',
          'add remove todo button',
        ),
      })
      matrixRestores.push(restore)

      expect(payloads.some((p) => p.phase === 'edit_proposal')).toBe(true)
      expect(payloads.some((p) => p.phase === 'done')).toBe(true)
      expect(writeAgentTurnTrace).toHaveBeenCalled()
      const trace = vi.mocked(writeAgentTurnTrace).mock.calls.at(-1)?.[1] as AgentTurnTraceV1
      expect(trace.maxToolIterationsHit).not.toBe(true)
    })

    it(`${AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_WORK_SR_QUALITY_SECTIONS} — merged policy in system prompt without pre-sample user nudge (144)`, async () => {
      const root = mkdtempSync(join(tmpdir(), 'gf-eval-iterative-sr-quality-144-'))
      writeFileSync(join(root, 'script.js'), staticTodoValidFiles().js, 'utf8')
      writeFileSync(join(root, 'index.html'), staticTodoValidFiles().html, 'utf8')
      const projectId = 'eval-iterative-sr-quality-144'
      seedSmallVanillaWorkspaceIndex(projectId, root)

      let firstSampleUserText = ''
      const { getRecords, restore } = await setupEvalTurn({
        root,
        projectId,
        innerTransport: {
          async sampleChatCompletion(request) {
            if (!firstSampleUserText) {
              firstSampleUserText = request.messages
                .filter((m) => m.role === 'user' && typeof m.content === 'string')
                .map((m) => m.content as string)
                .join('\n')
            }
            return { content: '', toolCalls: [] }
          },
          async streamFinalAnswer(_request, _signal, emitChunk) {
            emitChunk('Added remove button.')
          },
        },
        payload: baseEvalPayload('eval-iterative-sr-quality-144', 'add remove todo button'),
      })
      matrixRestores.push(restore)

      const sample = getRecords().find((r) => r.phase === 'sample')
      expect(sample?.systemText).toContain(WORK_ITERATIVE_EDIT_MARKER)
      expect(sample?.systemText).toMatch(/rawContent/i)
      expect(sample?.systemText).not.toContain('## Work iterative search_replace quality')
      expect(firstSampleUserText).not.toContain('Harness: localized UI edit')
    })

    it(`${AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_WORK_SR_TOOL_OVERRIDE} — merged harness copy includes S&R guidance without tool override (144)`, async () => {
      const root = mkdtempSync(join(tmpdir(), 'gf-eval-iterative-sr-tool-override-144-'))
      writeFileSync(join(root, 'script.js'), staticTodoValidFiles().js, 'utf8')
      writeFileSync(join(root, 'index.html'), staticTodoValidFiles().html, 'utf8')
      const projectId = 'eval-iterative-sr-tool-override-144'
      seedSmallVanillaWorkspaceIndex(projectId, root)

      const { getRecords, restore } = await setupEvalTurn({
        root,
        projectId,
        innerTransport: {
          async sampleChatCompletion(request) {
            const srTool = request.tools.find((t) => t.function.name === 'search_replace')
            expect(srTool?.function.description).not.toMatch(/Prefer propose_file_edits when the file is one long line/)
            return { content: '', toolCalls: [] }
          },
          async streamFinalAnswer(_request, _signal, emitChunk) {
            emitChunk('Done.')
          },
        },
        payload: baseEvalPayload(
          'eval-iterative-sr-tool-override-144',
          'add delete button to each todo item',
        ),
      })
      matrixRestores.push(restore)

      const sample = getRecords().find((r) => r.phase === 'sample')
      expect(sample?.systemText).toMatch(/rawContent/i)
    })

    it(`${AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_WORK_SR_TOOL_OVERRIDE} — greenfield turn keeps default search_replace description`, async () => {
      const root = mkdtempSync(join(tmpdir(), 'gf-eval-greenfield-sr-desc-139-'))
      writeFileSync(join(root, 'index.html'), staticTodoValidFiles().html, 'utf8')
      const projectId = 'eval-greenfield-sr-desc-139'
      seedSingleFileWorkspaceIndex(projectId, root)

      let srDescription = ''
      const { restore } = await setupEvalTurn({
        root,
        projectId,
        innerTransport: {
          async sampleChatCompletion(request) {
            if (!srDescription) {
              const srTool = request.tools.find((t) => t.function.name === 'search_replace')
              srDescription = srTool?.function.description ?? ''
            }
            return { content: '', toolCalls: [] }
          },
          async streamFinalAnswer(_request, _signal, emitChunk) {
            emitChunk('Done.')
          },
        },
        payload: baseEvalPayload('eval-greenfield-sr-desc-139', 'add a button to the page'),
      })
      matrixRestores.push(restore)

      expect(srDescription).not.toMatch(/under ~20 lines/i)
      expect(srDescription).not.toMatch(/116/i)
    })

    it(`${AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_EDIT_SCOPE_SINGLE_FILE} — system prompt includes scope marker and script.js`, async () => {
      const root = mkdtempSync(join(tmpdir(), 'gf-eval-iterative-scope-136-'))
      writeFileSync(join(root, 'script.js'), staticTodoValidFiles().js, 'utf8')
      writeFileSync(join(root, 'index.html'), staticTodoValidFiles().html, 'utf8')
      const projectId = 'eval-iterative-scope-136'
      seedSmallVanillaWorkspaceIndex(projectId, root)

      const { getRecords, restore } = await setupEvalTurn({
        root,
        projectId,
        innerTransport: transportNoToolsFinal('Added localStorage.'),
        payload: baseEvalPayload(
          'eval-iterative-scope',
          'add localStorage persistence for todos',
        ),
      })
      matrixRestores.push(restore)

      const sample = getRecords().find((r) => r.phase === 'sample')
      expect(sample?.systemText).toContain(ITERATIVE_EDIT_SCOPE_MARKER)
      expect(sample?.systemText).toContain('script.js')
      expect(sample?.systemText).toContain(WORK_ITERATIVE_EDIT_MARKER)
    })

    it(`${AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_EDIT_SCOPE_PREFER_PROPOSE_NUDGE} — no commit_proposal after 1 S&R; nudge after 2 failures (144)`, async () => {
      const root = mkdtempSync(join(tmpdir(), 'gf-eval-iterative-scope-nudge-144-'))
      const scriptPath = join(root, 'script.js')
      const original = staticTodoValidFiles().js
      writeFileSync(scriptPath, original, 'utf8')
      writeFileSync(join(root, 'index.html'), staticTodoValidFiles().html, 'utf8')
      const projectId = 'eval-iterative-scope-nudge-144'
      seedSmallVanillaWorkspaceIndex(projectId, root)
      const hash = computeAgentContentHash(original)

      let sampleCount = 0
      let midTurnNudgeCount = 0
      const transport: AgentChatModelTransport = {
        async sampleChatCompletion(request) {
          sampleCount += 1
          for (const m of request.messages) {
            if (m.role !== 'user' || typeof m.content !== 'string') continue
            if (m.content.includes(INCREMENTAL_EDIT_MID_TURN_NUDGE_MARKER)) {
              midTurnNudgeCount += 1
            }
          }

          if (sampleCount === 1) {
            return {
              content: '',
              toolCalls: [
                {
                  id: 'tc-read',
                  type: 'function',
                  function: {
                    name: 'read_file',
                    arguments: JSON.stringify({ path: scriptPath }),
                  },
                },
              ],
            }
          }
          if (sampleCount === 2) {
            return {
              content: '',
              toolCalls: [
                {
                  id: 'tc-sr-1',
                  type: 'function',
                  function: {
                    name: 'search_replace',
                    arguments: JSON.stringify({
                      path: scriptPath,
                      old_string: 'NOT_ON_DISK',
                      new_string: 'const x = 1;\n',
                      expectedContentHash: hash,
                    }),
                  },
                },
              ],
            }
          }
          if (sampleCount === 3) {
            expect(midTurnNudgeCount).toBe(0)
            return {
              content: '',
              toolCalls: [
                {
                  id: 'tc-sr-2',
                  type: 'function',
                  function: {
                    name: 'search_replace',
                    arguments: JSON.stringify({
                      path: scriptPath,
                      old_string: 'ALSO_NOT_ON_DISK',
                      new_string: 'const y = 2;\n',
                      expectedContentHash: hash,
                    }),
                  },
                },
              ],
            }
          }
          if (sampleCount === 4) {
            expect(midTurnNudgeCount).toBe(1)
            return { content: '', toolCalls: [] }
          }
          return { content: '', toolCalls: [] }
        },
        async streamFinalAnswer(_request, _signal, emitChunk) {
          emitChunk('Escalate to propose_file_edits with full rawContent.')
        },
      }

      const { restore } = await setupEvalTurn({
        root,
        projectId,
        innerTransport: transport,
        payload: baseEvalPayload(
          'eval-iterative-scope-nudge',
          'add localStorage persistence for todos',
        ),
      })
      matrixRestores.push(restore)

      expect(midTurnNudgeCount).toBe(1)
    })

    it('routing:post_plan_incremental — stops tool_sample after edit proposal on post-plan follow-up (144)', async () => {
      const root = mkdtempSync(join(tmpdir(), 'gf-eval-post-plan-stop-proposal-144-'))
      const file = join(root, 'src', 'app.ts')
      mkdirSync(dirname(file), { recursive: true })
      const original = 'export const todos: string[] = [];\n'
      writeFileSync(file, original, 'utf8')
      writeFileSync(join(root, 'package.json'), '{"name":"eval-app"}\n', 'utf8')
      const projectId = 'eval-post-plan-stop-proposal-144'
      seedApprovedPlanArtifact(projectId)
      seedPopulatedWorkspaceIndex(projectId, root)
      const hash = computeAgentContentHash(original)
      const updated = `${original}// added\n`

      let sampleCount = 0
      const transport: AgentChatModelTransport = {
        async sampleChatCompletion() {
          sampleCount += 1
          if (sampleCount === 1) {
            return {
              content: '',
              toolCalls: [
                {
                  id: 'tc-read',
                  type: 'function',
                  function: {
                    name: 'read_file',
                    arguments: JSON.stringify({ path: file }),
                  },
                },
              ],
            }
          }
          if (sampleCount === 2) {
            return {
              content: '',
              toolCalls: [
                {
                  id: 'tc-propose',
                  type: 'function',
                  function: {
                    name: 'propose_file_edits',
                    arguments: JSON.stringify({
                      version: 1,
                      operations: [
                        {
                          op: 'write_file',
                          path: file,
                          content: updated,
                          expectedContentHash: hash,
                        },
                      ],
                    }),
                  },
                },
              ],
            }
          }
          throw new Error('should not sample tools after post-plan edit proposal')
        },
        async streamFinalAnswer(_request, _signal, emitChunk) {
          emitChunk('Added button.')
        },
      }

      const { getRecords, payloads, restore } = await setupEvalTurn({
        root,
        projectId,
        innerTransport: transport,
        payload: baseEvalPayload('eval-post-plan-stop-proposal', 'add delete button'),
      })
      matrixRestores.push(restore)

      expect(sampleCount).toBe(2)
      expect(payloads.some((p) => p.phase === 'edit_proposal')).toBe(true)
      const trace = vi.mocked(writeAgentTurnTrace).mock.calls.at(-1)?.[1] as AgentTurnTraceV1
      expect(trace.harnessMetrics?.stoppedAfterProposal).toBe(true)
      expect(trace.harnessMetrics?.postPlanIncremental).toBe(true)
      const sample = getRecords().find((r) => r.phase === 'sample')
      expect(sample?.systemText).toContain(POST_PLAN_INCREMENTAL_MARKER)
    })

    it(`${AGENT_EVAL_TAG_AGENT_PLANNER} — rejects propose_file_edits when model requests it`, async () => {
      const root = mkdtempSync(join(tmpdir(), 'gf-eval-matrix-planner-deny-'))
      writeFileSync(join(root, 'a.txt'), 'a\n', 'utf8')

      const payload = baseEvalPayload('eval-matrix-planner-deny', 'Plan only')
      payload.activeContext.chatMode = 'plan'

      const innerTransport = {
        async sampleChatCompletion() {
          return {
            content: '',
            toolCalls: [
              {
                id: 'tc_edit',
                type: 'function' as const,
                function: {
                  name: 'propose_file_edits',
                  arguments: JSON.stringify({
                    version: 1,
                    operations: [{ op: 'write_file', path: 'a.txt', content: 'x' }],
                  }),
                },
              },
            ],
          }
        },
        async streamFinalAnswer(_request: unknown, _signal: unknown, emitChunk: (d: string) => void) {
          emitChunk('Plan fence later.')
        },
      }

      const { payloads, restore } = await setupEvalTurn({
        root,
        projectId: 'eval-matrix-planner-deny',
        innerTransport,
        payload,
      })
      matrixRestores.push(restore)

      expect(
        payloads.some(
          (p) =>
            p.phase === 'activity' &&
            p.activity.title?.includes('not available') &&
            p.activity.status === 'error',
        ),
      ).toBe(true)
    })
  })
})
