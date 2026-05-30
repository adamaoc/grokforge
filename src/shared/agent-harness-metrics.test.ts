import { describe, expect, it, vi } from 'vitest'
import { ITERATIVE_SEARCH_REPLACE_BLOCKED_REASON } from './agent-edit-cascade-guard'
import {
  HARNESS_METRICS_MAX_NUDGES,
  HARNESS_METRICS_MAX_SR_PATHS,
  HARNESS_NUDGE_DISCOVERY_SATURATION,
  HARNESS_NUDGE_INCREMENTAL_COMMIT_PROPOSAL,
  capSearchReplaceByPath,
  classifySearchReplaceFailureReason,
  createHarnessMetricsScratch,
  finalizeHarnessMetrics,
  formatEditMetricsDevLogLine,
  formatHarnessMetricsDevLogLine,
  logHarnessMetricsIfDev,
  recordHarnessNudge,
  recordSearchReplaceFailureReason,
  resolveMaxIterationsReason,
} from './agent-harness-metrics'

const emptyFinalizeInput = {
  iterativeWorkEdit: false,
  postPlanIncremental: false,
  toolRoundCount: 0,
  readOnlyRounds: 0,
  searchReplaceCountByPath: new Map<string, number>(),
  searchReplaceFailuresByPath: new Map<string, number>(),
  proposalRejectionsByPath: new Map<string, number>(),
  searchReplaceEscalationIssued: false,
  searchReplaceBlockedAfterEscalationCount: 0,
  searchReplaceLastFailureReasons: [] as string[],
  nudgesIssued: [] as const,
  stoppedAfterProposal: false,
  rereadLoopDetected: false,
}

