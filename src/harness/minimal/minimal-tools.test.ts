import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, afterEach } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { computeAgentContentHash } from '../agent/content-hash'
import { executeMinimalTool } from './tools'

describe('minimal tools', () => {
  let dir: string

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it('write_file creates a file under workspace root', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gf-minimal-'))
    const res = await executeMinimalTool(dir, 'write_file', JSON.stringify({ path: 'a.txt', content: 'hi' }))
    expect(res.ok).toBe(true)
    expect(res.text).toContain('Wrote a.txt')
  })

  it('rejects paths that escape the workspace', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gf-minimal-'))
    const res = await executeMinimalTool(dir, 'read_file', JSON.stringify({ path: '../../../etc/passwd' }))
    expect(res.ok).toBe(false)
    expect(res.text).toContain('escapes workspace')
  })

  it('read_file returns contentHash JSON', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gf-minimal-'))
    await executeMinimalTool(dir, 'write_file', JSON.stringify({ path: 'x.txt', content: 'hello' }))
    const res = await executeMinimalTool(dir, 'read_file', JSON.stringify({ path: 'x.txt' }))
    expect(res.ok).toBe(true)
    const parsed = JSON.parse(res.text) as { rawContent: string; contentHash: string }
    expect(parsed.rawContent).toBe('hello')
    expect(parsed.contentHash).toBe(computeAgentContentHash('hello'))
  })

  it('edit applies on current disk when hash is stale but oldText matches', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gf-minimal-'))
    await executeMinimalTool(dir, 'write_file', JSON.stringify({ path: 'x.txt', content: 'aa bb cc' }))
    const readRes = await executeMinimalTool(dir, 'read_file', JSON.stringify({ path: 'x.txt' }))
    const { contentHash: hashAfterRead } = JSON.parse(readRes.text) as { contentHash: string }
    const first = await executeMinimalTool(
      dir,
      'edit',
      JSON.stringify({
        path: 'x.txt',
        expectedContentHash: hashAfterRead,
        edits: [{ oldText: 'bb', newText: 'BB' }],
      }),
    )
    expect(first.ok).toBe(true)
    // Second edit reuses pre-first-edit hash (same failure mode as multi-edit one turn).
    const second = await executeMinimalTool(
      dir,
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

  it('edit patches an existing file', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gf-minimal-'))
    await executeMinimalTool(dir, 'write_file', JSON.stringify({ path: 'x.txt', content: 'hello world' }))
    const readRes = await executeMinimalTool(dir, 'read_file', JSON.stringify({ path: 'x.txt' }))
    const { contentHash } = JSON.parse(readRes.text) as { contentHash: string }
    const editRes = await executeMinimalTool(
      dir,
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
})
