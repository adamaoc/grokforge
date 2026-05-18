import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { shell } from 'electron'
import { applyWorkspaceFsMutate } from './workspace-fs-mutate'
import type { GrokProjectManifest } from './manifest'

vi.mock('electron', () => ({
  shell: {
    showItemInFolder: vi.fn(),
    trashItem: vi.fn(async () => undefined),
  },
}))

function testManifest(rootAbs: string): GrokProjectManifest {
  return {
    version: '1.2',
    name: 'Mutation Test',
    roots: [{ id: 'root', path: rootAbs, type: 'code', label: 'Main' }],
    ignore: ['**/node_modules/**', '**/.git/**'],
    models: {
      default: 'grok-code-fast-1',
      planning: 'grok-4.3',
      execution: 'grok-code-fast-1',
      reasoning: 'grok-4.20-reasoning',
      voice: 'grok-voice-think-fast-1.0',
    },
    voice: {
      enabled: true,
      defaultVoiceMode: 'off',
      autoListen: false,
      speakResponses: false,
    },
    context: { alwaysInclude: [] },
    metadata: { createdAt: 't', lastOpened: 't', tags: [] },
  }
}

describe('applyWorkspaceFsMutate', () => {
  beforeEach(() => {
    vi.mocked(shell.showItemInFolder).mockClear()
    vi.mocked(shell.trashItem).mockReset()
    vi.mocked(shell.trashItem).mockResolvedValue(undefined)
  })

  it('creates a file inside a workspace root', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-mutate-'))
    const result = await applyWorkspaceFsMutate(testManifest(root), {
      op: 'touch',
      parentDir: root,
      name: 'notes.md',
    })
    expect(result).toEqual({ ok: true })
    expect(existsSync(join(root, 'notes.md'))).toBe(true)
  })

  it('rejects outside paths and workspace root deletion/rename', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-mutate-'))
    const outside = join(tmpdir(), 'outside.txt')
    expect(await applyWorkspaceFsMutate(testManifest(root), { op: 'remove', path: outside })).toEqual({
      ok: false,
      error: 'Path outside workspace roots',
    })
    expect(await applyWorkspaceFsMutate(testManifest(root), { op: 'remove', path: root })).toEqual({
      ok: false,
      error: 'Cannot delete a workspace root folder',
    })
    expect(await applyWorkspaceFsMutate(testManifest(root), { op: 'rename', path: root, newName: 'next' })).toEqual({
      ok: false,
      error: 'Cannot rename a workspace root folder',
    })
  })

  it('rejects unsafe names and rename collisions with friendly copy', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-mutate-'))
    const original = join(root, 'original.txt')
    const collision = join(root, 'taken.txt')
    writeFileSync(original, 'one')
    writeFileSync(collision, 'two')

    expect(await applyWorkspaceFsMutate(testManifest(root), { op: 'touch', parentDir: root, name: 'bad/name' })).toEqual({
      ok: false,
      error: 'Invalid name',
    })
    expect(await applyWorkspaceFsMutate(testManifest(root), { op: 'touch', parentDir: root, name: 'bad\nname' })).toEqual({
      ok: false,
      error: 'Invalid name',
    })
    expect(await applyWorkspaceFsMutate(testManifest(root), { op: 'rename', path: original, newName: 'taken.txt' })).toEqual({
      ok: false,
      error: 'A file or folder with that name already exists',
    })
  })

  it('moves deletes to Trash and does not fall back to permanent removal on failure', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-mutate-'))
    const doomed = join(root, 'doomed.txt')
    writeFileSync(doomed, 'keep for trash test')

    expect(await applyWorkspaceFsMutate(testManifest(root), { op: 'remove', path: doomed })).toEqual({ ok: true })
    expect(shell.trashItem).toHaveBeenCalledWith(doomed)

    vi.mocked(shell.trashItem).mockRejectedValueOnce(new Error('trash blocked'))
    expect(await applyWorkspaceFsMutate(testManifest(root), { op: 'remove', path: doomed })).toEqual({
      ok: false,
      error: 'Could not move this item to Trash. Nothing was permanently deleted.',
    })
    expect(existsSync(doomed)).toBe(true)
  })

  it('reveals existing in-root paths and rejects missing targets', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-mutate-'))
    const folder = join(root, 'src')
    mkdirSync(folder)
    expect(await applyWorkspaceFsMutate(testManifest(root), { op: 'reveal', path: folder })).toEqual({ ok: true })
    expect(shell.showItemInFolder).toHaveBeenCalledWith(folder)
    expect(await applyWorkspaceFsMutate(testManifest(root), { op: 'reveal', path: join(root, 'missing') })).toEqual({
      ok: false,
      error: 'Path does not exist',
    })
  })
})
