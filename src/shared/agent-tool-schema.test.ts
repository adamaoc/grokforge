import { describe, expect, it } from 'vitest'
import { AGENT_TOOL_FENCE_INFO, AGENT_TOOL_PROTOCOL_VERSION } from '../harness/tools/contracts/tool-contract'
import { AgentToolBatchPayloadSchema, stripAgentToolFenceFromAssistantDisplay } from '../harness/tools/contracts/tool-schema'

describe('AgentToolBatchPayloadSchema', () => {
  it('parses write_file with malformed expectedContentHash (story 154)', () => {
    const parsed = AgentToolBatchPayloadSchema.safeParse({
      version: AGENT_TOOL_PROTOCOL_VERSION,
      operations: [
        {
          op: 'write_file',
          path: '/proj/src/new.ts',
          content: 'export const x = 1\n',
          expectedContentHash: 'not-a-valid-hash',
        },
      ],
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) throw new Error(parsed.error.message)
    expect(parsed.data.operations[0]).toMatchObject({
      expectedContentHash: 'not-a-valid-hash',
    })
  })

  it('rejects invalid operation shape', () => {
    const parsed = AgentToolBatchPayloadSchema.safeParse({
      version: AGENT_TOOL_PROTOCOL_VERSION,
      operations: [{ op: 'write_file', path: '/a.ts' }],
    })
    expect(parsed.success).toBe(false)
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
