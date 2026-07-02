import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GrokProjectManifest } from '../../../main/project/manifest'
import { executeRunCommandHarnessTool } from '../run-command'
import type { HarnessToolRunContext } from '../tool-context'

function testManifest(rootPath: string, rootId = 'root'): GrokProjectManifest {
  return {
    version: 1,
    name: 'Test',
    roots: [{ id: rootId, path: rootPath, label: 'Test root' }],
    ignore: [],
    context: {},
    models: { default: 'grok-build-0.1' },
    voice: { defaultVoiceMode: 'off' },
  }
}

function harnessContext(
  dir: string,
  overrides?: Partial<HarnessToolRunContext>,
): HarnessToolRunContext {
  const emitted: unknown[] = []
  return {
    projectId: 'proj-1',
    streamId: 'stream-1',
    manifest: testManifest(dir),
    activeContext: { openTabs: [], chatMode: 'fast' },
    signal: new AbortController().signal,
    commandApproval: {
      requestApproval: vi.fn(async () => true),
    },
    emit: (payload) => {
      emitted.push(payload)
    },
    updateToolActivity: vi.fn(),
    ...overrides,
  }
}

describe('executeRunCommandHarnessTool', () => {
  let dir = ''

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
    dir = ''
  })

  it('defaults rootId to the first manifest root for single-root projects', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gf-harness-rc-'))
    const ctx = harnessContext(dir)
    const result = await executeRunCommandHarnessTool(
      ctx,
      JSON.stringify({ command: 'touch gf-harness-marker.txt', purpose: 'smoke test' }),
      'call-1',
      'act-1',
    )
    expect(result.ok).toBe(true)
    const parsed = JSON.parse(result.text) as { ok: boolean; output?: string }
    expect(parsed.ok).toBe(true)
    expect(parsed.ok).toBe(true)
    expect(ctx.commandApproval.requestApproval).toHaveBeenCalledOnce()
  })

  it('returns rejected JSON when user declines approval', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gf-harness-rc-'))
    const ctx = harnessContext(dir, {
      commandApproval: { requestApproval: vi.fn(async () => false) },
    })
    const result = await executeRunCommandHarnessTool(
      ctx,
      JSON.stringify({ command: 'touch gf-harness-reject.txt', purpose: 'reject path' }),
      'call-2',
      'act-2',
    )
    expect(result.ok).toBe(false)
    const parsed = JSON.parse(result.text) as { rejected?: boolean }
    expect(parsed.rejected).toBe(true)
    expect(ctx.updateToolActivity).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'rejected', title: 'Command rejected' }),
    )
  })

  it('blocks hard-deny commands without calling approval', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gf-harness-rc-'))
    const ctx = harnessContext(dir)
    const result = await executeRunCommandHarnessTool(
      ctx,
      JSON.stringify({
        command: 'rm -rf /',
        purpose: 'should never run',
      }),
      'call-3',
      'act-3',
    )
    expect(result.ok).toBe(false)
    expect(ctx.commandApproval.requestApproval).not.toHaveBeenCalled()
    const parsed = JSON.parse(result.text) as { blocked?: boolean }
    expect(parsed.blocked).toBe(true)
  })
})
