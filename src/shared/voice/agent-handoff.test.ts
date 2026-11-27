import { describe, expect, it } from 'vitest'
import { buildVoiceHandoffUserText } from './agent-handoff'

describe('buildVoiceHandoffUserText', () => {
  it('tags voice lines and asks the agent to find files itself', () => {
    const text = buildVoiceHandoffUserText({
      lines: [
        { role: 'user', content: 'Fix the admin page', source: 'voice' },
        { role: 'assistant', content: 'I can help with that.', source: 'voice' },
      ],
    })
    expect(text).toContain('User [voice]: Fix the admin page')
    expect(text).toContain('Assistant [voice]: I can help with that.')
    expect(text).toMatch(/find it in the workspace/)
  })

  it('keeps only the most recent lines', () => {
    const lines = Array.from({ length: 15 }, (_, i) => ({ role: 'user' as const, content: `line ${i}` }))
    const text = buildVoiceHandoffUserText({ lines, tailCount: 3 })
    expect(text).toContain('line 14')
    expect(text).not.toContain('line 11')
  })

  it('returns an empty string when there is nothing to hand off', () => {
    expect(buildVoiceHandoffUserText({ lines: [{ role: 'user', content: '   ' }] })).toBe('')
  })
})
