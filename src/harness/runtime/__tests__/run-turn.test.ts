import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GrokProjectManifest } from '../../../main/project/manifest'
import { formatHarnessTurnErrorMessage } from '../turn-error-hint'
import { createHarnessTurnMutatingProgress } from '../turn-mutating-progress'
import { runHarnessTurnLoop, type HarnessLoopResult } from '../loop'
import { HARNESS_MAX_TOOL_ITERATIONS_PLAN } from '../config'
import { HarnessLogger } from '../../logging/logger'
import { PLAN_PROFILE } from '../../profile/plan-profile'
import { HarnessSession } from '../../session/session'
import type { ModelStepResult } from '../../model/client'
import { HarnessProposalAccumulator } from '../../proposal/accumulator'
import type { HarnessToolRunContext } from '../../tools/tool-context'

function testManifest(rootPath: string): GrokProjectManifest {
  return {
    version: '1',
    name: 'Harness Turn',
    roots: [{ id: 'root', path: rootPath, label: 'Root', type: 'code' }],
    ignore: [],
    context: { alwaysInclude: [] },
    models: {
      default: 'grok-build-0.1',
      planning: 'grok-4.3',
      execution: 'grok-build-0.1',
      reasoning: 'grok-4.20',
      voice: 'grok-voice-latest',
    },
    voice: { enabled: true, defaultVoiceMode: 'off', autoListen: false, speakResponses: false },
    metadata: { createdAt: 'now', lastOpened: 'now', tags: [] },
  }
}

