import { describe, expect, it } from 'vitest'
import { computeAgentContentHash } from '../main/agent-content-hash'
import { AGENT_CONTENT_HASH_HEX_LEN, isAgentContentHash } from './agent-content-hash'

describe('computeAgentContentHash', () => {
  it('returns a stable SHA-256 hex digest for UTF-8 text', () => {
    const hash = computeAgentContentHash('hello\nworld')
    expect(hash).toHaveLength(AGENT_CONTENT_HASH_HEX_LEN)
    expect(isAgentContentHash(hash)).toBe(true)
    expect(computeAgentContentHash('hello\nworld')).toBe(hash)
    expect(computeAgentContentHash('other')).not.toBe(hash)
  })
})
