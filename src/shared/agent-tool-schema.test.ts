import { describe, expect, it } from 'vitest'
import { AGENT_TOOL_FENCE_INFO, AGENT_TOOL_PROTOCOL_VERSION } from '../shared/agent-tool-contract'
import {
  extractAgentToolBatchFromAssistantText,
  stripAgentToolFenceFromAssistantDisplay,
} from '../shared/agent-tool-schema'

describe('extractAgentToolBatchFromAssistantText', () => {
  it('parses a fenced grokforge-agent-tools block', () => {
    const md = `Here is the plan.\n\n\`\`\`${AGENT_TOOL_FENCE_INFO}\n${JSON.stringify(
      {
        version: AGENT_TOOL_PROTOCOL_VERSION,
        operations: [{ op: 'write_file', path: '/tmp/a.ts', content: 'x' }],
      },
      null,
      2,
    )}\n\`\`\``
    const parsed = extractAgentToolBatchFromAssistantText(md)
    expect(parsed).not.toBeNull()
    expect(parsed?.operations).toHaveLength(1)
    expect(parsed?.operations[0]?.op).toBe('write_file')
  })

  it('returns null when fence is missing', () => {
    expect(extractAgentToolBatchFromAssistantText('no tools here')).toBeNull()
  })

  it('normalizes literal backslash-n sequences in write_file content', () => {
    const batch = {
      version: AGENT_TOOL_PROTOCOL_VERSION,
      operations: [{ op: 'write_file' as const, path: '/tmp/a.md', content: '# Hello\\n\\n## Section\\nBody.' }],
    }
    const md = `Here.\n\n\`\`\`${AGENT_TOOL_FENCE_INFO}\n${JSON.stringify(batch)}\n\`\`\``
    const parsed = extractAgentToolBatchFromAssistantText(md)
    expect(parsed?.operations[0]?.op).toBe('write_file')
    if (parsed?.operations[0]?.op === 'write_file') {
      expect(parsed.operations[0].content).toBe('# Hello\n\n## Section\nBody.')
    }
  })

  it('parses delete_file operations', () => {
    const md = `\`\`\`${AGENT_TOOL_FENCE_INFO}\n${JSON.stringify({
      version: AGENT_TOOL_PROTOCOL_VERSION,
      operations: [{ op: 'delete_file', path: '/tmp/old.ts' }],
    })}\n\`\`\``
    const parsed = extractAgentToolBatchFromAssistantText(md)
    expect(parsed?.operations[0]?.op).toBe('delete_file')
  })
})

describe('stripAgentToolFenceFromAssistantDisplay', () => {
  const batchJson = JSON.stringify(
    {
      version: AGENT_TOOL_PROTOCOL_VERSION,
      operations: [{ op: 'write_file', path: '/tmp/a.ts', content: 'x' }],
    },
    null,
    2,
  )

  it('removes a complete fenced block and keeps prose', () => {
    const md = `Summary line.\n\n\`\`\`${AGENT_TOOL_FENCE_INFO}\n${batchJson}\n\`\`\`\n\nThanks.`
    expect(stripAgentToolFenceFromAssistantDisplay(md)).toBe('Summary line.\n\nThanks.')
  })

  it('removes an incomplete tail while the fence is still open (streaming)', () => {
    const partial = `Intro.\n\n\`\`\`${AGENT_TOOL_FENCE_INFO}\n{"version":`
    expect(stripAgentToolFenceFromAssistantDisplay(partial)).toBe('Intro.')
  })

  it('removes multiple fenced blocks', () => {
    const fence = `\`\`\`${AGENT_TOOL_FENCE_INFO}\n${batchJson}\n\`\`\``
    const md = `A\n\n${fence}\n\nB\n\n${fence}\n\nC`
    expect(stripAgentToolFenceFromAssistantDisplay(md)).toBe('A\n\nB\n\nC')
  })
})
