import { describe, expect, it } from 'vitest'
import type { GrokProjectManifest } from './manifest'
import { primaryRootPathFromManifest } from './recent-project-primary-path'

function minimalManifest(roots: GrokProjectManifest['roots']): GrokProjectManifest {
  return {
    version: '1.2',
    name: 'T',
    roots,
    models: {
      default: 'a',
      planning: 'b',
      execution: 'c',
      reasoning: 'd',
      voice: 'e',
    },
    voice: { enabled: true, defaultVoiceMode: 'off', autoListen: false, speakResponses: false },
    context: { alwaysInclude: [] },
    metadata: { createdAt: 'x', lastOpened: 'x', tags: [] },
  }
}

describe('primaryRootPathFromManifest', () => {
  it('returns resolved absolute path for the first root', () => {
    const p = primaryRootPathFromManifest(
      minimalManifest([{ id: 'r', path: '/tmp/gf-primary-path-test', type: 'code', label: 'L' }]),
    )
    expect(p).toBeTruthy()
    expect(p).toMatch(/gf-primary-path-test/)
  })

  it('returns undefined when first root path is empty', () => {
    expect(
      primaryRootPathFromManifest(minimalManifest([{ id: 'r', path: '   ', type: 'code', label: 'L' }])),
    ).toBeUndefined()
  })
})
