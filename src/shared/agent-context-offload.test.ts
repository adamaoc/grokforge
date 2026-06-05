import { describe, expect, it } from 'vitest'
import {
  AGENT_CONTEXT_OFFLOAD,
  buildOffloadPointer,
  buildPreviewLines,
  estimateUtf8Bytes,
  shouldOffloadToolResult,
} from '../harness-support/compaction/context-offload'

describe('shouldOffloadToolResult', () => {
  it('offloads payloads above char threshold', () => {
    const big = 'x'.repeat(AGENT_CONTEXT_OFFLOAD.minUtf8Bytes + 1)
    expect(shouldOffloadToolResult(big)).toBe(true)
    expect(estimateUtf8Bytes(big)).toBeGreaterThan(AGENT_CONTEXT_OFFLOAD.minUtf8Bytes)
  })

  it('does not offload small payloads', () => {
    expect(shouldOffloadToolResult('{"ok":true}')).toBe(false)
    expect(shouldOffloadToolResult('x'.repeat(1000))).toBe(false)
  })
})

describe('buildOffloadPointer', () => {
  it('produces a compact pointer under 2k chars for a 50k original', () => {
    const { preview, lineCount } = buildPreviewLines(
      Array.from({ length: 200 }, (_, i) => `line ${i} payload`).join('\n'),
    )
    const pointer = buildOffloadPointer({
      offloadPath: '/tmp/userData/workspace-projects/p1/agent-offload/stream-1/call-1.txt',
      lineCount,
      sha256: 'a'.repeat(64),
      preview,
      originalChars: 50_000,
    })
    expect(pointer.length).toBeLessThan(2_000)
    expect(pointer).toContain('"offloaded": true')
    expect(pointer).toContain('read_file')
  })
})
