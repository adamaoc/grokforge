import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GrokProjectManifest } from './manifest'

const userDataRoot = mkdtempSync(join(tmpdir(), 'grokforge-pins-'))

vi.mock('electron', () => ({
  app: {
    getPath: () => userDataRoot,
  },
}))

vi.mock('./app-project-store', async () => {
  const actual = await vi.importActual<typeof import('./app-project-store')>('./app-project-store')
  return {
    ...actual,
    projectDir: (projectId: string) => join(userDataRoot, 'workspace-projects', projectId),
  }
})

import { validateContextPinsForManifest } from '../harness/context/context-pins-store'

function manifest(rootPath: string): GrokProjectManifest {
  return {
    $schema: 'https://grok.dev/schemas/grokproject-v1.2.json',
    version: '1.2',
    name: 'Pins test',
    description: '',
    roots: [{ id: 'root', path: rootPath, type: 'code', label: 'Root' }],
    ignore: ['**/node_modules'],
    models: {
      default: 'grok-build-0.1',
      planning: 'grok-4.3',
      execution: 'grok-build-0.1',
      reasoning: 'grok-4.20-0309-reasoning',
      voice: 'grok-voice-latest',
    },
    voice: {
      enabled: true,
      defaultVoiceMode: 'off',
      autoListen: false,
      speakResponses: false,
    },
    context: { alwaysInclude: [], customInstructions: '' },
    metadata: {
      createdAt: '2026-01-01T00:00:00.000Z',
      lastOpened: '2026-01-01T00:00:00.000Z',
      tags: [],
    },
  }
}

describe('validateContextPinsForManifest', () => {
  let rootPath: string

  beforeEach(() => {
    rootPath = mkdtempSync(join(tmpdir(), 'grokforge-pin-root-'))
    writeFileSync(join(rootPath, 'readme.md'), '# hi\n', 'utf-8')
    mkdirSync(join(rootPath, 'src'), { recursive: true })
  })

  afterEach(() => {
    rmSync(rootPath, { recursive: true, force: true })
  })

  it('accepts valid file and folder pins under roots', () => {
    const filePath = join(rootPath, 'readme.md')
    const folderPath = join(rootPath, 'src')
    const res = validateContextPinsForManifest(manifest(rootPath), [
      { type: 'file', path: filePath },
      { type: 'folder', path: folderPath },
    ])
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.pins[0]?.type).toBe('file')
      expect(res.pins[1]?.type).toBe('folder')
      expect(res.pins[0]?.path).toBe(resolve(filePath))
    }
  })

  it('rejects paths outside workspace roots', () => {
    const res = validateContextPinsForManifest(manifest(rootPath), [
      { type: 'file', path: '/etc/passwd' },
    ])
    expect(res.ok).toBe(false)
  })
})
