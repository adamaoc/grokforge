import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GrokProjectManifest } from '../../../main/project/manifest'
import { computeAgentContentHash } from '../../agent/content-hash'
import { HarnessProposalAccumulator } from '../accumulator'
import { executeTool } from '../../tools/tools'
import type { HarnessToolEnv } from '../../workspace/paths'
import type { HarnessToolRunContext } from '../../tools/tool-context'

function testManifest(rootPath: string): GrokProjectManifest {
  return {
    version: '1',
    name: 'Proposal Mirror Test',
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

function proposalToolContext(
  streamId: string,
  manifest: GrokProjectManifest,
  onProposal: ReturnType<typeof vi.fn>,
): HarnessToolRunContext {
  const accumulator = new HarnessProposalAccumulator((proposal) => {
    onProposal(proposal)
  })
  return {
    projectId: 'proj-1',
    streamId,
    manifest,
    activeContext: {
      openTabs: [],
      chatMode: 'fast',
    },
    activeRootId: 'root',
    signal: new AbortController().signal,
    commandApproval: { requestApproval: vi.fn(async () => false) },
    proposalAccumulator: accumulator,
    emit: vi.fn(),
    updateToolActivity: vi.fn(),
  }
}

describe('harness proposal mirror', () => {
  let dir = ''

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
    dir = ''
  })

  it('write_file emits edit_proposal and does not write disk', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gf-proposal-'))
    const manifest = testManifest(dir)
    const env: HarnessToolEnv = { manifest, projectId: 'proj-1' }
    const onProposal = vi.fn()
    const toolContext = proposalToolContext('stream-1', manifest, onProposal)

    const res = await executeTool(env, 'write_file', JSON.stringify({ path: 'a.txt', content: 'hi' }), undefined, {
      toolContext,
      toolCallId: 'tc-1',
      activityId: 'act-1',
    })

    expect(res.ok).toBe(true)
    expect(res.text).toContain('edit proposal')
    expect(res.text).toContain('nothing written to disk')
    expect(onProposal).toHaveBeenCalledOnce()
    const proposal = onProposal.mock.calls[0]![0] as {
      batch: { operations: Array<{ path: string; content: string }> }
    }
    expect(proposal.batch.operations).toHaveLength(1)
    expect(proposal.batch.operations[0]!.content).toBe('hi')
    expect(existsSync(join(dir, 'a.txt'))).toBe(false)
  })

  it('edit emits proposal and chains against accumulated content in the same turn', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gf-proposal-'))
    await writeFile(join(dir, 'x.txt'), 'aa bb cc', 'utf-8')
    const manifest = testManifest(dir)
    const env: HarnessToolEnv = { manifest, projectId: 'proj-1' }
    const onProposal = vi.fn()
    const toolContext = proposalToolContext('stream-2', manifest, onProposal)
    const opts = { toolContext, toolCallId: 'tc', activityId: 'act' }

    const readRes = await executeTool(env, 'read_file', JSON.stringify({ path: 'x.txt' }))
    const { contentHash } = JSON.parse(readRes.text) as { contentHash: string }

    const first = await executeTool(
      env,
      'edit',
      JSON.stringify({
        path: 'x.txt',
        expectedContentHash: contentHash,
        edits: [{ oldText: 'bb', newText: 'BB' }],
      }),
      undefined,
      opts,
    )
    expect(first.ok).toBe(true)
    expect(onProposal).toHaveBeenCalledOnce()

    const second = await executeTool(
      env,
      'edit',
      JSON.stringify({
        path: 'x.txt',
        expectedContentHash: contentHash,
        edits: [{ oldText: 'aa', newText: 'AA' }],
      }),
      undefined,
      opts,
    )
    expect(second.ok).toBe(true)
    expect(onProposal).toHaveBeenCalledTimes(2)

    const lastProposal = onProposal.mock.calls[1]![0] as {
      batch: { operations: Array<{ content: string }> }
    }
    expect(lastProposal.batch.operations[0]!.content).toBe('AA BB cc')
    expect(await readFile(join(dir, 'x.txt'), 'utf-8')).toBe('aa bb cc')
  })

  it('write_file proposal on existing file includes expectedOriginalContent', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gf-proposal-'))
    await writeFile(join(dir, 'old.txt'), 'before', 'utf-8')
    const manifest = testManifest(dir)
    const env: HarnessToolEnv = { manifest, projectId: 'proj-1' }
    const onProposal = vi.fn()
    const toolContext = proposalToolContext('stream-3', manifest, onProposal)

    await executeTool(
      env,
      'write_file',
      JSON.stringify({ path: 'old.txt', content: 'after' }),
      undefined,
      { toolContext, toolCallId: 'tc', activityId: 'act' },
    )

    const proposal = onProposal.mock.calls[0]![0] as {
      batch: {
        operations: Array<{
          expectedOriginalContent?: string | null
          expectedContentHash?: string
        }>
      }
    }
    const op = proposal.batch.operations[0]!
    expect(op.expectedOriginalContent).toBe('before')
    expect(op.expectedContentHash).toBe(computeAgentContentHash('before'))
  })
})