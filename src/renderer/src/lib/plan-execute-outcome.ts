import type { HarnessTemperament } from './harness-temperament'

/** Activity titles emitted by main when propose_file_edits / search_replace validation fails. */
const EDIT_TOOL_FAILURE_TITLES = new Set(['Edit proposal failed', 'Search replace failed'])

/** Activity titles when run_command did not succeed (story 126). */
const COMMAND_TOOL_FAILURE_TITLES = new Set([
  'Command rejected',
  'Command failed',
  'Command blocked',
  'Command request failed',
])

export type PlanExecuteApplyOutcome = 'none' | 'partial' | 'complete'

/** Persisted on plan interaction state after approve-and-run completes. */
export type PlanExecuteRunPhase = 'failed' | 'needs_review' | 'done'

export type ResolvePlanExecuteRunPhaseInput = {
  temperament: HarnessTemperament
  /** Proposal batch has at least one write operation (not merely an edit_proposal event). */
  actionableProposal: boolean
  /** Result of velocity auto-apply; null when auto-apply was not attempted (Trust). */
  applyOutcome: PlanExecuteApplyOutcome | null
  proposalStillPending: boolean
  activities: readonly { status: string; title: string }[]
}

export function hasActionableProposal(batchOperationCount: number): boolean {
  return batchOperationCount > 0
}

export function shouldMarkPlanExecuteFailed(
  activities: readonly { status: string; title: string }[],
  hadActionableProposal: boolean,
): boolean {
  if (hadActionableProposal) return false
  return activities.some(
    (a) =>
      (a.status === 'error' || a.status === 'rejected' || a.status === 'timeout') &&
      (EDIT_TOOL_FAILURE_TITLES.has(a.title) || COMMAND_TOOL_FAILURE_TITLES.has(a.title)),
  )
}

export function hasCommandToolFailure(
  activities: readonly { status: string; title: string }[],
): boolean {
  return activities.some(
    (a) =>
      (a.status === 'error' || a.status === 'rejected' || a.status === 'timeout') &&
      COMMAND_TOOL_FAILURE_TITLES.has(a.title),
  )
}

/** Story 134 — scaffold strategy nudge recovered in the same turn. */
export function hasRecoveredScaffoldStrategyActivity(
  activities: readonly { harnessKind?: string; detail?: string; title: string }[],
): boolean {
  return activities.some(
    (activity) =>
      activity.harnessKind === 'correction' &&
      activity.detail === 'Corrected on retry' &&
      activity.title.startsWith('Scaffold routing'),
  )
}

/** Pending review summary for plan execute footer (story 123 / 126 / 128). */
export function formatPlanExecutePendingSummary(input: {
  pendingFileCount: number
  pendingCommandCount: number
  /** Both CLI approval and file review pending during greenfield execute (128). */
  greenfieldScaffoldHybridPending?: boolean
  /** Story 134 — harness already corrected tool order; omit hybrid alarm copy. */
  scaffoldStrategyRecovered?: boolean
}): string | null {
  const {
    pendingFileCount,
    pendingCommandCount,
    greenfieldScaffoldHybridPending,
    scaffoldStrategyRecovered,
  } = input
  if (pendingFileCount <= 0 && pendingCommandCount <= 0) return null
  const parts: string[] = []
  if (pendingFileCount > 0) {
    parts.push(
      `${pendingFileCount} file${pendingFileCount === 1 ? '' : 's'} to review`,
    )
  }
  if (pendingCommandCount > 0) {
    parts.push(
      `${pendingCommandCount} command${pendingCommandCount === 1 ? '' : 's'} awaiting approval`,
    )
  }
  const base = parts.join(', ')
  if (
    greenfieldScaffoldHybridPending &&
    !scaffoldStrategyRecovered &&
    pendingCommandCount > 0 &&
    pendingFileCount > 0
  ) {
    return `${base} — CLI scaffold step awaiting approval; file proposals may be premature`
  }
  return base
}

/** Whether to show the partial-apply toast after approve-and-run (story 119 / 125). */
export function shouldShowPlanExecutePartialApplyToast(input: {
  runPhase: PlanExecuteRunPhase
  applyOutcome: PlanExecuteApplyOutcome | null
  proposalVisible?: boolean
  /** Proposal card lists rejected paths — card copy is enough (story 125). */
  hasRejectedPaths?: boolean
}): boolean {
  if (input.proposalVisible === true || input.hasRejectedPaths === true) return false
  if (input.runPhase !== 'needs_review' || input.applyOutcome !== 'partial') return false
  return true
}

export function resolvePlanExecuteRunPhase(
  input: ResolvePlanExecuteRunPhaseInput,
): PlanExecuteRunPhase {
  const { temperament, actionableProposal, applyOutcome, proposalStillPending, activities } =
    input

  const commandFailed = hasCommandToolFailure(activities)

  if (!actionableProposal) {
    void activities
    return 'failed'
  }

  if (temperament === 'velocity') {
    if (commandFailed) return 'needs_review'
    if (applyOutcome === 'complete') return 'done'
    if (applyOutcome === 'partial') return 'needs_review'
    if (proposalStillPending) return 'needs_review'
    if (applyOutcome === 'none') return 'failed'
    return 'failed'
  }

  // Trust: agent may finish with a proposal; disk writes require explicit apply.
  if (commandFailed) return 'needs_review'
  if (proposalStillPending || applyOutcome === null || applyOutcome === 'none') {
    return 'needs_review'
  }
  if (applyOutcome === 'complete') return 'done'
  if (applyOutcome === 'partial') return 'needs_review'
  return 'needs_review'
}
