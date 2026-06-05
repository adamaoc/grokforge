import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import {
  buildAgentContextPreview,
  buildChatSystemPrompt,
  buildWorkspaceIndexSummary,
  candidatePathsForContextPath,
  CONTEXT_FILE_MAX_BYTES,
  getAllowedContextBases,
  isPathUnderAnyBase,
  recordAgentRetrievalDebug,
} from '../harness-support/context/context'
import { AGENT_CONTEXT_BUDGETS } from '../harness-support/compaction/context-budget-contract'
import type { GrokProjectManifest } from './manifest'

function testManifest(overrides: Partial<GrokProjectManifest> = {}): GrokProjectManifest {
  const base: GrokProjectManifest = {
    version: '1.2',
    name: 'Test',
    roots: [{ id: 'r1', path: join(tmpdir(), 'gf-root-placeholder'), type: 'code', label: 'Root' }],
    models: {
      default: 'grok-build-0.1',
      planning: 'grok-4.3',
      execution: 'grok-build-0.1',
      reasoning: 'grok-4.20-0309-reasoning',
      voice: 'grok-voice-latest',
    },
    voice: {
      enabled: false,
      defaultVoiceMode: 'off',
      autoListen: false,
      speakResponses: false,
    },
    context: { alwaysInclude: [] },
    metadata: { createdAt: new Date().toISOString(), lastOpened: new Date().toISOString(), tags: [] },
  }
  return { ...base, ...overrides, roots: overrides.roots ?? base.roots, context: overrides.context ?? base.context }
}

describe('agent-context path helpers', () => {
  it('dedupes identical root paths when building candidates', () => {
    const pr = mkdtempSync(join(tmpdir(), 'gf-dedupe-'))
    expect(candidatePathsForContextPath('note.txt', [{ path: pr }, { path: pr }])).toEqual([resolve(pr, 'note.txt')])
  })

  it('lists distinct workspace roots for relative entries', () => {
    const pr = mkdtempSync(join(tmpdir(), 'gf-two-'))
    const other = join(pr, 'lib')
    mkdirSync(other, { recursive: true })
    expect(candidatePathsForContextPath('x.md', [{ path: pr }, { path: other }])).toEqual([
      resolve(pr, 'x.md'),
      resolve(other, 'x.md'),
    ])
  })

  it('rejects path traversal outside bases when filtering', () => {
    const bases = getAllowedContextBases([{ path: join('/workspace', 'proj', 'app') }])
    const escaped = resolve(join('/workspace', 'proj'), '..', 'outside', 'secret.txt')
    expect(isPathUnderAnyBase(escaped, bases)).toBe(false)
  })
})