describe('harness turn loop', () => {
  let dir = ''

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
    dir = ''
  })

  function workToolContext(manifest: GrokProjectManifest): HarnessToolRunContext {
    const proposalAccumulator = new HarnessProposalAccumulator(vi.fn())
    return {
      projectId: 'proj-1',
      streamId: 'test-stream',
      manifest,
      activeContext: { openTabs: [], chatMode: 'fast' },
      activeRootId: 'root',
      signal: new AbortController().signal,
      commandApproval: { requestApproval: vi.fn(async () => false) },
      proposalAccumulator,
      emit: vi.fn(),
      updateToolActivity: vi.fn(),
    }
  }

  async function runWithSteps(steps: ModelStepResult[]): Promise<HarnessLoopResult> {
    dir = await mkdtemp(join(tmpdir(), 'gf-harness-turn-'))
    const manifest = testManifest(dir)
    const session = new HarnessSession('test-stream', join(dir, 'sessions'))
    const logger = new HarnessLogger(join(dir, 'logs'), 'test-stream')
    let i = 0

    return runHarnessTurnLoop({
      session,
      toolEnv: { manifest },
      modelId: 'grok-build-0.1',
      userInput: 'do the work',
      logger,
      signal: new AbortController().signal,
      toolContext: workToolContext(manifest),
      modelChat: async () => {
        const step = steps[i]
        i += 1
        if (!step) throw new Error('unexpected extra model step')
        return step
      },
    })
  }

  it('prepares a greenfield write_file proposal without touching disk', async () => {
    const result = await runWithSteps([
      {
        content: '',
        toolCalls: [
          {
            id: 'call-write',
            type: 'function',
            function: {
              name: 'write_file',
              arguments: JSON.stringify({ path: 'index.html', content: '<h1>Hello</h1>\n' }),
            },
          },
        ],
      },
      { content: 'Created index.html.', toolCalls: [] },
    ])

    expect(existsSync(join(dir, 'index.html'))).toBe(false)
    expect(result.finalText).toBe('Created index.html.')
    expect(result.steps).toBe(2)
  })

  it('chains read_file then edit proposals on the same file', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gf-harness-turn-'))
    await writeFile(join(dir, 'app.txt'), 'alpha beta gamma', 'utf-8')
    const manifest = testManifest(dir)
    const session = new HarnessSession('test-stream', join(dir, 'sessions'))
    const logger = new HarnessLogger(join(dir, 'logs'), 'test-stream')
    let i = 0
    const steps: ModelStepResult[] = [
      {
        content: '',
        toolCalls: [
          {
            id: 'call-read',
            type: 'function',
            function: { name: 'read_file', arguments: JSON.stringify({ path: 'app.txt' }) },
          },
        ],
      },
      {
        content: '',
        toolCalls: [
          {
            id: 'call-edit',
            type: 'function',
            function: {
              name: 'edit',
              arguments: JSON.stringify({
                path: 'app.txt',
                // This intentionally uses the stale hash path: the edit still applies when oldText
                // matches current disk, which preserves in-turn edit chaining.
                expectedContentHash: '0'.repeat(64),
                edits: [{ oldText: 'beta', newText: 'BETA' }],
              }),
            },
          },
        ],
      },
      { content: 'Edited app.txt.', toolCalls: [] },
    ]

    const result = await runHarnessTurnLoop({
      session,
      toolEnv: { manifest },
      modelId: 'grok-build-0.1',
      userInput: 'do the work',
      logger,
      signal: new AbortController().signal,
      toolContext: workToolContext(manifest),
      modelChat: async () => {
        const step = steps[i]
        i += 1
        if (!step) throw new Error('unexpected extra model step')
        return step
      },
    })

    expect(await readFile(join(dir, 'app.txt'), 'utf-8')).toBe('alpha beta gamma')
    expect(result.finalText).toBe('Edited app.txt.')
  })

  it('injects plan loop nudge after repeated identical read_file calls', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gf-harness-plan-guard-'))
    await writeFile(join(dir, 'architecture.md'), '# Architecture\n', 'utf-8')

    const session = new HarnessSession('plan-guard-stream', join(dir, 'sessions'))
    const logger = new HarnessLogger(join(dir, 'logs'), 'plan-guard-stream')
    let modelCalls = 0

    const readCall = {
      id: 'call-read-arch',
      type: 'function' as const,
      function: {
        name: 'read_file',
        arguments: JSON.stringify({ path: 'architecture.md' }),
      },
    }

    const result = await runHarnessTurnLoop({
      session,
      toolEnv: { manifest: testManifest(dir) },
      modelId: 'grok-4.3',
      userInput: 'plan a styleguide doc',
      profile: PLAN_PROFILE,
      maxToolIterations: HARNESS_MAX_TOOL_ITERATIONS_PLAN,
      logger,
      signal: new AbortController().signal,
      modelChat: async () => {
        modelCalls += 1
        if (modelCalls <= 3) {
          return { content: '', toolCalls: [{ ...readCall, id: `call-read-${modelCalls}` }] }
        }
        return { content: '```gf-plan\n{"schemaVersion":1,"summary":"ok","filesLikelyTouched":[],"risksUnknowns":[],"steps":[{"id":"1","title":"Create styleguide"}],"verification":"read_file"}\n```', toolCalls: [] }
      },
    })

    const userNudges = session
      .getHistory()
      .filter((m) => m.role === 'user' && m.content.includes('Harness:'))
    expect(userNudges.length).toBeGreaterThanOrEqual(1)
    expect(userNudges.some((m) => m.content.includes('identical arguments'))).toBe(true)
    expect(result.finalText).toContain('gf-plan')
  })

  it('logs model_step timeout metadata when a model step aborts', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gf-harness-timeout-'))
    const manifest = testManifest(dir)
    const session = new HarnessSession('timeout-stream', join(dir, 'sessions'))
    const logger = new HarnessLogger(join(dir, 'logs'), 'timeout-stream')

    await expect(
      runHarnessTurnLoop({
        session,
        toolEnv: { manifest },
        modelId: 'grok-build-0.1',
        userInput: 'scaffold the app',
        logger,
        signal: new AbortController().signal,
        toolContext: workToolContext(manifest),
        modelChat: async () => {
          throw new Error('The operation was aborted due to timeout')
        },
      }),
    ).rejects.toThrow('aborted due to timeout')

    const logLines = (await readFile(join(dir, 'logs', 'timeout-stream.jsonl'), 'utf-8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { kind: string; outcome?: string; timeoutMs?: number })

    const timeoutEvent = logLines.find((line) => line.kind === 'model_step' && line.outcome === 'timeout')
    expect(timeoutEvent).toBeDefined()
    expect(timeoutEvent?.timeoutMs).toBeGreaterThanOrEqual(180_000)
  })

  it('records proposal progress for contextual turn-error hints', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gf-harness-progress-'))
    const manifest = testManifest(dir)
    const session = new HarnessSession('progress-stream', join(dir, 'sessions'))
    const logger = new HarnessLogger(join(dir, 'logs'), 'progress-stream')
    const mutatingProgress = createHarnessTurnMutatingProgress()
    let modelCalls = 0

    await expect(
      runHarnessTurnLoop({
        session,
        toolEnv: { manifest },
        modelId: 'grok-build-0.1',
        userInput: 'scaffold styles',
        logger,
        signal: new AbortController().signal,
        toolContext: workToolContext(manifest),
        mutatingProgress,
        modelChat: async () => {
          modelCalls += 1
          if (modelCalls === 1) {
            return {
              content: '',
              toolCalls: [
                {
                  id: 'call-write',
                  type: 'function',
                  function: {
                    name: 'write_file',
                    arguments: JSON.stringify({ path: 'index.css', content: 'body { margin: 0; }\n' }),
                  },
                },
              ],
            }
          }
          throw new Error('The operation was aborted due to timeout')
        },
      }),
    ).rejects.toThrow('aborted due to timeout')

    expect(mutatingProgress.proposalToolSuccessCount).toBe(1)
    expect(
      formatHarnessTurnErrorMessage(new Error('timed out'), mutatingProgress),
    ).toContain('edit proposals may already be in the chat')
  })
})
