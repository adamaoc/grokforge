import { describe, expect, it } from 'vitest'
import {
  AGENT_EDIT_CASCADE_GUARD_REASON,
  assessEditCascadeGuard,
  isDestructiveFileShrink,
  pathsAtSearchReplaceEscalationThreshold,
  recordSearchReplaceFailure,
  resolvePostEscalationMaxToolRounds,
  resolveSearchReplaceMaxFailuresPerTurn,
  SEARCH_REPLACE_FAILURES_BEFORE_ESCALATION_GUARD,
  shouldBlockSearchReplaceAfterEscalation,
  shouldInjectSearchReplaceEscalation,
  totalSearchReplaceFailures,
} from '../../../harness-support/policy/edit/cascade-guard'
import { agentEditPathKey } from '../../../harness-support/policy/edit/read-guard'

const TODO_ORIGINAL = `<!DOCTYPE html>
<html>
<head><title>Todo</title></head>
<body>
<script>
let todos = [];
function renderTodos() {
  const list = document.getElementById('list');
  list.innerHTML = todos.map(t => '<li>' + t + '</li>').join('');
}
renderTodos();
</script>
</body>
</html>
`

const TODO_BAD_REWRITE = `<!DOCTYPE html>
<html><body><script>let todos = [];</script></body></html>
`

