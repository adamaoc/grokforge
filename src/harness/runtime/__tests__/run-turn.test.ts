import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import type { GrokProjectManifest } from '../../../main/project/manifest'
import { runHarnessTurnLoop, type HarnessLoopResult } from '../loop'
import { HARNESS_MAX_TOOL_ITERATIONS_PLAN } from '../config'
import { HarnessLogger } from '../../logging/logger'
import { PLAN_PROFILE } from '../../profile/plan-profile'
import { HarnessSession } from '../../session/session'
import type { ModelStepResult } from '../../model/client'

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

  async function runWithSteps(steps: ModelStepResult[]): Promise<HarnessLoopResult> {
    dir = await mkdtemp(join(tmpdir(), 'gf-harness-turn-'))
    const session = new HarnessSession('test-stream', join(dir, 'sessions'))
    const logger = new HarnessLogger(join(dir, 'logs'), 'test-stream')
    let i = 0

    return runHarnessTurnLoop({
      session,
      toolEnv: { manifest: testManifest(dir) },
      modelId: 'grok-build-0.1',
      userInput: 'do the work',
      logger,
      signal: new AbortController().signal,
      modelChat: async () => {
        const step = steps[i]
        i += 1
        if (!step) throw new Error('unexpected extra model step')
        return step
      },
    })
  }

  it('creates a greenfield file with write_file', async () => {
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

    await expect(readFile(join(dir, 'index.html'), 'utf-8')).resolves.toBe('<h1>Hello</h1>\n')
    expect(result.finalText).toBe('Created index.html.')
    expect(result.steps).toBe(2)
  })

  it('chains read_file then edit on the same file', async () => {
    const result = await runWithSteps([
      {
        content: '',
        toolCalls: [
          {
            id: 'call-write',
            type: 'function',
            function: {
              name: 'write_file',
              arguments: JSON.stringify({ path: 'app.txt', content: 'alpha beta gamma' }),
            },
          },
        ],
      },
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
    ])

    await expect(readFile(join(dir, 'app.txt'), 'utf-8')).resolves.toBe('alpha BETA gamma')
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
})