describe('buildChatSystemPrompt', () => {
  it('includes project name, roots, and custom instructions', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gf-sys-'))
    const appRoot = join(dir, 'app')
    mkdirSync(appRoot, { recursive: true })
    const manifest = testManifest({
      roots: [{ id: 'r1', path: appRoot, type: 'code', label: 'App', git: false }],
      context: {
        alwaysInclude: [],
        customInstructions: 'Use conventional commits.',
      },
    })
    const { systemPrompt } = buildChatSystemPrompt(manifest)
    expect(systemPrompt).toContain('Test')
    expect(systemPrompt).toContain('App')
    expect(systemPrompt).toContain(appRoot)
    expect(systemPrompt).toContain('Use conventional commits')
    expect(systemPrompt).toContain('Truthfulness')
  })

  it('appends harness profile sections when harnessProfileKey is set', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gf-sys-harness-'))
    mkdirSync(dir, { recursive: true })
    const manifest = testManifest({
      roots: [{ id: 'r1', path: dir, type: 'code', label: 'App' }],
      context: { alwaysInclude: [] },
    })
    const base = buildChatSystemPrompt(manifest).systemPrompt
    const withProfile = buildChatSystemPrompt(manifest, { harnessProfileKey: 'grok_4_3' }).systemPrompt
    expect(withProfile).toContain(base.slice(0, 200))
    expect(withProfile).toContain('Harness profile (capable planning)')
    expect(withProfile).toContain('Tool-use bias (capable)')
  })

  it('includes proactive workspace exploration rules', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gf-sys-explore-'))
    mkdirSync(dir, { recursive: true })
    const manifest = testManifest({
      roots: [{ id: 'r1', path: dir, type: 'code', label: 'App' }],
      context: { alwaysInclude: [] },
    })
    const { systemPrompt } = buildChatSystemPrompt(manifest)
    expect(systemPrompt).toContain('## Workspace exploration')
    expect(systemPrompt).toContain('search_workspace')
    expect(systemPrompt).toContain('list_directory')
    expect(systemPrompt).toContain('Do **not** ask for a path unless multiple equally likely targets remain')
    expect(systemPrompt).toContain('run discovery tools **early**')
  })

  it('includes minimal-change edit rules', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gf-sys-minimal-'))
    mkdirSync(dir, { recursive: true })
    const manifest = testManifest({
      roots: [{ id: 'r1', path: dir, type: 'code', label: 'App' }],
      context: { alwaysInclude: [] },
    })
    const { systemPrompt } = buildChatSystemPrompt(manifest)
    expect(systemPrompt).toContain('### Minimal changes')
    expect(systemPrompt).toContain('smallest faithful change')
    expect(systemPrompt).toContain('smallest change')
    expect(systemPrompt).toContain('read_file')
    expect(systemPrompt).toContain('startLine')
    expect(systemPrompt).toContain('maxLines')
    expect(systemPrompt).toContain('Do not rewrite unrelated sections')
  })

  it('includes a bounded workspace index in the chat system prompt', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gf-sys-index-'))
    const appRoot = join(dir, 'app')
    mkdirSync(join(appRoot, 'src', 'components'), { recursive: true })
    writeFileSync(join(appRoot, 'package.json'), JSON.stringify({ name: 'indexed-app', scripts: { dev: 'vite' }, dependencies: { react: 'latest' } }))
    writeFileSync(join(appRoot, 'src', 'App.tsx'), 'export function App() { return null }')
    const manifest = testManifest({
      roots: [{ id: 'r1', path: appRoot, type: 'code', label: 'App' }],
      context: { alwaysInclude: [] },
    })

    const { systemPrompt } = buildChatSystemPrompt(manifest)

    expect(systemPrompt).toContain('## Workspace index')
    expect(systemPrompt).toContain('package: indexed-app')
    expect(systemPrompt).toContain('src/App.tsx')
  })

  it('enforces the centralized system prompt budget', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gf-sys-budget-'))
    mkdirSync(dir, { recursive: true })
    const manifest = testManifest({
      roots: [{ id: 'r1', path: dir, type: 'code', label: 'App' }],
      context: {
        alwaysInclude: [],
        customInstructions: 'x'.repeat(AGENT_CONTEXT_BUDGETS.systemPromptMaxChars + 2_000),
      },
    })

    const { systemPrompt, warnings } = buildChatSystemPrompt(manifest)

    expect(systemPrompt.length).toBeGreaterThan(AGENT_CONTEXT_BUDGETS.systemPromptMaxChars)
    expect(systemPrompt).toContain('system prompt truncated')
    expect(warnings.some((w) => w.includes(String(AGENT_CONTEXT_BUDGETS.systemPromptMaxChars)))).toBe(true)
  })
})

describe('buildWorkspaceIndexSummary', () => {
  it('summarizes source files and package hints while respecting ignore patterns', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gf-index-'))
    const root = join(dir, 'code')
    mkdirSync(join(root, 'src', 'components'), { recursive: true })
    mkdirSync(join(root, 'node_modules', 'pkg'), { recursive: true })
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({
        name: 'sample',
        scripts: { dev: 'vite', test: 'vitest' },
        dependencies: { react: '^19.0.0', zod: '^3.0.0' },
        devDependencies: { vitest: '^3.0.0' },
      }),
    )
    writeFileSync(join(root, 'src', 'components', 'Card.tsx'), 'export const Card = () => null')
    writeFileSync(join(root, 'node_modules', 'pkg', 'ignored.ts'), 'nope')

    const manifest = testManifest({
      roots: [{ id: 'code', path: root, type: 'code', label: 'Code' }],
      ignore: ['**/node_modules'],
      context: { alwaysInclude: [] },
    })

    const index = buildWorkspaceIndexSummary(manifest)
    const summary = index.roots[0]

    expect(summary.entries).toContain('src/')
    expect(summary.entries).toContain('src/components/Card.tsx')
    expect(summary.entries.some((entry) => entry.includes('node_modules'))).toBe(false)
    expect(summary.importantFiles).toContain('package.json')
    expect(summary.packageHints.join('\n')).toContain('package: sample')
    expect(summary.packageHints.join('\n')).toContain('react')
  })

  it('excludes paths matched only by root .gitignore (not manifest.ignore)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gf-index-gitig-'))
    mkdirSync(join(dir, 'custom_vendor', 'pkg'), { recursive: true })
    writeFileSync(join(dir, '.gitignore'), 'custom_vendor/\n')
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'src', 'main.ts'), '// ok')
    writeFileSync(join(dir, 'custom_vendor', 'pkg', 'x.js'), '')

    const manifest = testManifest({
      roots: [{ id: 'r', path: dir, type: 'code', label: 'App' }],
      ignore: ['**/node_modules'],
      context: { alwaysInclude: [] },
    })

    const index = buildWorkspaceIndexSummary(manifest)
    const summary = index.roots[0]

    expect(summary.entries.some((e) => e.includes('custom_vendor'))).toBe(false)
    expect(summary.entries).toContain('src/main.ts')
  })
})

