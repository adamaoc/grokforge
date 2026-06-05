import { describe, expect, it } from 'vitest'
import {
  AGENT_EDIT_FAILURE_PREFIX,
  buildFixFailedEditFollowUpMessage,
  formatAgentEditFailureSystemMessage,
  isAgentEditFailureSystemMessage,
  pruneEditFailureMessages,
} from '../harness-support/diff/edit-failure-context'

describe('agent-edit-failure-context', () => {
  const sampleEvent = {
    kind: 'apply_conflict' as const,
    paths: [{ path: '/proj/src/a.ts', reason: 'File changed since review' }],
    summary: 'Disk hash mismatch',
  }

  it('detects failure system messages by prefix', () => {
    const body = formatAgentEditFailureSystemMessage(sampleEvent)
    expect(isAgentEditFailureSystemMessage(body)).toBe(true)
    expect(isAgentEditFailureSystemMessage('hello')).toBe(false)
    expect(body.startsWith(AGENT_EDIT_FAILURE_PREFIX)).toBe(true)
  })

  it('formats system message with kind, paths, and agent hints', () => {
    const body = formatAgentEditFailureSystemMessage(sampleEvent)
    expect(body).toContain('apply_conflict')
    expect(body).toContain('/proj/src/a.ts')
    expect(body).toContain('File changed since review')
    expect(body).toContain('read_file')
    expect(body).toContain('expectedContentHash')
  })

  it('builds follow-up message with original request and paths', () => {
    const message = buildFixFailedEditFollowUpMessage({
      event: sampleEvent,
      originalUserRequest: 'Fix the login bug',
    })
    expect(message).toContain('previous edit attempt failed')
    expect(message).toContain('Fix the login bug')
    expect(message).toContain('/proj/src/a.ts')
    expect(message).toContain('read_file')
    expect(message).toContain('expectedContentHash')
  })

  it('prunes older failure system messages beyond max', () => {
    const mk = (id: string) => ({
      id,
      role: 'system' as const,
      content: `${AGENT_EDIT_FAILURE_PREFIX}\nKind: apply_error\nSummary: x`,
    })
    const messages = [
      { id: 'u1', role: 'user', content: 'hi' },
      mk('f1'),
      mk('f2'),
      mk('f3'),
      mk('f4'),
      mk('f5'),
      mk('f6'),
    ]
    const pruned = pruneEditFailureMessages(messages, 3)
    const failures = pruned.filter((m) => isAgentEditFailureSystemMessage(m.content))
    expect(failures).toHaveLength(3)
    expect(failures.map((m) => m.id)).toEqual(['f4', 'f5', 'f6'])
    expect(pruned.some((m) => m.id === 'u1')).toBe(true)
  })
})
