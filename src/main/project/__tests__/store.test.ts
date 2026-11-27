import { describe, expect, it } from 'vitest'
import { defaultManifestForFirstRoot } from '../store'
import { DEFAULT_VOICE_MODEL } from '../../../shared/voice/voice-model'

describe('defaultManifestForFirstRoot', () => {
  it('only records the voice model (coding agents choose their own models)', () => {
    const manifest = defaultManifestForFirstRoot('/tmp/grokforge-test-root', 'Test')
    expect(manifest.models).toEqual({ voice: DEFAULT_VOICE_MODEL })
  })

  it('starts with one code root at the chosen folder', () => {
    const manifest = defaultManifestForFirstRoot('/tmp/grokforge-test-root', 'Test')
    expect(manifest.roots).toHaveLength(1)
    expect(manifest.roots[0]).toMatchObject({ id: 'root', path: '/tmp/grokforge-test-root', type: 'code' })
    expect(manifest).not.toHaveProperty('reviewer')
  })
})
