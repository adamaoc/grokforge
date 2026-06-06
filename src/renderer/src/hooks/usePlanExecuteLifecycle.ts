import { useCallback, useRef, useState, type MutableRefObject } from 'react'
import { toast } from 'sonner'
import type { ChatMessage } from '@/types'
import type { ConversationMode } from '../../../shared/conversation/mode-contract'
import { parseGfPlanFromAssistantContent } from '../../../harness-support/plan/contracts/gf-plan-contract'
import { approvedPlanAutoRunUserText } from '@/lib/approved-plan-auto-run'
import {
  getPlanInteraction,
  patchPlanInteraction,
  setPlanRunPhase,
} from '@/lib/plan-interaction-storage'
import {
  completePlanExecuteTurn,
  type PlanExecuteActivityRow,
} from '@/lib/plan-execute-lifecycle'
import type { PlanExecuteApplyOutcome, PlanExecuteRunPhase } from '@/lib/plan-execute-outcome'
import { isVelocityTemperament } from '@/lib/harness-temperament'
import { writeConversationMode } from '@/lib/conversation-mode-storage'

export type PlanExecuteOnStreamDoneInput = {
  actionableProposal: boolean
  proposalStillPending: boolean
  /** Pending proposal card visible — suppress duplicate apply toasts (story 119). */
  proposalVisible?: boolean
  hasRejectedPaths?: boolean
  activities: readonly PlanExecuteActivityRow[]
  flushPendingAutoApply: () => Promise<PlanExecuteApplyOutcome | null>
}

export type UsePlanExecuteLifecycleOptions = {
  projectId: string | null | undefined
  messages: ChatMessage[] | null
  messagesRef: MutableRefObject<ChatMessage[] | null>
  conversationMode: ConversationMode
  setConversationMode: (mode: ConversationMode) => void
  isSending: boolean
  bumpPlanUi: () => void
  clearLiveTurnRouting: () => void
  startAgentTurnWithUserText: (
    userText: string,
    options: {
      manageComposerInput?: boolean
      activeChatMode?: 'fast' | 'plan'
      isApprovedPlanAutoRun?: boolean
      modelIntent?: 'chat_default' | 'planning' | 'execution'
      approvedPlanId?: string
      approvedPlanMessageId?: string
      baseMessages?: ChatMessage[]
      supersedePlans?: boolean
    },
  ) => Promise<void>
}

