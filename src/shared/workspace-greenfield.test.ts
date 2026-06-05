import { describe, expect, it } from 'vitest'
import {
  isGreenfieldWorkspace,
  planImpliesMultiFileBootstrap,
  planImpliesNpmScaffold,
  planImpliesStaticFileBootstrap,
} from '../harness-support/context/workspace-greenfield'

function indexFixture(overrides: {
  fileCountScanned?: number
  files?: Array<{ relativePath: string; basename: string }>
  packages?: Array<{ path: string; name?: string }>
}) {
  return {
    intelligence: {
      stats: { fileCountScanned: overrides.fileCountScanned ?? 0 },
      files: overrides.files ?? [],
      packages: overrides.packages ?? [],
    },
  }
}

describe('isGreenfieldWorkspace', () => {
  it('treats missing index as greenfield only when retrieval is empty', () => {
    expect(isGreenfieldWorkspace({ index: null, retrievalMatchCount: 0 })).toBe(true)
    expect(isGreenfieldWorkspace({ index: null, retrievalMatchCount: 2 })).toBe(false)
  })

  it('treats zero scanned files as greenfield', () => {
    expect(
      isGreenfieldWorkspace({
        index: indexFixture({ fileCountScanned: 0 }),
        retrievalMatchCount: 0,
      }),
    ).toBe(true)
  })

  it('treats README-only workspace as greenfield', () => {
    expect(
      isGreenfieldWorkspace({
        index: indexFixture({
          fileCountScanned: 2,
          files: [{ relativePath: 'README.md', basename: 'README.md' }],
        }),
        retrievalMatchCount: 0,
      }),
    ).toBe(true)
  })

  it('rejects monorepo with package.json', () => {
    expect(
      isGreenfieldWorkspace({
        index: indexFixture({
          fileCountScanned: 8,
          files: [
            { relativePath: 'src/index.ts', basename: 'index.ts' },
            { relativePath: 'package.json', basename: 'package.json' },
          ],
          packages: [{ path: '/proj/package.json', name: 'proj' }],
        }),
        retrievalMatchCount: 1,
      }),
    ).toBe(false)
  })

  it('rejects workspace with many non-trivial files', () => {
    const files = Array.from({ length: 6 }, (_, i) => ({
      relativePath: `src/file${i}.ts`,
      basename: `file${i}.ts`,
    }))
    expect(
      isGreenfieldWorkspace({
        index: indexFixture({ fileCountScanned: 10, files }),
        retrievalMatchCount: 0,
      }),
    ).toBe(false)
  })
})

describe('greenfield scaffold plan hints (127)', () => {
  it('planImpliesNpmScaffold detects Vite package.json plans', () => {
    expect(
      planImpliesNpmScaffold({
        filesLikelyTouched: ['package.json', 'vite.config.ts'],
        steps: [{ title: 'npm create vite' }],
      }),
    ).toBe(true)
  })

  it('planImpliesStaticFileBootstrap detects vanilla HTML plans without package.json', () => {
    expect(
      planImpliesStaticFileBootstrap({
        filesLikelyTouched: ['index.html', 'styles.css', 'script.js'],
        steps: [{ title: 'Create static todo page' }],
      }),
    ).toBe(true)
    expect(
      planImpliesStaticFileBootstrap({
        filesLikelyTouched: ['package.json', 'index.html'],
      }),
    ).toBe(false)
  })

  it('planImpliesMultiFileBootstrap when two or more paths listed', () => {
    expect(planImpliesMultiFileBootstrap({ filesLikelyTouched: ['a.ts'] })).toBe(false)
    expect(planImpliesMultiFileBootstrap({ filesLikelyTouched: ['a.ts', 'b.ts'] })).toBe(true)
  })
})
