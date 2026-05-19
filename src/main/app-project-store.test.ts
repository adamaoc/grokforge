import { describe, expect, it } from 'vitest'
import { defaultManifestForFirstRoot } from './app-project-store'
import { DUAL_MODEL_FALLBACKS } from '../shared/model-router'

describe('defaultManifestForFirstRoot', () => {
  it('uses dual-model harness defaults from model-router', () => {
    const manifest = defaultManifestForFirstRoot('/tmp/grokforge-test-root', 'Test')
    expect(manifest.models.default).toBe(DUAL_MODEL_FALLBACKS.chat_default)
    expect(manifest.models.planning).toBe(DUAL_MODEL_FALLBACKS.planning)
    expect(manifest.models.execution).toBe(DUAL_MODEL_FALLBACKS.execution)
    expect(manifest.models.reasoning).toBe(DUAL_MODEL_FALLBACKS.reasoning)
    expect(manifest.models.voice).toBe(DUAL_MODEL_FALLBACKS.voice)
    expect(manifest.models.default).toBe('grok-code-fast-1')
    expect(manifest.models.planning).toBe('grok-4.3')
  })
})
