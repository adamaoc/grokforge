import { describe, expect, it } from 'vitest'
import type { GrokProjectManifest } from './manifest'
import { DUAL_MODEL_FALLBACKS, getModelForIntent, MODEL_INTENT_MANIFEST_KEYS } from './model-router'

function baseManifest(overrides: Partial<GrokProjectManifest['models']> = {}): GrokProjectManifest {
  return {
    version: '1.2',
    name: 'Test',
    roots: [{ id: 'r', path: '/tmp', type: 'code', label: 'R' }],
    models: {
      default: 'm-default',
      planning: 'm-plan',
      execution: 'm-exec',
      reasoning: 'm-reason',
      voice: 'm-voice',
      ...overrides,
    },
    voice: {
      enabled: true,
      defaultVoiceMode: 'off',
      autoListen: false,
      speakResponses: false,
    },
    context: { alwaysInclude: [] },
    metadata: { createdAt: new Date().toISOString(), lastOpened: new Date().toISOString(), tags: [] },
  }
}

describe('getModelForIntent', () => {
  it('maps each intent to the matching manifest.models field', () => {
    const m = baseManifest()
    expect(getModelForIntent(m, 'chat_default')).toBe('m-default')
    expect(getModelForIntent(m, 'planning')).toBe('m-plan')
    expect(getModelForIntent(m, 'execution')).toBe('m-exec')
    expect(getModelForIntent(m, 'reasoning')).toBe('m-reason')
    expect(getModelForIntent(m, 'voice')).toBe('m-voice')
  })

  it('uses fallback when a manifest entry is blank', () => {
    const m = baseManifest({ default: '  ', planning: '' })
    expect(getModelForIntent(m, 'chat_default')).toBe(DUAL_MODEL_FALLBACKS.chat_default)
    expect(getModelForIntent(m, 'planning')).toBe(DUAL_MODEL_FALLBACKS.planning)
  })

  it('exposes dual-model fallbacks for harness defaults', () => {
    expect(DUAL_MODEL_FALLBACKS.chat_default).toBe('grok-build-0.1')
    expect(DUAL_MODEL_FALLBACKS.execution).toBe('grok-build-0.1')
    expect(DUAL_MODEL_FALLBACKS.planning).toBe('grok-4.3')
    expect(DUAL_MODEL_FALLBACKS.reasoning).toBe('grok-4.20-0309-reasoning')
    expect(DUAL_MODEL_FALLBACKS.voice).toBe('grok-voice-latest')
  })

  it('exposes a bijection between intents and manifest model keys', () => {
    const keys = new Set(Object.values(MODEL_INTENT_MANIFEST_KEYS))
    expect(keys.size).toBe(5)
    expect(keys.has('default')).toBe(true)
    expect(keys.has('planning')).toBe(true)
    expect(keys.has('execution')).toBe(true)
    expect(keys.has('reasoning')).toBe(true)
    expect(keys.has('voice')).toBe(true)
  })
})
