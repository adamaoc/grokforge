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
import { GREENFIELD_HARNESS_MARKER } from '../shared/workspace-greenfield'
import {
  AGENT_EVAL_TAG_AGENT_EXECUTOR,
  AGENT_EVAL_TAG_AGENT_PLANNER,
  AGENT_EVAL_TAG_BEHAVIOR_PROACTIVE,
  AGENT_EVAL_TAG_CONTRACT_PLAN,
  AGENT_EVAL_TAG_PROFILE_GROK_4_3,
  AGENT_EVAL_TAG_PROFILE_GROK_CODE_FAST,
} from '../shared/agent-eval-tags'
import { GF_PLAN_FENCE } from '../shared/gf-plan-contract'
import type { StoredPlanArtifact } from '../shared/agent-plan-artifact'
import { buildApprovedPlanExecuteUserText } from '../shared/agent-plan-artifact'
import { planJsonPath } from './agent-plan-store'
import { appendTurnReceipt } from './agent-turn-receipt-store'
import { _resetTurnReceiptLifecycleForTesting } from './agent-turn-receipt-lifecycle'
import { TURN_RECOVERY_HINT_MARKER } from '../shared/agent-turn-receipt-contract'
import {
  EDIT_INTENT_TOOL_NUDGE_MARKER,
  EDIT_SEARCH_REPLACE_ESCALATION_MARKER,
} from '../shared/agent-final-answer-contract'
import { AGENT_TOOL_PROTOCOL_VERSION } from '../shared/agent-tool-contract'
import { computeAgentContentHash } from './agent-content-hash'
import { baseEvalPayload, manifestForEvalRoot, setupEvalTurn } from './agent-eval-fixtures'
import {
  primeActiveAgentTurn,
  runAgentTurnJobForEvaluation,
  setAgentChatModelTransportForTesting,
  setAgentChatTargetWindow,
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
      expect(turnStarted.routing.modelId).toBe('grok-code-fast-1')
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
    expect(payloads.some((p) => p.phase === 'edit_proposal')).toBe(true)
    expect(payloads.some((p) => p.phase === 'done')).toBe(true)
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
          p.activity.title.includes('Finishing turn'),
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

    expect(modelsUsed.every((m) => m === 'grok-code-fast-1')).toBe(true)
    const turnStarted = payloads.find((p) => p.phase === 'turn_started')
    expect(turnStarted?.phase).toBe('turn_started')
    if (turnStarted?.phase === 'turn_started') {
      expect(turnStarted.routing.modelId).toBe('grok-code-fast-1')
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
      expect(turnStarted.routing.modelId).toBe('grok-code-fast-1')
      expect(turnStarted.routing.agentProfileId).toBe('executor')
    }
    expect(modelsUsed.every((m) => m === 'grok-code-fast-1')).toBe(true)
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
      modelId: 'grok-code-fast-1',
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

    it(`${AGENT_EVAL_TAG_PROFILE_GROK_CODE_FAST} — fast chat uses grok-code-fast-1 harness copy`, async () => {
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
      expect(samples[0]?.model).toBe('grok-code-fast-1')
      expect(samples[0]?.systemText).toMatch(/Harness profile \(fast execution\)/i)

      const turnStarted = payloads.find((p) => p.phase === 'turn_started')
      if (turnStarted?.phase === 'turn_started') {
        expect(turnStarted.routing.harnessProfileKey).toBe('grok_code_fast')
        expect(turnStarted.routing.modelId).toBe('grok-code-fast-1')
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
      }
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
      expect(fastSample?.model).toBe('grok-code-fast-1')
      expect(planSample?.model).toBe('grok-4.3')
      expect(fastSample?.systemText).not.toBe(planSample?.systemText)
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
