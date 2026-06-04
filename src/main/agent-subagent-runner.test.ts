import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentChatModelTransport } from '../harness/agent/chat-model-transport'
import { setAgentSubagentModelTransportForTests, runSubagentSession } from '../harness/subagent/runner'
import type { GrokProjectManifest } from './manifest'

const userDataRoot = mkdtempSync(join(tmpdir(), 'grokforge-subagent-run-'))

vi.mock('electron', () => ({
  app: { getPath: () => userDataRoot },
}))

vi.mock('./app-project-store', async () => {
  const actual = await vi.importActual<typeof import('./app-project-store')>('./app-project-store')
  return {
    ...actual,
    projectDir: (projectId: string) => join(userDataRoot, 'workspace-projects', projectId),
  }
})

const manifest: GrokProjectManifest = {
  version: '1.2',
  name: 'T',
  roots: [{ id: 'root', path: '/tmp', type: 'code', label: 'R' }],
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

afterEach(() => {
  rmSync(join(userDataRoot, 'workspace-projects'), { recursive: true, force: true })
  setAgentSubagentModelTransportForTests(null)
})

describe('runSubagentSession', () => {
  it('emits subagent events and returns bounded JSON', async () => {
    let call = 0
    const transport: AgentChatModelTransport = {
      async sampleChatCompletion() {
        call += 1
        if (call === 1) {
          return { content: '', toolCalls: [] }
        }
        return {
          content: JSON.stringify({
            summary: 'Explored workspace layout',
            filesRead: [],
            searchHits: [{ query: 'auth', path: '/tmp/auth.ts', line: 1 }],
          }),
          toolCalls: [],
        }
      },
      async streamFinalAnswer() {},
    }

    setAgentSubagentModelTransportForTests(transport)

    const emitted: Array<{ phase?: string }> = []
    const result = await runSubagentSession({
      projectId: 'p-sub',
      parentStreamId: 'stream-1',
      manifest,
      activeContext: { openTabs: [], chatMode: 'fast' },
      args: { task: 'Map auth files' },
      abortSignal: new AbortController().signal,
      emit: (p) => emitted.push(p),
      waitForCommandApproval: async () => false,
    })

    expect(result.ok).toBe(true)
    expect(result.toolContent.length).toBeLessThanOrEqual(4000)
    const parsed = JSON.parse(result.toolContent) as { summary: string }
    expect(parsed.summary).toContain('Explored')
    expect(emitted.some((e) => e.phase === 'subagent')).toBe(true)
  })
})
