import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type {
  AgentChatEventPayload,
  AgentChatStartPayload,
  AgentCommandApprovalRequest,
  ReviewMode,
} from '../../../shared/agent/chat-contract'
import type { GrokProjectManifest } from '../../project/manifest'
import { AcpAgentConnection } from '../connection'
import { JsonRpcPeer } from '../json-rpc'
import type { ManagedAcpSession } from '../session-manager'
import { modelLabelFrom } from '../session-manager'
import {
  addSnippetLineNumbers,
  buildPromptBlocks,
  pickPermissionOption,
  pickSessionModeId,
  runAcpTurn,
  shouldAutoAllow,
  type AcpTurnInput,
} from '../turn'

const MODES = [
  { id: 'default', name: 'Manual' },
  { id: 'acceptEdits', name: 'Accept edits' },
  { id: 'plan', name: 'Plan' },
]

type AgentParams = { sessionId: string; modeId?: string }

type FakeAgent = {
  peer: JsonRpcPeer
  calls: Array<{ method: string; params: AgentParams }>
}

/** In-process ACP agent: on prompt, reads README, proposes an edit, writes it if allowed. */
function startFakeAgent(rootPath: string): { conn: AcpAgentConnection; agent: FakeAgent } {
  const toClient = new PassThrough()
  const toAgent = new PassThrough()
  const calls: FakeAgent['calls'] = []
  const agent: FakeAgent = { peer: null as unknown as JsonRpcPeer, calls }
  const readme = join(rootPath, 'README.md')

  agent.peer = new JsonRpcPeer({
    input: toAgent,
    output: toClient,
    onNotification: (method, params) => calls.push({ method, params: params as AgentParams }),
    onRequest: async (method, raw) => {
      const params = raw as AgentParams
      calls.push({ method, params })
      if (method === 'session/set_mode') return {}
      if (method !== 'session/prompt') return null
      const sid = params.sessionId
      const update = (u: unknown) => agent.peer.notify('session/update', { sessionId: sid, update: u })

      update({ sessionUpdate: 'plan', entries: [{ content: 'Read README', status: 'in_progress' }, { content: 'Add usage', status: 'pending' }] })
      update({ sessionUpdate: 'tool_call', toolCallId: 't1', title: 'Read README.md', kind: 'read', status: 'in_progress', locations: [{ path: readme }] })
      const { content: before } = (await agent.peer.request('fs/read_text_file', { sessionId: sid, path: readme })) as { content: string }
      update({ sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'completed' })
      update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Adding a usage section.' } })

      const after = `${before}\n## Usage\n\nRun it.\n`
      const editCall = {
        toolCallId: 't2',
        title: 'Edit README.md',
        kind: 'edit',
        status: 'pending',
        locations: [{ path: readme }],
        content: [{ type: 'diff', path: readme, oldText: before, newText: after }],
      }
      update({ sessionUpdate: 'tool_call', ...editCall })
      const decision = (await agent.peer.request('session/request_permission', {
        sessionId: sid,
        toolCall: editCall,
        options: [
          { optionId: 'yes', name: 'Allow', kind: 'allow_once' },
          { optionId: 'always', name: 'Always', kind: 'allow_always' },
          { optionId: 'no', name: 'Reject', kind: 'reject_once' },
        ],
      })) as { outcome: { outcome: string; optionId?: string } }
      const allowed = decision.outcome.outcome === 'selected' && decision.outcome.optionId !== 'no'
      if (allowed) {
        await agent.peer.request('fs/write_text_file', { sessionId: sid, path: readme, content: after })
      }
      update({ sessionUpdate: 'tool_call_update', toolCallId: 't2', status: allowed ? 'completed' : 'failed' })
      update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: allowed ? 'Done.' : 'Left it alone.' } })
      return { stopReason: 'end_turn' }
    },
  })

  return { conn: AcpAgentConnection.fromStreams({ input: toClient, output: toAgent }), agent }
}

function manifest(rootPath: string): GrokProjectManifest {
  return {
    version: 1,
    name: 'Fixture',
    roots: [{ id: 'app', path: rootPath, label: 'App' }],
    ignore: [],
    context: {},
    models: { default: 'grok-build-0.1' },
    voice: { defaultVoiceMode: 'off' },
  }
}

