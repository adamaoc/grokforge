import { describe, expect, it } from 'vitest'
import { buildVoiceHandoffUserText } from './agent-handoff'
import { buildVoiceHarnessAppendix } from '../../harness-support/profiles/harness-profile'

describe('buildVoiceHarnessAppendix', () => {
  it('includes adapter note and profile key', () => {
    const appendix = buildVoiceHarnessAppendix('grok_code_fast')
    expect(appendix).toContain('Voice adapter note')
    expect(appendix).toContain('typed agent chat')
    expect(appendix).toContain('grok_code_fast')
    expect(appendix).toContain('search_workspace')
  })

  it('varies by profile', () => {
    const fast = buildVoiceHarnessAppendix('grok_code_fast')
    const capable = buildVoiceHarnessAppendix('grok_4_3')
    expect(fast).toMatch(/concise|action/i)
    expect(capable).toMatch(/reason|planning/i)
  })
})

describe('buildVoiceHandoffUserText', () => {
  it('includes voice model and harness profile metadata', () => {
    const text = buildVoiceHandoffUserText({
      lines: [
        { role: 'user', content: 'Fix the admin page', source: 'voice' },
        { role: 'assistant', content: 'I can help with that.', source: 'voice' },
      ],
      voiceModelId: 'grok-voice-think-fast-1.0',
      harnessProfileKey: 'generic',
      harnessProfileDisplayName: 'Generic',
    })
    expect(text).toContain('grok-voice-think-fast-1.0')
    expect(text).toContain('generic')
    expect(text).toContain('search_workspace')
    expect(text).toContain('[voice]')
    expect(text).toContain('admin page')
  })
})
