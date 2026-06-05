import { describe, expect, it } from 'vitest'
import type { AgentChatActivityPayload } from './agent-chat-contract'
import { AGENT_EDIT_JAMMED_JS_FILE_REASON } from '../harness-support/diff/edit-corrupt-content'
import {
  agentActivityPhaseLabel,
  agentActivitySummaryDetail,
  agentActivitySummaryLabel,
  agentActivityToolLabel,
  agentToolRoundActivityTitle,
  collapseCompletedMiddleRows,
  compactAgentTurnActivities,
  formatRetrievalActivityCopy,
  harnessInterventionActivityCopy,
  isAgentActivityErrorRow,
  isCompactedEditFailureActivity,
  normalizeEditFailureClass,
  sanitizeAgentActivityDetail,
  summarizeAgentActivityErrors,
  turnHadAcceptedEditProposal,
  turnHadFailedEditActivities,
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
  it('uses trace-stable section keys', () => {
    expect(agentActivityPhaseLabel('plan')).toBe('plan_tools')
    expect(agentActivityPhaseLabel('fast')).toBe('work_tools')
    expect(agentActivityPhaseLabel(undefined)).toBe('work_tools')
  })
})

describe('agentActivitySummaryLabel', () => {
  it('shows Working while live', () => {
    expect(
      agentActivitySummaryLabel({
        isLive: true,
        hasRunning: true,
        hasErrors: false,
      }),
    ).toBe('Working…')
  })

  it('shows Issue when errors', () => {
    expect(
      agentActivitySummaryLabel({
        isLive: true,
        hasRunning: false,
        hasErrors: true,
      }),
    ).toBe('Issue')
  })

  it('shows Finished when done without errors', () => {
    expect(
      agentActivitySummaryLabel({
        isLive: false,
        hasRunning: false,
        hasErrors: false,
      }),
    ).toBe('Finished')
  })
})

describe('agentActivitySummaryDetail', () => {
  it('formats step count', () => {
    expect(agentActivitySummaryDetail(1)).toBe('1 step')
    expect(agentActivitySummaryDetail(3)).toBe('3 steps')
  })

  it('appends issue count when present', () => {
    expect(
      agentActivitySummaryDetail(5, { count: 2, labels: ['foo.ts'] }),
    ).toBe('5 steps · 2 issues')
  })
})

