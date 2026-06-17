import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'

const userDataRoot = mkdtempSync(join(tmpdir(), 'gf-harness-tools-userdata-'))

vi.mock('electron', () => ({
  app: { getPath: () => userDataRoot },
}))

vi.mock('../../../main/project/store', async () => {
  const actual = await vi.importActual<typeof import('../../../main/project/store')>(
    '../../../main/project/store',
  )
  return {
    ...actual,
    projectDir: (projectId: string) => join(userDataRoot, 'workspace-projects', projectId),
  }
})
import { readFile } from 'node:fs/promises'
import { computeAgentContentHash } from '../../agent/content-hash'
import type { GrokProjectManifest } from '../../../main/project/manifest'
import { executeTool } from '../tools'
import type { HarnessToolEnv } from '../../workspace/paths'

function testEnv(rootPath: string, ignore: string[] = []): HarnessToolEnv {
  const manifest: GrokProjectManifest = {
    version: '1',
    name: 'Harness Tools Test',
    roots: [{ id: 'root', path: rootPath, label: 'Root', type: 'code' }],
    ignore,
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
  return { manifest }
}

describe('harness tools', () => {
  let dir: string

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
    rmSync(join(userDataRoot, 'workspace-projects'), { recursive: true, force: true })
  })

  it('write_file creates a file under workspace root', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gf-harness-'))
    const res = await executeTool(
      testEnv(dir),
      'write_file',
      JSON.stringify({ path: 'a.txt', content: 'hi' }),
    )
    expect(res.ok).toBe(true)
    expect(res.text).toContain('Wrote a.txt')
  })

  it('rejects paths that escape the workspace', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gf-harness-'))
    const res = await executeTool(
      testEnv(dir),
      'read_file',
      JSON.stringify({ path: '../../../etc/passwd' }),
    )
    expect(res.ok).toBe(false)
    expect(res.text).toContain('escapes workspace')
  })

  it('read_file returns contentHash JSON', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gf-harness-'))
    const env = testEnv(dir)
    await executeTool(env, 'write_file', JSON.stringify({ path: 'x.txt', content: 'hello' }))
    const res = await executeTool(env, 'read_file', JSON.stringify({ path: 'x.txt' }))
    expect(res.ok).toBe(true)
    const parsed = JSON.parse(res.text) as { rawContent: string; contentHash: string }
    expect(parsed.rawContent).toBe('hello')
    expect(parsed.contentHash).toBe(computeAgentContentHash('hello'))
  })

  it('workspace_index returns stored index JSON when projectId is set', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gf-harness-'))
    await writeFile(join(dir, 'needle.txt'), 'find me\n', 'utf-8')
    const projectId = 'proj-index-tool'
    const env: HarnessToolEnv = { manifest: testEnv(dir).manifest, projectId }
    const res = await executeTool(env, 'workspace_index', JSON.stringify({ refresh: true }))
    expect(res.ok).toBe(true)
    const parsed = JSON.parse(res.text) as { summary: { roots: unknown[] }; updatedAt: string }
    expect(parsed.summary.roots.length).toBeGreaterThan(0)
    expect(parsed.updatedAt).toBeTruthy()
  })

  it('search_workspace finds a query match', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gf-harness-'))
    await writeFile(join(dir, 'needle.txt'), 'unique-needle-token\n', 'utf-8')
    const env: HarnessToolEnv = { manifest: testEnv(dir).manifest, projectId: 'proj-search-tool' }
    const res = await executeTool(env, 'search_workspace', JSON.stringify({ query: 'unique-needle-token' }))
    expect(res.ok).toBe(true)
    const parsed = JSON.parse(res.text) as { results: Array<{ path: string }> }
    expect(parsed.results.some((r) => r.path.endsWith('needle.txt'))).toBe(true)
  })

  it('edit applies on current disk when hash is stale but oldText matches', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gf-harness-'))
    const env = testEnv(dir)
    await executeTool(env, 'write_file', JSON.stringify({ path: 'x.txt', content: 'aa bb cc' }))
    const readRes = await executeTool(env, 'read_file', JSON.stringify({ path: 'x.txt' }))
    const { contentHash: hashAfterRead } = JSON.parse(readRes.text) as { contentHash: string }
    const first = await executeTool(
      env,
      'edit',
      JSON.stringify({
        path: 'x.txt',
        expectedContentHash: hashAfterRead,
        edits: [{ oldText: 'bb', newText: 'BB' }],
      }),
    )
    expect(first.ok).toBe(true)
    const second = await executeTool(
      env,
      'edit',
      JSON.stringify({
        path: 'x.txt',
        expectedContentHash: hashAfterRead,
        edits: [{ oldText: 'aa', newText: 'AA' }],
      }),
    )
    expect(second.ok).toBe(true)
    expect(second.text).toContain('file changed since read_file')
    const onDisk = await readFile(join(dir, 'x.txt'), 'utf-8')
    expect(onDisk).toBe('AA BB cc')
  })

  it('run_command requires harness tool context', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gf-harness-'))
    const res = await executeTool(
      testEnv(dir),
      'run_command',
      JSON.stringify({ command: 'echo hi', purpose: 'test' }),
    )
    expect(res.ok).toBe(false)
    const parsed = JSON.parse(res.text) as { error?: string }
    expect(parsed.error).toContain('missing harness tool context')
  })

  it('edit patches an existing file', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gf-harness-'))
    const env = testEnv(dir)
    await executeTool(env, 'write_file', JSON.stringify({ path: 'x.txt', content: 'hello world' }))
    const readRes = await executeTool(env, 'read_file', JSON.stringify({ path: 'x.txt' }))
    const { contentHash } = JSON.parse(readRes.text) as { contentHash: string }
    const editRes = await executeTool(
      env,
      'edit',
      JSON.stringify({
        path: 'x.txt',
        expectedContentHash: contentHash,
        edits: [{ oldText: 'world', newText: 'GrokForge' }],
      }),
    )
    expect(editRes.ok).toBe(true)
    const onDisk = await readFile(join(dir, 'x.txt'), 'utf-8')
    expect(onDisk).toBe('hello GrokForge')
  })

  it('list_files hides ignored entries', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gf-harness-'))
    await mkdir(join(dir, 'visible'))
    await mkdir(join(dir, 'ignored'))
    await writeFile(join(dir, 'visible', 'keep.txt'), 'ok')
    await writeFile(join(dir, 'ignored', 'secret.txt'), 'nope')

    const res = await executeTool(
      testEnv(dir, ['ignored']),
      'list_files',
      JSON.stringify({ path: '.' }),
    )
    expect(res.ok).toBe(true)
    expect(res.text).toContain('visible/')
    expect(res.text).not.toContain('ignored/')
  })
})