function payload(over: Partial<AgentChatStartPayload> = {}, reviewMode: ReviewMode = 'trust'): AgentChatStartPayload {
  return {
    streamId: 's1',
    userText: 'Add a usage section to the README',
    threadSnapshot: [],
    activeContext: { openTabs: [], chatMode: 'fast' },
    reviewMode,
    ...over,
  }
}

describe('runAcpTurn', () => {
  let dir = ''

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gf-acp-turn-'))
    writeFileSync(join(dir, 'README.md'), '# Demo\n')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  async function run(opts: { temperament?: ReviewMode; approve?: boolean; chatMode?: 'fast' | 'plan' }) {
    const { conn, agent } = startFakeAgent(dir)
    const m = manifest(dir)
    const session: ManagedAcpSession = {
      projectId: 'p1',
      providerId: 'claude-code',
      cwd: dir,
      conn,
      sessionId: 'sess-1',
      modes: { currentModeId: 'auto', availableModes: MODES },
      modelLabel: 'Opus 5.5',
      busy: true,
    }
    const events: AgentChatEventPayload[] = []
    const approvals: AgentCommandApprovalRequest[] = []
    const changed: string[][] = []
    const input: AcpTurnInput = {
      payload: payload(
        { activeContext: { openTabs: [], chatMode: opts.chatMode ?? 'fast' } },
        opts.temperament ?? 'trust',
      ),
      manifest: m,
      root: m.roots[0]!,
      providerId: 'claude-code',
      providerLabel: 'Claude Code',
      loginHint: 'sign in',
      session,
      sessionIsFresh: false,
      signal: new AbortController().signal,
    }
    await runAcpTurn(
      {
        emit: (e) => events.push(e),
        requestApproval: async (req) => {
          approvals.push(req)
          return { approved: opts.approve ?? true, scope: 'once' }
        },
        onFilesChanged: (paths) => changed.push(paths),
      },
      input,
    )
    return { events, approvals, changed, agent, session }
  }

  it('maps a trust-mode turn to routing, activities, an edit review card, and done', async () => {
    const { events, approvals, changed, agent } = await run({ approve: true })

    expect(agent.calls.find((c) => c.method === 'session/set_mode')?.params.modeId).toBe('default')

    const started = events.find((e) => e.phase === 'turn_started')
    expect(started && started.phase === 'turn_started' && started.routing.provider).toEqual({
      id: 'claude-code',
      label: 'Claude Code',
    })
    expect(started && started.phase === 'turn_started' && started.routing.modelLabel).toBe('Opus 5.5')

    expect(approvals).toHaveLength(1)
    expect(approvals[0]!.kind).toBe('edit')
    expect(approvals[0]!.diffs?.[0]).toMatchObject({ oldText: '# Demo\n' })
    expect(approvals[0]!.diffs?.[0]!.newText).toContain('## Usage')

    const text = events
      .filter((e): e is Extract<AgentChatEventPayload, { phase: 'final_chunk' }> => e.phase === 'final_chunk')
      .map((e) => e.delta)
      .join('')
    expect(text).toBe('Adding a usage section.\n\nDone.')

    const activityIds = events.flatMap((e) => (e.phase === 'activity' ? [e.activity.id] : []))
    expect(activityIds).toEqual(expect.arrayContaining(['acp-plan', 'acp-t1', 'acp-t2']))
    expect(events.at(-1)).toEqual({ streamId: 's1', phase: 'done', turnOutcome: 'complete' })

    expect(readFileSync(join(dir, 'README.md'), 'utf8')).toContain('## Usage')
    expect(changed.flat()).toContain(join(dir, 'README.md'))
  })

  it('leaves the file untouched when the user rejects the edit', async () => {
    const { events, approvals } = await run({ approve: false })
    expect(approvals).toHaveLength(1)
    expect(readFileSync(join(dir, 'README.md'), 'utf8')).toBe('# Demo\n')
    const rejected = events.find((e) => e.phase === 'activity' && e.activity.status === 'rejected')
    expect(rejected).toBeTruthy()
  })

  it('auto-allows edits in velocity mode and uses the accept-edits session mode', async () => {
    const { approvals, agent } = await run({ temperament: 'velocity' })
    expect(approvals).toHaveLength(0)
    expect(agent.calls.find((c) => c.method === 'session/set_mode')?.params.modeId).toBe('acceptEdits')
    expect(readFileSync(join(dir, 'README.md'), 'utf8')).toContain('## Usage')
  })

  it('switches the agent into its plan mode for Plan turns', async () => {
    const { agent } = await run({ chatMode: 'plan', approve: false })
    expect(agent.calls.find((c) => c.method === 'session/set_mode')?.params.modeId).toBe('plan')
    // The agent has a real plan mode, so no plan-only instruction is added to the prompt.
    const prompt = agent.calls.find((c) => c.method === 'session/prompt')?.params as unknown as {
      prompt: Array<{ text?: string }>
    }
    expect(prompt.prompt[0]?.text).not.toContain('GrokForge is in Plan mode')
  })
})

