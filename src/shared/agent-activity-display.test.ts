import { describe, expect, it } from 'vitest'
import {
  agentActivityPhaseLabel,
  agentActivityToolLabel,
  sanitizeAgentActivityDetail,
} from './agent-activity-display'

describe('sanitizeAgentActivityDetail', () => {
  it('truncates long safe detail', () => {
    const detail = `src/components/Foo.tsx · ${'query term '.repeat(40)}`
    const out = sanitizeAgentActivityDetail(detail)
    expect(out).toBeDefined()
    expect(out!.length).toBeLessThanOrEqual(200)
  })

  it('drops JSON tool bodies', () => {
    expect(sanitizeAgentActivityDetail('{"ok":true,"content":"secret file text"}')).toBeUndefined()
  })

  it('drops secret-looking lines', () => {
    expect(sanitizeAgentActivityDetail('api_key=sk-abcdefghijklmnopqrstuvwxyz')).toBeUndefined()
  })

  it('keeps path and match summaries', () => {
    const out = sanitizeAgentActivityDetail('src/foo.ts · "query" (3 matches)')
    expect(out).toContain('src/foo.ts')
    expect(out).toContain('matches')
  })
})

describe('agentActivityToolLabel', () => {
  it('maps known tools', () => {
    expect(agentActivityToolLabel('read_file')).toBe('Read file')
    expect(agentActivityToolLabel('search_workspace')).toBe('Search workspace')
    expect(agentActivityToolLabel('retrieval')).toBe('Context retrieval')
  })
})

describe('agentActivityPhaseLabel', () => {
  it('distinguishes plan vs fast', () => {
    expect(agentActivityPhaseLabel('plan')).toBe('Plan · tools')
    expect(agentActivityPhaseLabel('fast')).toBe('Tools used')
    expect(agentActivityPhaseLabel(undefined)).toBe('Tools used')
  })
})
