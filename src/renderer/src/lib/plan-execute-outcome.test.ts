import { describe, expect, it } from 'vitest'
import {
  formatPlanExecutePendingSummary,
  hasActionableProposal,
  hasCommandToolFailure,
  resolvePlanExecuteRunPhase,
  shouldMarkPlanExecuteFailed,
  shouldShowPlanExecutePartialApplyToast,
} from './plan-execute-outcome'

describe('hasActionableProposal', () => {
  it('is false for empty batch', () => {
    expect(hasActionableProposal(0)).toBe(false)
  })

  it('is true when batch has operations', () => {
    expect(hasActionableProposal(1)).toBe(true)
  })
})

describe('shouldMarkPlanExecuteFailed', () => {
  it('returns false when an actionable proposal exists', () => {
    expect(
      shouldMarkPlanExecuteFailed(
        [{ status: 'error', title: 'Edit proposal failed' }],
        true,
      ),
    ).toBe(false)
  })

  it('returns true when edit tools failed and no actionable proposal', () => {
    expect(
      shouldMarkPlanExecuteFailed(
        [
          { status: 'done', title: 'Read file' },
          { status: 'error', title: 'Edit proposal failed' },
        ],
        false,
      ),
    ).toBe(true)
  })

  it('returns false when turn had no edit failures', () => {
    expect(
      shouldMarkPlanExecuteFailed([{ status: 'done', title: 'Read file' }], false),
    ).toBe(false)
  })
})

describe('resolvePlanExecuteRunPhase', () => {
  const activities = [{ status: 'done' as const, title: 'Read file' }]

  it('velocity marks done when auto-apply completes', () => {
    expect(
      resolvePlanExecuteRunPhase({
        temperament: 'velocity',
        actionableProposal: true,
        applyOutcome: 'complete',
        proposalStillPending: false,
        activities,
      }),
    ).toBe('done')
  })

  it('velocity marks needs_review when proposal stays pending after auto-apply', () => {
    expect(
      resolvePlanExecuteRunPhase({
        temperament: 'velocity',
        actionableProposal: true,
        applyOutcome: 'none',
        proposalStillPending: true,
        activities,
      }),
    ).toBe('needs_review')
  })

  it('velocity marks failed when auto-apply writes zero files and proposal cleared', () => {
    expect(
      resolvePlanExecuteRunPhase({
        temperament: 'velocity',
        actionableProposal: true,
        applyOutcome: 'none',
        proposalStillPending: false,
        activities,
      }),
    ).toBe('failed')
  })

  it('velocity marks failed when edit tools reject and no actionable proposal', () => {
    const editFailedActivities = [{ status: 'error' as const, title: 'Edit proposal failed' }]
    expect(shouldMarkPlanExecuteFailed(editFailedActivities, false)).toBe(true)
    expect(
      resolvePlanExecuteRunPhase({
        temperament: 'velocity',
        actionableProposal: false,
        applyOutcome: 'none',
        proposalStillPending: false,
        activities: editFailedActivities,
      }),
    ).toBe('failed')
  })

  it('velocity marks needs_review on partial apply', () => {
    expect(
      resolvePlanExecuteRunPhase({
        temperament: 'velocity',
        actionableProposal: true,
        applyOutcome: 'partial',
        proposalStillPending: true,
        activities,
      }),
    ).toBe('needs_review')
  })

  it('velocity marks failed when no actionable proposal', () => {
    expect(
      resolvePlanExecuteRunPhase({
        temperament: 'velocity',
        actionableProposal: false,
        applyOutcome: null,
        proposalStillPending: false,
        activities: [{ status: 'error', title: 'Edit proposal failed' }],
      }),
    ).toBe('failed')
  })

  it('trust marks needs_review when proposal awaits manual apply', () => {
    expect(
      resolvePlanExecuteRunPhase({
        temperament: 'trust',
        actionableProposal: true,
        applyOutcome: null,
        proposalStillPending: true,
        activities,
      }),
    ).toBe('needs_review')
  })

  it('trust marks done when user already applied during turn', () => {
    expect(
      resolvePlanExecuteRunPhase({
        temperament: 'trust',
        actionableProposal: true,
        applyOutcome: 'complete',
        proposalStillPending: false,
        activities,
      }),
    ).toBe('done')
  })
})

describe('shouldShowPlanExecutePartialApplyToast', () => {
  it('shows partial toast when proposal card is not the primary CTA', () => {
    expect(
      shouldShowPlanExecutePartialApplyToast({
        runPhase: 'needs_review',
        applyOutcome: 'partial',
        proposalVisible: false,
      }),
    ).toBe(true)
  })

  it('suppresses partial toast when proposal card is already visible', () => {
    expect(
      shouldShowPlanExecutePartialApplyToast({
        runPhase: 'needs_review',
        applyOutcome: 'partial',
        proposalVisible: true,
      }),
    ).toBe(false)
  })

  it('suppresses partial toast when rejected paths are listed in the proposal card', () => {
    expect(
      shouldShowPlanExecutePartialApplyToast({
        runPhase: 'needs_review',
        applyOutcome: 'partial',
        hasRejectedPaths: true,
      }),
    ).toBe(false)
  })
})

describe('formatPlanExecutePendingSummary', () => {
  it('returns hybrid pending copy when CLI and files both await review', () => {
    expect(
      formatPlanExecutePendingSummary({
        pendingFileCount: 2,
        pendingCommandCount: 1,
        greenfieldScaffoldHybridPending: true,
      }),
    ).toBe(
      '2 files to review, 1 command awaiting approval — CLI scaffold step awaiting approval; file proposals may be premature',
    )
  })

  it('combines file and command pending counts', () => {
    expect(
      formatPlanExecutePendingSummary({ pendingFileCount: 2, pendingCommandCount: 1 }),
    ).toBe('2 files to review, 1 command awaiting approval')
  })

  it('returns null when nothing pending', () => {
    expect(formatPlanExecutePendingSummary({ pendingFileCount: 0, pendingCommandCount: 0 })).toBeNull()
  })
})

describe('hasCommandToolFailure', () => {
  it('detects rejected command activity', () => {
    expect(
      hasCommandToolFailure([{ status: 'rejected', title: 'Command rejected' }]),
    ).toBe(true)
  })
})