describe('agentToolRoundActivityTitle', () => {
  it('uses step label in fast mode', () => {
    expect(agentToolRoundActivityTitle('fast', false, 2, 6)).toBe('Step 2 of 6')
  })

  it('uses planning step label in plan mode', () => {
    expect(agentToolRoundActivityTitle('plan', false, 1, 4)).toBe('Planning · Step 1 of 4')
  })

  it('uses execute label for approve-and-run', () => {
    expect(agentToolRoundActivityTitle('fast', true, 3, 8)).toBe(
      'Running your plan · Step 3 of 8',
    )
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

  it('rolls up consecutive same-path edit proposal failures (story 155)', () => {
    const path = '/proj/src/script.js'
    const detail = `${path}: ${AGENT_EDIT_JAMMED_JS_FILE_REASON}`
    const rows: AgentChatActivityPayload[] = [
      { id: 'r', tool: 'read_file', title: 'Read file', status: 'done' },
      ...[1, 2, 3].map((n) => ({
        id: `e${n}`,
        tool: 'propose_file_edits' as const,
        title: 'Edit proposal failed',
        status: 'error' as const,
        subjectPath: path,
        detail,
      })),
    ]
    const compacted = compactAgentTurnActivities(rows)
    const editRows = compacted.filter((a) => a.title.includes('Edit proposal failed'))
    expect(editRows).toHaveLength(1)
    expect(editRows[0]?.title).toBe('Edit proposal failed ×3 on script.js')
    expect(editRows[0]?.detail).toContain('Crushed JavaScript')
    expect(editRows[0]?.detail).toContain('No file created or changed on disk')
    expect(isCompactedEditFailureActivity(editRows[0]!)).toBe(true)
  })

  it('does not merge edit failures on different paths or classes', () => {
    const compacted = compactAgentTurnActivities([
      {
        id: '1',
        tool: 'propose_file_edits',
        title: 'Edit proposal failed',
        status: 'error',
        subjectPath: '/proj/a.js',
        detail: `/proj/a.js: ${AGENT_EDIT_JAMMED_JS_FILE_REASON}`,
      },
      {
        id: '2',
        tool: 'propose_file_edits',
        title: 'Edit proposal failed',
        status: 'error',
        subjectPath: '/proj/b.js',
        detail: '/proj/b.js: empty body',
      },
    ])
    expect(compacted.filter((a) => a.title === 'Edit proposal failed')).toHaveLength(2)
  })

  it('does not merge non-adjacent edit failures', () => {
    const path = '/proj/x.ts'
    const detail = `${path}: ${AGENT_EDIT_JAMMED_JS_FILE_REASON}`
    const compacted = compactAgentTurnActivities([
      {
        id: '1',
        tool: 'propose_file_edits',
        title: 'Edit proposal failed',
        status: 'error',
        subjectPath: path,
        detail,
      },
      { id: 'read', tool: 'read_file', title: 'Read file', status: 'done' },
      {
        id: '2',
        tool: 'propose_file_edits',
        title: 'Edit proposal failed',
        status: 'error',
        subjectPath: path,
        detail,
      },
    ])
    expect(compacted.filter((a) => a.title === 'Edit proposal failed')).toHaveLength(2)
  })

  it('uses pending-review outcome when a later proposal succeeds on the same path', () => {
    const path = '/proj/app.js'
    const detail = `${path}: ${AGENT_EDIT_JAMMED_JS_FILE_REASON}`
    const compacted = compactAgentTurnActivities([
      {
        id: '1',
        tool: 'propose_file_edits',
        title: 'Edit proposal failed',
        status: 'error',
        subjectPath: path,
        detail,
      },
      {
        id: '2',
        tool: 'propose_file_edits',
        title: 'Edit proposal failed',
        status: 'error',
        subjectPath: path,
        detail,
      },
      {
        id: '3',
        tool: 'propose_file_edits',
        title: 'Prepared edit proposal',
        status: 'done',
        subjectPath: path,
      },
    ])
    const rolled = compacted.find((a) => isCompactedEditFailureActivity(a))
    expect(rolled?.detail).toContain('Pending review — not on disk yet')
  })
})

describe('turnHadAcceptedEditProposal (164)', () => {
  it('is true when a prepared proposal activity succeeded', () => {
    expect(
      turnHadAcceptedEditProposal([
        { id: '1', title: 'Prepared edit proposal', status: 'done' },
      ]),
    ).toBe(true)
  })

  it('is false when only edit failures are present', () => {
    expect(
      turnHadAcceptedEditProposal([
        { id: '1', title: 'Edit proposal failed', status: 'error' },
      ]),
    ).toBe(false)
  })
})

describe('turnHadFailedEditActivities and summarizeAgentActivityErrors (155)', () => {
  it('detects compacted edit failure titles', () => {
    expect(
      turnHadFailedEditActivities([
        { id: '1', title: 'Edit proposal failed ×2 on index.html', status: 'error' },
      ]),
    ).toBe(true)
  })

  it('counts one issue after edit-failure compaction', () => {
    const path = '/proj/script.js'
    const detail = `${path}: ${AGENT_EDIT_JAMMED_JS_FILE_REASON}`
    const compacted = compactAgentTurnActivities(
      [1, 2, 3].map((n) => ({
        id: `e${n}`,
        tool: 'propose_file_edits' as const,
        title: 'Edit proposal failed',
        status: 'error' as const,
        subjectPath: path,
        detail,
      })),
    )
    const summary = summarizeAgentActivityErrors(compacted)
    expect(summary.count).toBe(1)
    expect(summary.labels).toEqual(['script.js'])
  })
})

describe('normalizeEditFailureClass', () => {
  it('maps known jammed-js reason to a short label', () => {
    expect(normalizeEditFailureClass(`/p/a.js: ${AGENT_EDIT_JAMMED_JS_FILE_REASON}`)).toBe(
      'Crushed JavaScript',
    )
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

describe('harnessInterventionActivityCopy', () => {
  it('maps scaffold hybrid nudge to correction kind without conflict in title', () => {
    const copy = harnessInterventionActivityCopy({
      key: 'scaffold_strategy',
      conflict: 'hybrid_same_round',
      recovered: false,
    })
    expect(copy.kind).toBe('correction')
    expect(copy.title).not.toMatch(/conflict/i)
    expect(copy.title).toContain('Scaffold routing')
    expect(copy.detail).toMatch(/re-sample/i)
  })

  it('uses recovered detail when scaffold strategy complies on retry', () => {
    const copy = harnessInterventionActivityCopy({
      key: 'scaffold_strategy',
      conflict: 'hybrid_same_round',
      recovered: true,
    })
    expect(copy.kind).toBe('correction')
    expect(copy.detail).toBe('Corrected on retry')
    expect(copy.title).toMatch(/corrected/i)
  })

  it('maps search_replace escalation to correction framing', () => {
    const copy = harnessInterventionActivityCopy({
      key: 'search_replace_escalation',
      recovered: false,
    })
    expect(copy.kind).toBe('correction')
    expect(copy.title).toContain('full-file proposal')
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