export function usePlanExecuteLifecycle(options: UsePlanExecuteLifecycleOptions) {
  const {
    projectId,
    messages,
    messagesRef,
    conversationMode,
    setConversationMode,
    isSending,
    bumpPlanUi,
    clearLiveTurnRouting,
    startAgentTurnWithUserText,
  } = options

  const [executingPlanMessageId, setExecutingPlanMessageId] = useState<string | null>(null)
  const executingPlanMessageIdRef = useRef<string | null>(null)
  /** Cleared synchronously when the execute stream ends; ref kept for finalize. */
  const [planExecuteStreamActive, setPlanExecuteStreamActive] = useState(false)

  const patchPlanRunPhaseForMessage = useCallback(
    (
      messageId: string,
      runPhase: PlanExecuteRunPhase | 'executing' | undefined,
    ) => {
      if (!projectId) return
      const msg = messagesRef.current?.find((m) => m.id === messageId)
      const plan = msg?.content
        ? parseGfPlanFromAssistantContent(msg.content)
        : null
      if (!plan) return
      setPlanRunPhase(projectId, messageId, runPhase, plan.steps.length)
      bumpPlanUi()
    },
    [projectId, messagesRef, bumpPlanUi],
  )

  const clearExecutingPlan = useCallback(() => {
    executingPlanMessageIdRef.current = null
    setExecutingPlanMessageId(null)
    setPlanExecuteStreamActive(false)
  }, [])

  const markPlanExecuteStreamEnded = useCallback(() => {
    setPlanExecuteStreamActive(false)
    // Keep executingPlanMessageId until finalizeExecutePlanTurn patches runPhase.
  }, [])

  const patchInterimRunPhaseAfterStream = useCallback(
    (actionableProposal: boolean) => {
      const planMessageId = executingPlanMessageIdRef.current
      if (!planMessageId || !actionableProposal) return
      patchPlanRunPhaseForMessage(planMessageId, 'needs_review')
    },
    [patchPlanRunPhaseForMessage],
  )

  const finalizeExecutePlanTurn = useCallback(
    (outcome: PlanExecuteRunPhase) => {
      const planMessageId = executingPlanMessageIdRef.current
      if (planMessageId) {
        patchPlanRunPhaseForMessage(planMessageId, outcome)
      }
      clearExecutingPlan()
      clearLiveTurnRouting()
    },
    [patchPlanRunPhaseForMessage, clearExecutingPlan, clearLiveTurnRouting],
  )

  const markPlanExecutingOnTurnStarted = useCallback(
    (agentProfileId: string) => {
      const linkedPlanId = executingPlanMessageIdRef.current
      if (linkedPlanId && agentProfileId === 'executor') {
        patchPlanRunPhaseForMessage(linkedPlanId, 'executing')
      }
    },
    [patchPlanRunPhaseForMessage],
  )

  const failExecutingPlanTurn = useCallback(() => {
    if (executingPlanMessageIdRef.current) {
      finalizeExecutePlanTurn('failed')
    }
  }, [finalizeExecutePlanTurn])

  const runCompletePlanExecuteOnDone = useCallback(
    async (input: PlanExecuteOnStreamDoneInput) => {
      const executingId = executingPlanMessageIdRef.current
      if (!executingId) return null

      const applyOutcome = await input.flushPendingAutoApply()
      const result = await completePlanExecuteTurn({
        executingPlanMessageId: executingId,
        actionableProposal: input.actionableProposal,
        applyOutcome,
        proposalStillPending: input.proposalStillPending,
        proposalVisible: input.proposalVisible,
        hasRejectedPaths: input.hasRejectedPaths,
        activities: input.activities,
        projectId: projectId ?? undefined,
        conversationMode,
        setConversationMode,
      })
      finalizeExecutePlanTurn(result.runPhase)
      return result
    },
    [projectId, conversationMode, setConversationMode, finalizeExecutePlanTurn],
  )

  const handlePlanApproveAndRun = useCallback(
    async (planMessageId: string) => {
      if (!messages) return
      if (isSending) {
        toast.message('Agent is busy', {
          description: 'Wait for the current turn to finish, then approve again.',
        })
        return
      }
      const planMsg = messages.find((m) => m.id === planMessageId)
      const plan = planMsg ? parseGfPlanFromAssistantContent(planMsg.content) : null
      const stepCount = plan?.steps.length ?? 1
      let planId = projectId
        ? getPlanInteraction(projectId, planMessageId, stepCount).planId
        : undefined
      const electron = window.electron
      if (!planId && projectId && electron?.getStoredPlanForMessage) {
        const lookup = await electron.getStoredPlanForMessage({
          projectId,
          threadMessageId: planMessageId,
        })
        if (lookup.ok && lookup.planId) {
          planId = lookup.planId
          patchPlanInteraction(
            projectId,
            planMessageId,
            { planId: lookup.planId },
            stepCount,
          )
        }
      }
      if (planId && projectId && electron?.setStoredPlanStatus) {
        void electron.setStoredPlanStatus({
          projectId,
          planId,
          status: 'approved',
        })
      }
      if (isVelocityTemperament()) {
        setConversationMode('normal')
        if (projectId) writeConversationMode(projectId, 'normal')
      }
      executingPlanMessageIdRef.current = planMessageId
      setExecutingPlanMessageId(planMessageId)
      setPlanExecuteStreamActive(true)
      const userText = approvedPlanAutoRunUserText(
        planId,
        plan?.summary ?? 'Approved plan.',
      )
      void startAgentTurnWithUserText(userText, {
        manageComposerInput: false,
        activeChatMode: 'fast',
        isApprovedPlanAutoRun: true,
        modelIntent: 'execution',
        approvedPlanId: planId,
        approvedPlanMessageId: planMessageId,
        baseMessages: messages,
        supersedePlans: true,
      })
    },
    [
      isSending,
      messages,
      projectId,
      setConversationMode,
      startAgentTurnWithUserText,
    ],
  )

  return {
    executingPlanMessageId,
    executingPlanMessageIdRef,
    planExecuteStreamActive,
    patchPlanRunPhaseForMessage,
    clearExecutingPlan,
    markPlanExecuteStreamEnded,
    patchInterimRunPhaseAfterStream,
    finalizeExecutePlanTurn,
    markPlanExecutingOnTurnStarted,
    failExecutingPlanTurn,
    runCompletePlanExecuteOnDone,
    handlePlanApproveAndRun,
  }
}

export type { PlanExecuteActivityRow }
