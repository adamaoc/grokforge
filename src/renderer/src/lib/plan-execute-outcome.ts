import type { HarnessTemperament } from './harness-temperament'

/** Activity titles emitted by main when propose_file_edits / search_replace validation fails. */
const EDIT_TOOL_FAILURE_TITLES = new Set(['Edit proposal failed', 'Search replace failed'])

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
    (a) => a.status === 'error' && EDIT_TOOL_FAILURE_TITLES.has(a.title),
  )
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

  if (!actionableProposal) {
    void activities
    return 'failed'
  }

  if (temperament === 'velocity') {
    if (applyOutcome === 'complete') return 'done'
    if (applyOutcome === 'partial') return 'needs_review'
    if (proposalStillPending) return 'needs_review'
    if (applyOutcome === 'none') return 'failed'
    return 'failed'
  }

  // Trust: agent may finish with a proposal; disk writes require explicit apply.
  if (proposalStillPending || applyOutcome === null || applyOutcome === 'none') {
    return 'needs_review'
  }
  if (applyOutcome === 'complete') return 'done'
  if (applyOutcome === 'partial') return 'needs_review'
  return 'needs_review'
}
