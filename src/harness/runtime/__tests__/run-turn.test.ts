import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { runHarnessTurnLoop, type HarnessLoopResult } from '../loop'
import { HarnessLogger } from '../../logging/logger'
import { HarnessSession } from '../../session/session'
import type { ModelStepResult } from '../../model/client'

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
      workspaceRoot: dir,
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
})
