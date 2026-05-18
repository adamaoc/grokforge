import { describe, expect, it } from 'vitest'
import { extractDeltaFromChatCompletionChunk } from './grok-stream'

describe('extractDeltaFromChatCompletionChunk', () => {
  it('reads delta.content from a chat completion chunk', () => {
    const line = JSON.stringify({
      choices: [{ delta: { content: 'Hello' } }],
    })
    expect(extractDeltaFromChatCompletionChunk(line)).toBe('Hello')
  })

  it('returns empty string for malformed JSON', () => {
    expect(extractDeltaFromChatCompletionChunk('not-json')).toBe('')
  })

  it('returns empty when delta content is missing', () => {
    expect(extractDeltaFromChatCompletionChunk(JSON.stringify({ choices: [{}] }))).toBe('')
  })
})