describe('buildAgentContextPreview', () => {
  it('loads customInstructions, customInstructionsFile, and alwaysInclude without throwing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gf-ctx-'))
    const root = join(dir, 'code')
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, 'snippet.md'), '# Snippet\nbody')
    writeFileSync(join(root, 'extra-instructions.md'), 'From file: be concise.')
    const huge = 'z'.repeat(CONTEXT_FILE_MAX_BYTES + 500)
    writeFileSync(join(root, 'big.log'), huge)

    const manifest = testManifest({
      roots: [{ id: 'code', path: root, type: 'code', label: 'Code' }],
      context: {
        alwaysInclude: ['snippet.md', 'missing.txt', 'big.log'],
        customInstructions: 'Inline: use TypeScript strict.',
        customInstructionsFile: 'extra-instructions.md',
      },
    })

    const preview = buildAgentContextPreview(manifest)

    expect(preview.layers.map((layer) => layer.id)).toContain('retrieved_context')
    expect(preview.budgets.systemPromptMaxChars).toBe(AGENT_CONTEXT_BUDGETS.systemPromptMaxChars)
    expect(preview.sizes.workspaceIndexChars).toBeGreaterThan(0)
    expect(preview.customInstructions).toContain('TypeScript strict')
    expect(preview.customInstructionsFileText).toContain('From file')
    expect(preview.customInstructionsFileResolvedPath).toBe(join(root, 'extra-instructions.md'))

    const snip = preview.alwaysInclude.find((a) => a.manifestPath === 'snippet.md')
    expect(snip?.content).toContain('Snippet')
    expect(snip?.resolvedAbsolutePath).toBe(join(root, 'snippet.md'))

    expect(preview.alwaysInclude.some((a) => a.manifestPath === 'missing.txt' && !a.resolvedAbsolutePath)).toBe(
      true,
    )

    const big = preview.alwaysInclude.find((a) => a.manifestPath === 'big.log')
    expect(big?.truncated).toBe(true)
    expect(big?.content.length).toBe(CONTEXT_FILE_MAX_BYTES)
    expect(preview.warnings.length).toBeGreaterThan(0)
  })

  it('includes the last retrieval debug snapshot', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-ctx-retrieval-'))
    const now = new Date().toISOString()
    recordAgentRetrievalDebug({
      generatedAt: now,
      userTextPreview: 'Where is SettingsPage?',
      files: [
        {
          path: join(root, 'src/SettingsPage.tsx'),
          bucket: 'exact_path',
          score: 180,
          reasons: ['exact path/name mention: SettingsPage.tsx'],
          dirty: false,
          chars: 1200,
          truncated: false,
        },
      ],
      stale: false,
      skipped: { ignored: 1, generated: 2, binary: 3, sensitive: 4, large: 5 },
      warnings: ['4 sensitive file(s) excluded'],
    })

    const preview = buildAgentContextPreview(testManifest({
      roots: [{ id: 'r1', path: root, type: 'code', label: 'Root' }],
      context: { alwaysInclude: [] },
    }))

    expect(preview.lastRetrieval?.generatedAt).toBe(now)
    expect(preview.lastRetrieval?.files[0]?.path).toContain('SettingsPage.tsx')
    expect(preview.lastRetrieval?.skipped.sensitive).toBe(4)
  })
})
