import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { GrokProjectManifest } from '../../project/manifest'
import { runCommandInRootForAgent } from '../../../harness-support/tools/run-command'

function manifestForRoot(root: string): GrokProjectManifest {
  return {
    version: '1.2',
    name: 'Command Test',
    roots: [{ id: 'root', path: root, type: 'code', label: 'Root' }],
    ignore: ['**/node_modules', '**/.git'],
    models: {
      default: 'grok-build-0.1',
      planning: 'grok-4.3',
      execution: 'grok-build-0.1',
      reasoning: 'grok-4.20-0309-reasoning',
      voice: 'grok-voice-latest',
    },
    voice: { enabled: true, defaultVoiceMode: 'off', autoListen: false, speakResponses: false },
    context: { alwaysInclude: [] },
    metadata: { createdAt: 'now', lastOpened: 'now', tags: [] },
  }
}

describe('agent command execution', () => {
  it('collects capped command output for the agent tool result', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-command-'))
    const res = await runCommandInRootForAgent(manifestForRoot(root), {
      rootId: 'root',
      command: 'printf "hello-agent"',
      timeoutMs: 5_000,
      acknowledgedDestructive: true,
    })

    expect(res.ok).toBe(true)
    expect(res.output).toContain('hello-agent')
  })

  it('keeps hard-blocked commands impossible for the agent path', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-command-'))
    const res = await runCommandInRootForAgent(manifestForRoot(root), {
      rootId: 'root',
      command: 'rm -rf /',
      timeoutMs: 5_000,
      acknowledgedDestructive: true,
    })

    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('blocked')
  })
})