describe('agent-edit-cascade-guard', () => {
  it('flags destructive shrink for todo-style rewrite', () => {
    expect(isDestructiveFileShrink(TODO_ORIGINAL, TODO_BAD_REWRITE)).toBe(true)
  })

  it('blocks full-file proposal after repeated search_replace failures (ToDoApp field pattern)', () => {
    const path = '/tmp/ToDoApp/index.html'
    const failures = new Map<string, number>()
    for (let i = 0; i < SEARCH_REPLACE_FAILURES_BEFORE_ESCALATION_GUARD; i += 1) {
      recordSearchReplaceFailure(failures, path)
    }
    expect(failures.get(agentEditPathKey(path))).toBe(2)

    const result = assessEditCascadeGuard({
      resolvedPath: path,
      originalOnDisk: TODO_ORIGINAL,
      proposedContent: TODO_BAD_REWRITE,
      searchReplaceFailuresByPath: failures,
      userMessageHint: 'fix js syntax error at line 107',
    })

    expect(result.blocked).toBe(true)
    expect(result.reason).toContain(AGENT_EDIT_CASCADE_GUARD_REASON)
  })

  it('allows destructive proposal when user asked for full rewrite', () => {
    const path = '/tmp/app.ts'
    const failures = new Map<string, number>([[agentEditPathKey(path), 3]])

    const result = assessEditCascadeGuard({
      resolvedPath: path,
      originalOnDisk: TODO_ORIGINAL,
      proposedContent: TODO_BAD_REWRITE,
      searchReplaceFailuresByPath: failures,
      userMessageHint: 'rewrite the whole file from scratch',
    })

    expect(result.blocked).toBe(false)
  })

  it('allows proposal with only one search_replace failure', () => {
    const path = '/tmp/app.ts'
    const failures = new Map<string, number>([[agentEditPathKey(path), 1]])

    const result = assessEditCascadeGuard({
      resolvedPath: path,
      originalOnDisk: TODO_ORIGINAL,
      proposedContent: TODO_BAD_REWRITE,
      searchReplaceFailuresByPath: failures,
    })

    expect(result.blocked).toBe(false)
  })

  it('shouldInjectSearchReplaceEscalation when any path reaches threshold', () => {
    const failures = new Map<string, number>()
    expect(shouldInjectSearchReplaceEscalation(failures)).toBe(false)
    recordSearchReplaceFailure(failures, '/tmp/overview.md')
    expect(shouldInjectSearchReplaceEscalation(failures)).toBe(false)
    recordSearchReplaceFailure(failures, '/tmp/overview.md')
    expect(shouldInjectSearchReplaceEscalation(failures)).toBe(true)
    expect(pathsAtSearchReplaceEscalationThreshold(failures)).toContain(agentEditPathKey('/tmp/overview.md'))
  })

  it('shouldInjectSearchReplaceEscalation at 1 failure when iterativeWorkEdit (138)', () => {
    const failures = new Map<string, number>()
    expect(shouldInjectSearchReplaceEscalation(failures, { iterativeWorkEdit: true })).toBe(false)
    recordSearchReplaceFailure(failures, '/tmp/script.js')
    expect(shouldInjectSearchReplaceEscalation(failures, { iterativeWorkEdit: true })).toBe(true)
    expect(
      pathsAtSearchReplaceEscalationThreshold(failures, { iterativeWorkEdit: true }),
    ).toContain(agentEditPathKey('/tmp/script.js'))
  })

  it('shouldBlockSearchReplaceAfterEscalation only on iterative post-nudge paths at threshold', () => {
    const failures = new Map<string, number>()
    recordSearchReplaceFailure(failures, '/tmp/script.js')
    expect(
      shouldBlockSearchReplaceAfterEscalation({
        iterativeWorkEdit: true,
        searchReplaceEscalationNudgeIssued: true,
        failuresByPath: failures,
        resolvedAbsolutePath: '/tmp/script.js',
      }),
    ).toBe(true)
    expect(
      shouldBlockSearchReplaceAfterEscalation({
        iterativeWorkEdit: false,
        searchReplaceEscalationNudgeIssued: true,
        failuresByPath: failures,
        resolvedAbsolutePath: '/tmp/script.js',
      }),
    ).toBe(false)
    expect(
      shouldBlockSearchReplaceAfterEscalation({
        iterativeWorkEdit: true,
        searchReplaceEscalationNudgeIssued: false,
        failuresByPath: failures,
        resolvedAbsolutePath: '/tmp/script.js',
      }),
    ).toBe(false)
  })

  it('resolveSearchReplaceMaxFailuresPerTurn differs for iterative Work', () => {
    expect(resolveSearchReplaceMaxFailuresPerTurn()).toBe(6)
    expect(resolveSearchReplaceMaxFailuresPerTurn({ iterativeWorkEdit: true })).toBe(3)
    expect(resolvePostEscalationMaxToolRounds()).toBe(2)
    expect(resolvePostEscalationMaxToolRounds({ iterativeWorkEdit: true })).toBe(1)
  })

  it('does not block cascade shrink guard for small markdown files (overview-style docs)', () => {
    const path = '/tmp/TaskBoard/docs/overview.md'
    const original = `# TaskBoard Overview

## Key Features
- one

## Tech Stack (planned)
- Frontend: Likely React
- Backend: TBD
`
    const stubProposal = `## Tech Stack (planned)
- Frontend: React + TypeScript
`
    const failures = new Map<string, number>()
    recordSearchReplaceFailure(failures, path)
    recordSearchReplaceFailure(failures, path)

    expect(isDestructiveFileShrink(original, stubProposal, path)).toBe(false)

    const result = assessEditCascadeGuard({
      resolvedPath: path,
      originalOnDisk: original,
      proposedContent: stubProposal,
      searchReplaceFailuresByPath: failures,
      userMessageHint: 'update the doc tech stack',
    })
    expect(result.blocked).toBe(false)
  })

  it('still blocks destructive shrink on small html after search_replace failures', () => {
    const path = '/tmp/index.html'
    const original = `<!DOCTYPE html>
<html><body>
<script>let x = 1;</script>
</body></html>
`
    const shrunk = '<html><body></body></html>'
    const failures = new Map<string, number>()
    recordSearchReplaceFailure(failures, path)
    recordSearchReplaceFailure(failures, path)

    expect(isDestructiveFileShrink(original, shrunk, path)).toBe(true)
    const result = assessEditCascadeGuard({
      resolvedPath: path,
      originalOnDisk: original,
      proposedContent: shrunk,
      searchReplaceFailuresByPath: failures,
    })
    expect(result.blocked).toBe(true)
  })

  it('totalSearchReplaceFailures sums per-path counts', () => {
    const failures = new Map<string, number>([
      [agentEditPathKey('/a'), 2],
      [agentEditPathKey('/b'), 3],
    ])
    expect(totalSearchReplaceFailures(failures)).toBe(5)
  })
})
