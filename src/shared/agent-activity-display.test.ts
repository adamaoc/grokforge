import { describe, expect, it } from 'vitest'
import type { AgentChatActivityPayload } from './agent-chat-contract'
import {
  agentActivityPhaseLabel,
  agentActivityToolLabel,
  agentToolRoundActivityTitle,
  collapseCompletedMiddleRows,
  compactAgentTurnActivities,
  formatRetrievalActivityCopy,
  isAgentActivityErrorRow,
  sanitizeAgentActivityDetail,
  summarizeAgentActivityErrors,
} from './agent-activity-display'

function srActivity(
  id: string,
  overrides: Partial<AgentChatActivityPayload> = {},
): AgentChatActivityPayload {
  return {
    id,
    tool: 'search_replace',
    title: 'Prepared search_replace proposal',
    status: 'done',
    ...overrides,
  }
}

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
    expect(agentActivityPhaseLabel('fast')).toBe('Work · tools')
    expect(agentActivityPhaseLabel(undefined)).toBe('Work · tools')
  })
})

describe('agentToolRoundActivityTitle', () => {
  it('uses Work label in fast mode', () => {
    expect(agentToolRoundActivityTitle('fast', false)).toBe('Work tool round')
  })

  it('uses Plan label in plan mode', () => {
    expect(agentToolRoundActivityTitle('plan', false)).toBe('Plan tool round')
  })

  it('uses execute label for approve-and-run', () => {
    expect(agentToolRoundActivityTitle('fast', true)).toBe('Executing plan (model)')
  })
})

describe('compactAgentTurnActivities', () => {
  it('rolls up consecutive same-path search_replace rows', () => {
    const path = '/proj/index.html'
    const compacted = compactAgentTurnActivities([
      { id: 'r', tool: 'retrieval', title: 'No indexed files yet', status: 'done' },
      srActivity('1', { subjectPath: path }),
      srActivity('2', { subjectPath: path }),
      srActivity('3', { subjectPath: path }),
      srActivity('4', { subjectPath: path }),
    ])
    expect(compacted).toHaveLength(2)
    expect(compacted[1].title).toBe('Search & replace ×4 on index.html')
    expect(compacted[1].detail).toBe('Merged into one diff review')
  })

  it('keeps separate groups for different paths', () => {
    const compacted = compactAgentTurnActivities([
      srActivity('1', { subjectPath: '/proj/a.html' }),
      srActivity('2', { subjectPath: '/proj/a.html' }),
      srActivity('3', { subjectPath: '/proj/b.css' }),
    ])
    expect(compacted).toHaveLength(2)
    expect(compacted[0].title).toContain('a.html')
    expect(compacted[1].subjectPath).toContain('b.css')
  })

  it('does not merge non-adjacent search_replace groups', () => {
    const compacted = compactAgentTurnActivities([
      srActivity('1', { subjectPath: '/proj/a.html' }),
      { id: 'read', tool: 'read_file', title: 'Read file', status: 'done' },
      srActivity('2', { subjectPath: '/proj/a.html' }),
    ])
    expect(compacted).toHaveLength(3)
  })

  it('preserves error detail in a rolled-up group', () => {
    const compacted = compactAgentTurnActivities([
      srActivity('1', { subjectPath: '/proj/x.ts', status: 'done' }),
      srActivity('2', {
        subjectPath: '/proj/x.ts',
        status: 'error',
        detail: 'old_string not found',
      }),
    ])
    expect(compacted).toHaveLength(1)
    expect(compacted[0].status).toBe('error')
    expect(compacted[0].detail).toContain('not found')
  })

  it('groups legacy rows via composed-with-prior detail fallback', () => {
    const compacted = compactAgentTurnActivities([
      srActivity('1', {
        detail: '1 file ready for review · composed with prior edit on index.html',
      }),
      srActivity('2', {
        detail: '1 file ready for review · composed with prior edit on index.html',
      }),
    ])
    expect(compacted).toHaveLength(1)
    expect(compacted[0].title).toBe('Search & replace ×2 on index.html')
  })
})

describe('summarizeAgentActivityErrors', () => {
  it('summarizes error rows with path labels and detail', () => {
    const summary = summarizeAgentActivityErrors([
      { id: '1', title: 'Read file', status: 'done' },
      {
        id: '2',
        title: 'Edit proposal failed',
        status: 'error',
        subjectPath: '/proj/script.js',
        detail: 'script.js · jammed JavaScript source',
      },
    ])
    expect(summary.count).toBe(1)
    expect(summary.labels).toEqual(['script.js'])
    expect(summary.topReason).toContain('jammed')
  })

  it('flags interrupted rows as errors', () => {
    expect(
      isAgentActivityErrorRow({
        id: 'x',
        title: 'Read file',
        status: 'interrupted',
      }),
    ).toBe(true)
  })
})

describe('collapseCompletedMiddleRows', () => {
  it('collapses middle completed rows but keeps errors and trailing steps', () => {
    const activities = [
      { id: '1', title: 'Step 1', status: 'done' as const },
      { id: '2', title: 'Step 2', status: 'done' as const },
      { id: '3', title: 'Step 3', status: 'done' as const },
      { id: '4', title: 'Edit proposal failed', status: 'error' as const },
      { id: '5', title: 'Step 5', status: 'done' as const },
    ]
    const { activities: collapsed, collapsedCount } = collapseCompletedMiddleRows(
      activities,
      { keepLast: 2, keepErrors: true },
    )
    expect(collapsedCount).toBeGreaterThan(0)
    expect(collapsed.some((row) => row.title.includes('collapsed'))).toBe(true)
    expect(collapsed.some((row) => row.status === 'error')).toBe(true)
  })
})

describe('formatRetrievalActivityCopy', () => {
  it('uses honest copy for greenfield zero matches', () => {
    const copy = formatRetrievalActivityCopy({
      count: 0,
      greenfieldWorkspace: true,
      details: [],
      sensitiveSkipped: 0,
    })
    expect(copy.title).toBe('No indexed files yet')
    expect(copy.detail).not.toMatch(/0 files/)
    expect(copy.title).not.toContain('Found relevant')
  })

  it('uses no-match copy when index exists but count is zero', () => {
    const copy = formatRetrievalActivityCopy({
      count: 0,
      greenfieldWorkspace: false,
      details: [],
      sensitiveSkipped: 0,
    })
    expect(copy.title).toBe('No lexical matches')
  })

  it('keeps success framing when files were retrieved', () => {
    const copy = formatRetrievalActivityCopy({
      count: 2,
      greenfieldWorkspace: false,
      details: ['src/app.ts (lexical, 12): term'],
      sensitiveSkipped: 0,
    })
    expect(copy.title).toBe('Found relevant workspace context')
    expect(copy.detail).toContain('2 files')
  })
})
