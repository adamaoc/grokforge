import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../harness-support/context/index-store', () => ({
  loadWorkspaceIndex: () => null,
}))
import type { GrokProjectManifest } from '../../../main/project/manifest'
import {
  buildPlanProjectSnapshot,
  formatPlanProjectContextSection,
} from '../project-snapshot'

function manifest(rootPath: string): GrokProjectManifest {
  return {
    version: 1,
    name: 'Snap',
    roots: [{ id: 'root', path: rootPath, label: 'Snap' }],
    ignore: [],
    context: {},
    models: { default: 'grok-build-0.1' },
    voice: { defaultVoiceMode: 'off' },
  }
}

function multiRootManifest(rootA: string, rootB: string): GrokProjectManifest {
  return {
    ...manifest(rootA),
    roots: [
      { id: 'app', path: rootA, label: 'App' },
      { id: 'docs', path: rootB, label: 'Docs' },
    ],
  }
}

describe('buildPlanProjectSnapshot', () => {
  let dir = ''

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
    dir = ''
  })

  it('discovers README and AGENTS.md at workspace root', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gf-plan-snap-'))
    await writeFile(join(dir, 'README.md'), '# Hi\n', 'utf-8')
    await writeFile(join(dir, 'AGENTS.md'), '# Agents\n', 'utf-8')
    await mkdir(join(dir, 'docs'))
    await writeFile(join(dir, 'docs', 'guide.md'), '# Guide\n', 'utf-8')

    const snap = buildPlanProjectSnapshot(manifest(dir), 'proj-no-index')
    expect(snap.existingDocPaths).toContain('README.md')
    expect(snap.existingDocPaths).toContain('AGENTS.md')
    expect(snap.docsDirectoryEntries).toContain('docs/guide.md')

    const section = formatPlanProjectContextSection(snap, manifest(dir))
    expect(section).toContain('README.md')
    expect(section).toContain('AGENTS.md')
    expect(section).toContain('read_file')
    expect(section).toContain('new** doc or file')
  })

  it('discovers docs across all workspace roots with root-prefixed paths', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gf-plan-snap-'))
    const appRoot = join(dir, 'app')
    const docsRoot = join(dir, 'docs-root')
    await mkdir(appRoot)
    await mkdir(docsRoot)
    await writeFile(join(appRoot, 'README.md'), '# App\n', 'utf-8')
    await writeFile(join(docsRoot, 'AGENTS.md'), '# Agents\n', 'utf-8')

    const snap = buildPlanProjectSnapshot(multiRootManifest(appRoot, docsRoot), 'proj-no-index')

    expect(snap.existingDocPaths).toContain('app:README.md')
    expect(snap.existingDocPaths).toContain('docs:AGENTS.md')
    expect(snap.workspaceRoots).toEqual([
      { id: 'app', label: 'App' },
      { id: 'docs', label: 'Docs' },
    ])
  })
})
