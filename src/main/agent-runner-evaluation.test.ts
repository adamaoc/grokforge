import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import type { AgentChatEventPayload, AgentChatStartPayload } from '../shared/agent-chat-contract'
import type { GrokProjectManifest } from './manifest'
import { AGENT_TOOL_MAX_ITERATIONS } from './agent-workspace-tools'
import type { AgentChatModelTransport } from './agent-chat-model-transport'
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
  return {
    version: '1.2',
    name: 'Eval Project',
    roots: [{ id: 'root', path: root, type: 'code', label: 'Root' }],
    ignore: ['**/node_modules', '**/.git', '**/ignored'],
    models: {
      default: 'grok-code-fast-1',
      planning: 'grok-4.3',
      execution: 'grok-code-fast-1',
      reasoning: 'grok-4.20-reasoning',
      voice: 'grok-voice-think-fast-1.0',
    },
    voice: { enabled: true, defaultVoiceMode: 'off', autoListen: false, speakResponses: false },
    context: { alwaysInclude: [] },
    metadata: { createdAt: 'now', lastOpened: 'now', tags: [] },
  }
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
  return {
    streamId,
    model: 'grok-test',
    userText,
    threadSnapshot: [],
    activeContext: {
      activeRootId: 'root',
      openTabs: [],
      chatMode: 'fast',
    },
  }
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
    async streamFinalAnswer(_model, _messages, _signal, emitChunk) {
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
    async streamFinalAnswer(_model, _messages, _signal, emitChunk) {
      emitChunk(finalText)
    },
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
    async streamFinalAnswer(_model, _messages, _signal, emitChunk) {
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

    expect(payloads.some((p) => p.phase === 'turn_started')).toBe(true)
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

  it('emits cancelled when the turn is aborted', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-eval-'))
    writeFileSync(join(root, 'a.txt'), 'a\n', 'utf8')

    const blockedTransport: AgentChatModelTransport = {
      async sampleChatCompletion(_model, _messages, signal) {
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
})