describe('agent-harness-metrics', () => {
  it('dedupes nudges and caps at max', () => {
    const scratch = createHarnessMetricsScratch({
      iterativeWorkEdit: true,
      postPlanIncremental: false,
    })
    recordHarnessNudge(scratch, HARNESS_NUDGE_DISCOVERY_SATURATION)
    recordHarnessNudge(scratch, HARNESS_NUDGE_DISCOVERY_SATURATION)
    recordHarnessNudge(scratch, HARNESS_NUDGE_INCREMENTAL_COMMIT_PROPOSAL)
    expect(scratch.nudgesIssued).toEqual([
      HARNESS_NUDGE_DISCOVERY_SATURATION,
      HARNESS_NUDGE_INCREMENTAL_COMMIT_PROPOSAL,
    ])
    for (let i = 0; i < HARNESS_METRICS_MAX_NUDGES + 5; i += 1) {
      recordHarnessNudge(scratch, `nudge-${i}` as typeof HARNESS_NUDGE_DISCOVERY_SATURATION)
    }
    expect(scratch.nudgesIssued.length).toBeLessThanOrEqual(HARNESS_METRICS_MAX_NUDGES)
  })

  it('caps search_replace counts by highest count first', () => {
    const map = new Map<string, number>()
    for (let i = 0; i < HARNESS_METRICS_MAX_SR_PATHS + 3; i += 1) {
      map.set(`/tmp/file-${i}.js`, i)
    }
    const capped = capSearchReplaceByPath(map)
    expect(capped).toBeDefined()
    expect(Object.keys(capped!).length).toBe(HARNESS_METRICS_MAX_SR_PATHS)
    expect(capped!['/tmp/file-10.js']).toBe(10)
  })

  it('always includes metrics when iterativeWorkEdit is true', () => {
    const metrics = finalizeHarnessMetrics({
      ...emptyFinalizeInput,
      iterativeWorkEdit: true,
    })
    expect(metrics).toEqual({ iterativeWorkEdit: true })
  })

  it('omits empty metrics for non-iterative turns with no activity', () => {
    expect(finalizeHarnessMetrics(emptyFinalizeInput)).toBeUndefined()
  })

  it('includes searchReplace block when failures present (140)', () => {
    const metrics = finalizeHarnessMetrics({
      ...emptyFinalizeInput,
      iterativeWorkEdit: true,
      searchReplaceFailuresByPath: new Map([['/proj/script.js', 2]]),
      searchReplaceEscalationIssued: true,
      searchReplaceEscalationAtFailureCount: 2,
      searchReplaceLastFailureReasons: ['not_found', 'not_found'],
      nudgesIssued: ['search_replace_escalation'],
      maxIterationsReason: 'search_replace_loop',
    })
    expect(metrics?.searchReplace?.totalFailures).toBe(2)
    expect(metrics?.searchReplace?.escalationIssued).toBe(true)
    expect(metrics?.searchReplace?.lastFailureReasons).toEqual(['not_found', 'not_found'])
    expect(metrics?.maxIterationsReason).toBe('search_replace_loop')
  })

  it('classifySearchReplaceFailureReason maps common errors', () => {
    expect(classifySearchReplaceFailureReason('old_string was not found in the file.')).toBe('not_found')
    expect(classifySearchReplaceFailureReason('old_string matched 3 times')).toBe('multi_match')
    expect(classifySearchReplaceFailureReason(ITERATIVE_SEARCH_REPLACE_BLOCKED_REASON)).toBe(
      'blocked_after_escalation',
    )
    expect(classifySearchReplaceFailureReason(undefined)).toBe('other')
  })

  it('recordSearchReplaceFailureReason keeps ring buffer max 4', () => {
    const scratch = createHarnessMetricsScratch({
      iterativeWorkEdit: true,
      postPlanIncremental: false,
    })
    for (let i = 0; i < 6; i += 1) {
      recordSearchReplaceFailureReason(scratch, `reason-${i}`)
    }
    expect(scratch.searchReplaceLastFailureReasons).toEqual([
      'reason-2',
      'reason-3',
      'reason-4',
      'reason-5',
    ])
  })

  it('resolveMaxIterationsReason prefers post_escalation_stall after nudge exhaustion', () => {
    expect(
      resolveMaxIterationsReason({
        totalSearchReplaceFailures: 1,
        searchReplaceBlockedAfterEscalationCount: 0,
        searchReplaceEscalationNudgeIssued: true,
        incompleteHtmlNudgeIssued: false,
        postEscalationToolRounds: 1,
        postEscalationMaxToolRounds: 1,
        maxSearchReplaceFailuresPerTurn: 6,
        blockedBeforeForceFinalThreshold: 2,
        forceFinalFromEditFailures: true,
      }),
    ).toBe('post_escalation_stall')
  })

  it('resolveMaxIterationsReason returns proposal_rejection_loop when flagged (151)', () => {
    expect(
      resolveMaxIterationsReason({
        totalSearchReplaceFailures: 0,
        searchReplaceBlockedAfterEscalationCount: 0,
        searchReplaceEscalationNudgeIssued: false,
        incompleteHtmlNudgeIssued: false,
        postEscalationToolRounds: 0,
        postEscalationMaxToolRounds: 2,
        maxSearchReplaceFailuresPerTurn: 6,
        blockedBeforeForceFinalThreshold: 2,
        forceFinalFromEditFailures: true,
        proposalRejectionLoop: true,
      }),
    ).toBe('proposal_rejection_loop')
  })

  it('formatHarnessMetricsDevLogLine builds stable one-liner', () => {
    const line = formatHarnessMetricsDevLogLine({
      iterativeWorkEdit: true,
      toolRoundCount: 3,
      editProposalAtRound: 2,
      nudgesIssued: [HARNESS_NUDGE_DISCOVERY_SATURATION, HARNESS_NUDGE_INCREMENTAL_COMMIT_PROPOSAL],
    })
    expect(line).toBe(
      '[GrokForge] harnessMetrics iterativeWorkEdit=true rounds=3 proposal@round=2 nudges=[discovery_saturation,iterative_commit_proposal]',
    )
  })

  it('formatEditMetricsDevLogLine builds S&R diagnostic line (140)', () => {
    const line = formatEditMetricsDevLogLine({
      iterativeWorkEdit: true,
      searchReplace: {
        totalFailures: 4,
        escalationIssued: true,
      },
      maxIterationsReason: 'search_replace_loop',
    })
    expect(line).toBe(
      '[GrokForge] editMetrics srFailures=4 escalation=true maxIterReason=search_replace_loop iterativeWorkEdit=true',
    )
  })

  it('logHarnessMetricsIfDev emits in development only', () => {
    const prev = process.env.NODE_ENV
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      process.env.NODE_ENV = 'development'
      logHarnessMetricsIfDev({
        iterativeWorkEdit: true,
        toolRoundCount: 2,
        searchReplace: { totalFailures: 2, escalationIssued: true },
        maxIterationsReason: 'search_replace_loop',
      })
      expect(info).toHaveBeenCalledTimes(2)

      info.mockClear()
      process.env.NODE_ENV = 'production'
      logHarnessMetricsIfDev({ iterativeWorkEdit: true, toolRoundCount: 2 })
      expect(info).not.toHaveBeenCalled()
    } finally {
      process.env.NODE_ENV = prev
      info.mockRestore()
    }
  })
})
