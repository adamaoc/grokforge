import { describe, expect, it } from 'vitest'
import type { GrokProjectManifest } from '../../../main/project/manifest'
import type { StoredWorkspaceIndex } from '../../../harness-support/context/index-store'
import { formatWorkspaceIndexForPrompt } from '../workspace-index-prompt'

function multiRootManifest(): GrokProjectManifest {
  return {
    version: '1',
    name: 'Blog',
    roots: [
      { id: 'root', path: '/docs', label: 'Blog-Docs', type: 'docs' },
      { id: 'blog-frontend', path: '/frontend', label: 'Blog-Frontend', type: 'code' },
    ],
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

function sampleIndex(): StoredWorkspaceIndex {
  return {
    version: 2,
    updatedAt: '2026-06-17T16:00:00.000Z',
    rootPaths: ['/docs', '/frontend'],
    ignorePatterns: [],
    summary: {
      roots: [
        {
          rootId: 'root',
          label: 'Blog-Docs',
          path: '/docs',
          entries: ['architecture.md', 'styleguide.md'],
          importantFiles: [],
          packageHints: [],
          truncated: false,
        },
        {
          rootId: 'blog-frontend',
          label: 'Blog-Frontend',
          path: '/frontend',
          entries: ['src/App.tsx', 'package.json'],
          importantFiles: ['package.json'],
          packageHints: ['package.json: scripts: dev, build'],
          truncated: false,
        },
      ],
      warnings: [],
    },
    intelligence: {
      version: 1,
      files: [],
      packages: [],
      stats: {
        fileCountScanned: 12,
        skippedIgnored: 0,
        skippedGenerated: 0,
        skippedBinary: 0,
        skippedSensitive: 0,
        skippedLarge: 0,
        errors: [],
      },
    },
    truncated: false,
    warnings: [],
  }
}

describe('formatWorkspaceIndexForPrompt', () => {
  it('groups multi-root index by root type with exploration guidance', () => {
    const text = formatWorkspaceIndexForPrompt(multiRootManifest(), sampleIndex(), {
      mode: 'work',
    })
    expect(text).toContain('## Workspace index')
    expect(text).toContain('#### code roots')
    expect(text).toContain('#### docs roots')
    expect(text).toContain('blog-frontend:src/App.tsx')
    expect(text).toContain('root:styleguide.md')
    expect(text).toContain('search_workspace')
    expect(text).toContain('Last indexed: 2026-06-17T16:00:00.000Z')
  })

  it('uses plan-mode exploration copy when requested', () => {
    const text = formatWorkspaceIndexForPrompt(multiRootManifest(), sampleIndex(), {
      mode: 'plan',
    })
    expect(text).toContain('plan mode')
    expect(text).toContain('gf-plan')
    expect(text).not.toContain('## Workspace exploration\nThe index above')
  })
})