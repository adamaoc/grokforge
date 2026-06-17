import { describe, expect, it } from 'vitest'
import type { GrokProjectManifest } from '../../../main/project/manifest'
import type { PlanProjectSnapshot } from '../../context/project-snapshot'
import { buildHarnessPlanSystemPrompt } from '../plan-profile'

function manifest(): GrokProjectManifest {
  return {
    version: 1,
    name: 'Acme App',
    roots: [{ id: 'root', path: '/tmp/acme', label: 'Acme' }],
    ignore: [],
    context: { customInstructions: 'Prefer strict TypeScript.' },
    models: { default: 'grok-build-0.1' },
    voice: { defaultVoiceMode: 'off' },
  }
}

function snapshot(overrides?: Partial<PlanProjectSnapshot>): PlanProjectSnapshot {
  return {
    greenfieldWorkspace: false,
    indexUpdatedAt: '2026-06-16T00:00:00.000Z',
    fileCountScanned: 42,
    frameworkHints: ['vite', 'react'],
    packageNames: ['acme-app'],
    existingDocPaths: ['README.md', 'AGENTS.md'],
    docsDirectoryEntries: ['docs/architecture.md'],
    otherRoots: [],
    ...overrides,
  }
}

describe('buildHarnessPlanSystemPrompt', () => {
  it('states Plan mode workflow and gf-plan contract', () => {
    const prompt = buildHarnessPlanSystemPrompt({
      manifest: manifest(),
      snapshot: snapshot(),
      profileKey: 'grok_4_3',
    })
    expect(prompt).toContain('GrokForge Plan mode')
    expect(prompt).toContain('Approve & Run')
    expect(prompt).toContain('gf-plan')
    expect(prompt).toContain('read-only')
    expect(prompt).toContain('Senior Staff')
  })

  it('lists discovery doc paths for the planner', () => {
    const prompt = buildHarnessPlanSystemPrompt({
      manifest: manifest(),
      snapshot: snapshot(),
      profileKey: 'grok_4_3',
    })
    expect(prompt).toContain('README.md')
    expect(prompt).toContain('AGENTS.md')
    expect(prompt).toContain('docs/architecture.md')
    expect(prompt).toContain('vite')
  })

  it('mentions phased scope and full-plan approval', () => {
    const prompt = buildHarnessPlanSystemPrompt({
      manifest: manifest(),
      snapshot: snapshot(),
      profileKey: 'grok_4_3',
    })
    expect(prompt).toContain('Phase 1')
    expect(prompt).toContain('approve the complete plan')
  })

  it('states discovery limits for new docs and anti-thrashing', () => {
    const prompt = buildHarnessPlanSystemPrompt({
      manifest: manifest(),
      snapshot: snapshot(),
      profileKey: 'grok_4_3',
    })
    expect(prompt).toContain('Plan discovery limits')
    expect(prompt).toContain('Path not found')
    expect(prompt).toContain('filesLikelyTouched')
    expect(prompt).toContain('Do **not** re-read the same file')
    expect(prompt).toContain('existing** paths only')
  })

  it('includes greenfield appendix when workspace is empty', () => {
    const prompt = buildHarnessPlanSystemPrompt({
      manifest: manifest(),
      snapshot: snapshot({ greenfieldWorkspace: true, fileCountScanned: 0 }),
      profileKey: 'grok_4_3',
    })
    expect(prompt).toContain('Greenfield workspace')
    expect(prompt).toContain('npm create')
  })
})