describe('addSnippetLineNumbers', () => {
  it('locates an edit snippet in the file so the card shows real line numbers', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gf-acp-snippet-'))
    try {
      const file = join(dir, 'cli.js')
      writeFileSync(file, '#!/usr/bin/env node\nimport { split } from "./split.js"\n\nconst x = 1\n')
      const diffs = [{ path: file, oldText: 'const x = 1', newText: 'const x = 2' }]
      await addSnippetLineNumbers(diffs, manifest(dir).roots)
      expect(diffs[0]).toMatchObject({ startLine: 4 })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('ACP turn helpers', () => {
  it('picks session modes by chat mode and temperament', () => {
    expect(pickSessionModeId(MODES, 'fast', 'trust')).toBe('default')
    expect(pickSessionModeId(MODES, 'fast', 'velocity')).toBe('acceptEdits')
    expect(pickSessionModeId(MODES, 'plan', 'velocity')).toBe('plan')
    expect(pickSessionModeId([{ id: 'agent' }], 'plan', 'trust')).toBeNull()
    expect(pickSessionModeId(undefined, 'fast', 'trust')).toBeNull()
  })

  it('auto-allows reads always, edits only in velocity, never commands', () => {
    expect(shouldAutoAllow('read', 'trust')).toBe(true)
    expect(shouldAutoAllow('edit', 'trust')).toBe(false)
    expect(shouldAutoAllow('edit', 'velocity')).toBe(true)
    expect(shouldAutoAllow('execute', 'velocity')).toBe(false)
    expect(shouldAutoAllow('delete', 'velocity')).toBe(false)
  })

  it('prefers one-shot permission options', () => {
    const options = [
      { optionId: 'a', name: 'Always', kind: 'allow_always' },
      { optionId: 'o', name: 'Once', kind: 'allow_once' },
      { optionId: 'r', name: 'No', kind: 'reject_once' },
    ]
    expect(pickPermissionOption(options, true)?.optionId).toBe('o')
    expect(pickPermissionOption(options, false)?.optionId).toBe('r')
    expect(pickPermissionOption([{ optionId: 'x', name: 'x', kind: 'allow_always' }], false)).toBeNull()
  })

  it('adds a plan-only instruction when the agent has no plan mode', () => {
    const dir = '/tmp/gf-fixture'
    const m = manifest(dir)
    const blocks = buildPromptBlocks(
      {
        payload: payload({
          activeContext: { openTabs: [{ path: `${dir}/a.ts`, dirty: true }], chatMode: 'plan', activeFilePath: `${dir}/a.ts` },
        }),
        manifest: m,
        root: m.roots[0]!,
        providerId: 'grok-build',
        providerLabel: 'Grok Build',
        loginHint: '',
        session: {} as ManagedAcpSession,
        sessionIsFresh: false,
        signal: new AbortController().signal,
      },
      true,
    )
    const text = (blocks[0] as { text: string }).text
    expect(text).toContain('Add a usage section')
    expect(text).toContain('File open in the editor: /tmp/gf-fixture/a.ts')
    expect(text).toContain('unsaved changes')
    expect(text).toContain('Plan mode')
  })

  it('reads model labels from Claude configOptions and Grok modelState', () => {
    expect(
      modelLabelFrom(null, {
        sessionId: 's',
        configOptions: [
          {
            id: 'model',
            currentValue: 'default',
            options: [{ value: 'default', name: 'Default (recommended)', description: 'Opus 5.5' }],
          },
        ],
      }),
    ).toBe('Opus 5.5')
    expect(
      modelLabelFrom({ protocolVersion: 1, _meta: { modelState: { currentModelId: 'grok-4.6' } } } as never, {
        sessionId: 's',
      }),
    ).toBe('grok-4.6')
  })
})
