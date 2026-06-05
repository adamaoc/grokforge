import { toast } from 'sonner'
import {
  GF_PLAN_FENCE,
  parseGfPlanFromAssistantContent,
} from '../../../harness-support/plan/contracts/gf-plan-contract'
import type { ConversationMode } from '../../../shared/conversation-mode-contract'
import { writeConversationMode } from '@/lib/conversation-mode-storage'
import {
  hasActionableProposal,
  resolvePlanExecuteRunPhase,
  shouldMarkPlanExecuteFailed,
  shouldShowPlanExecutePartialApplyToast,
  type PlanExecuteApplyOutcome,
  type PlanExecuteRunPhase,
} from '@/lib/plan-execute-outcome'
import { shouldExitPlanAfterExecuteComplete } from '@/lib/conversation-lifecycle'
import {
  isVelocityTemperament,
  readStoredHarnessTemperament,
} from '@/lib/harness-temperament'

export type PlanExecuteActivityRow = { status: string; title: string }

export type CompletePlanExecuteTurnInput = {
  executingPlanMessageId: string
  actionableProposal: boolean
  applyOutcome: PlanExecuteApplyOutcome | null
  proposalStillPending: boolean
  /** Pending proposal card is visible — avoid duplicate apply CTAs in toasts (story 119). */
  proposalVisible?: boolean
  hasRejectedPaths?: boolean
  activities: readonly PlanExecuteActivityRow[]
  projectId: string | null | undefined
  conversationMode: ConversationMode
  setConversationMode: (mode: ConversationMode) => void
}

export type CompletePlanExecuteTurnResult = {
  runPhase: PlanExecuteRunPhase
  editToolsFailed: boolean
}

/** Resolve run phase, show execute toasts, optionally switch composer to Work after successful apply. */
export async function completePlanExecuteTurn(
  input: CompletePlanExecuteTurnInput,
): Promise<CompletePlanExecuteTurnResult> {
  const runPhase = resolvePlanExecuteRunPhase({
    temperament: readStoredHarnessTemperament(),
    actionableProposal: input.actionableProposal,
    applyOutcome: input.applyOutcome,
    proposalStillPending: input.proposalStillPending,
    activities: input.activities,
  })
  const editToolsFailed = shouldMarkPlanExecuteFailed(
    input.activities,
    input.actionableProposal,
  )

  if (runPhase === 'failed') {
    toast.error('Plan execution did not write files', {
      description: editToolsFailed
        ? 'Edit proposals were rejected (often incomplete HTML for new index.html). Review the activity log and run again — approve-and-run uses the execution model.'
        : 'No applyable file changes were produced. Review the activity log and run again.',
      duration: 16_000,
    })
  } else if (input.projectId && shouldExitPlanAfterExecuteComplete(runPhase)) {
    input.setConversationMode('normal')
    writeConversationMode(input.projectId, 'normal')
    if (input.conversationMode === 'plan') {
      toast.message('Plan executed — switched to Work for follow-up edits.')
    }
  } else if (
    shouldShowPlanExecutePartialApplyToast({
      runPhase,
      applyOutcome: input.applyOutcome,
      proposalVisible: input.proposalVisible,
      hasRejectedPaths: input.hasRejectedPaths,
    })
  ) {
    toast.message('Plan partially applied', {
      description:
        'Some paths were written; review the proposal card for paths that still need Apply all.',
      duration: 14_000,
    })
  }

  return { runPhase, editToolsFailed }
}

/** Plan-mode turn ended without valid gf-plan JSON — returns true when a toast was shown. */
export function notifyMissingStructuredPlan(input: {
  finalContent: string
  endedInPlanMode: boolean
}): boolean {
  const trimmed = input.finalContent.trim()
  if (!trimmed || !input.endedInPlanMode) return false
  if (parseGfPlanFromAssistantContent(input.finalContent)) return false

  const hadPlanFence = new RegExp('```\\s*' + GF_PLAN_FENCE, 'i').test(input.finalContent)
  toast.message('No structured plan was attached', {
    description: hadPlanFence
      ? 'A gf-plan fence was started but the JSON did not validate. Ask the model to retry with one complete ```gf-plan``` block.'
      : 'Plan mode requires a ```gf-plan``` JSON fence in the assistant reply. Retry your request or ask for a structured gf-plan block.',
    duration: 14_000,
  })
  return true
}

export { hasActionableProposal, isVelocityTemperament }
