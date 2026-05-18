import { describe, expect, it, vi } from 'vitest'
import { resolve } from 'node:path'
import type { GrokProjectManifest } from './manifest'
import type { StoredWorkspaceIndex } from './agent-index-store'
import { rankRetrievalCandidates } from './agent-retrieval'

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/grokforge-test-user-data',
  },
}))

const rootPath = resolve('/tmp/grokforge-retrieval-root')

function manifest(): GrokProjectManifest {
  return {
    $schema: 'https://grok.dev/schemas/grokproject-v1.2.json',
    version: '1.2',
    name: 'Test Project',
    description: '',
    roots: [{ id: 'root', path: rootPath, type: 'code', label: 'Root' }],
    ignore: ['**/node_modules', '**/.env'],
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
    context: {
      alwaysInclude: [],
      customInstructions: '',
    },
    metadata: {
      createdAt: '2026-01-01T00:00:00.000Z',
      lastOpened: '2026-01-01T00:00:00.000Z',
      tags: [],
    },
  }
}

function file(relativePath: string, kinds: StoredWorkspaceIndex['intelligence']['files'][number]['kinds'], symbols: string[] = []) {
  return {
    rootId: 'root',
    path: resolve(rootPath, relativePath),
    relativePath,
    basename: relativePath.split('/').pop() ?? relativePath,
    ext: relativePath.includes('.') ? `.${relativePath.split('.').pop() ?? ''}` : '',
    kinds,
    symbols,
    likelySubject: relativePath.includes('.test.') ? relativePath.split('/').pop()?.replace(/\.(test|spec)\..+$/, '') : undefined,
    size: 100,
  }
}

function index(overrides: Partial<StoredWorkspaceIndex> = {}): StoredWorkspaceIndex {
  return {
    version: 2,
    updatedAt: new Date().toISOString(),
    rootPaths: [rootPath],
    ignorePatterns: [],
    summary: { roots: [], warnings: [] },
    intelligence: {
      version: 1,
      files: [
        file('src/main/main.ts', ['source', 'entrypoint'], ['createWindow']),
        file('src/main/git.test.ts', ['source', 'test'], ['getGitStatusForRoot']),
        file('src/renderer/src/components/SettingsPage.tsx', ['source', 'component'], ['SettingsPage']),
        file('docs/architecture.md', ['docs']),
        file('package.json', ['package'], []),
        file('vite.config.ts', ['source', 'config'], []),
      ],
      packages: [],
      stats: {
        fileCountScanned: 6,
        skippedIgnored: 2,
        skippedGenerated: 1,
        skippedBinary: 1,
        skippedSensitive: 3,
        skippedLarge: 1,
        errors: [],
      },
    },
    truncated: false,
    warnings: [],
    ...overrides,
  }
}

describe('rankRetrievalCandidates', () => {
  it('scores exact path mentions above other matches', () => {
    const result = rankRetrievalCandidates({
      manifest: manifest(),
      index: index(),
      activeContext: { openTabs: [], chatMode: 'fast' },
      userText: 'Please inspect src/renderer/src/components/SettingsPage.tsx for the settings UI copy.',
    })

    expect(result.candidates[0]?.path).toBe(resolve(rootPath, 'src/renderer/src/components/SettingsPage.tsx'))
    expect(result.candidates[0]?.bucket).toBe('exact_path')
  })

  it('boosts tests for bug and regression questions', () => {
    const result = rankRetrievalCandidates({
      manifest: manifest(),
      index: index(),
      activeContext: { openTabs: [], chatMode: 'fast' },
      userText: 'What tests cover git status regressions?',
    })

    expect(result.candidates[0]?.path).toBe(resolve(rootPath, 'src/main/git.test.ts'))
    expect(result.candidates[0]?.reasons.join(' ')).toContain('test')
  })

  it('boosts docs for architecture and product questions', () => {
    const result = rankRetrievalCandidates({
      manifest: manifest(),
      index: index(),
      activeContext: { openTabs: [], chatMode: 'fast' },
      userText: 'Explain the project architecture docs.',
    })

    expect(result.candidates[0]?.path).toBe(resolve(rootPath, 'docs/architecture.md'))
  })

  it('marks active dirty tabs and carries skipped safety stats', () => {
    const active = resolve(rootPath, 'src/main/main.ts')
    const result = rankRetrievalCandidates({
      manifest: manifest(),
      index: index(),
      activeContext: { activeFilePath: active, openTabs: [{ path: active, dirty: true }], chatMode: 'fast' },
      userText: 'What is this file doing?',
    })

    expect(result.candidates[0]?.path).toBe(active)
    expect(result.candidates[0]?.dirty).toBe(true)
    expect(result.skipped.sensitive).toBe(3)
  })

  it('boosts attached files and folders above unrelated lexical matches', () => {
    const attachedFile = resolve(rootPath, 'docs/architecture.md')
    const result = rankRetrievalCandidates({
      manifest: manifest(),
      index: index(),
      activeContext: {
        openTabs: [],
        chatMode: 'fast',
        attachments: [
          { type: 'file', path: attachedFile },
          { type: 'folder', path: resolve(rootPath, 'src/renderer') },
        ],
      },
      userText: 'Update settings copy',
    })

    expect(result.candidates[0]?.path).toBe(attachedFile)
    expect(result.candidates[0]?.bucket).toBe('attachment')
    expect(result.candidates.some((c) => c.path.endsWith('SettingsPage.tsx') && c.bucket === 'attachment')).toBe(true)
  })

  it('represents stale index metadata', () => {
    const result = rankRetrievalCandidates({
      manifest: manifest(),
      index: index({ updatedAt: '2020-01-01T00:00:00.000Z' }),
      activeContext: { openTabs: [], chatMode: 'fast' },
      userText: 'Where is the app entrypoint?',
    })

    expect(result.stale).toBe(true)
    expect(result.staleReason).toContain('older')
  })
})
