/**
 * Core agent loop: model → tools → repeat until text answer or iteration cap.
 *
 * Orchestration:
 * - {@link runHarnessTurnLoop} (main entry from {@link run-turn.ts})
 * - {@link HarnessSession} holds messages; {@link toApiMessages} feeds xAI
 * - {@link executeTool} runs disk tools across all manifest roots via {@link paths.ts}
 * - {@link HarnessLogger} records each step (tokens in `model_step`)
 */

import { HARNESS_MAX_TOOL_ITERATIONS_WORK } from './config'
import { HarnessIterationExhaustedError } from './loop-errors'
import { formatWorkTurnRecoverySummary } from './work-turn-recovery'
import { maybeCompactHarnessSession } from './compaction'
import { HarnessLogger, preview } from '../logging/logger'
import { modelChat as defaultModelChat } from '../model/client'
import type { ModelStepResult } from '../model/client'
import type { HarnessProfile } from '../profile/turn-routing'
import { WORK_PROFILE } from '../profile/work-profile'
import {
  createPlanLoopGuardState,
  evaluatePlanLoopNudge,
  markPlanLoopNudgeSent,
  recordPlanToolInvocation,
} from './plan-loop-guard'
import {
  createWorkLoopGuardState,
  evaluateWorkLoopNudge,
  markWorkLoopNudgeSent,
  recordWorkToolInvocation,
} from './work-loop-guard'
import { HarnessSession, toApiMessages } from '../session/session'
import { executeTool, getToolSchemas } from '../tools/tools'
import type { HarnessToolRunContext } from '../tools/tool-context'
import type { HarnessToolEnv } from '../workspace/paths'

export type HarnessLoopCallbacks = {
  onToolStart?: (name: string, toolCallId: string) => string | void
  onToolDone?: (name: string, toolCallId: string, activityId: string, ok: boolean, preview: string) => void
}

export type HarnessLoopResult = {
  finalText: string
  steps: number
}

export async function runHarnessTurnLoop(params: {
  session: HarnessSession
  toolEnv: HarnessToolEnv
  modelId: string
  userInput: string
  profile?: HarnessProfile
  maxToolIterations?: number
  logger: HarnessLogger
  signal: AbortSignal
  toolContext?: HarnessToolRunContext
  /** Set on Approve & Run execute turns — used by work loop guard nudges. */
  approvedPlanId?: string
  callbacks?: HarnessLoopCallbacks
  modelChat?: (
    modelId: string,
    messages: ReturnType<typeof toApiMessages>,
    tools: ReturnType<typeof getToolSchemas>,
    signal: AbortSignal,
  ) => Promise<ModelStepResult>
}): Promise<HarnessLoopResult> {
  const profile = params.profile ?? WORK_PROFILE
  const maxToolIterations = params.maxToolIterations ?? HARNESS_MAX_TOOL_ITERATIONS_WORK
  const toolSchemas = getToolSchemas(profile)
  const modelChat = params.modelChat ?? defaultModelChat
  const planLoopGuard = profile.id === 'plan' ? createPlanLoopGuardState() : null
  const workLoopGuard = profile.id === 'work' ? createWorkLoopGuardState() : null

  await params.session.addMessage('user', params.userInput)
  await maybeCompactHarnessSession(
    params.session,
    params.modelId,
    params.logger,
    params.signal,
  )

  for (let step = 0; step < maxToolIterations; step += 1) {
    if (params.signal.aborted) throw params.signal.reason ?? new Error('Aborted')

    if (planLoopGuard) {
      const nudge = evaluatePlanLoopNudge(planLoopGuard, step)
      if (nudge) {
        await params.session.addMessage('user', nudge.message)
        markPlanLoopNudgeSent(planLoopGuard, nudge.kind)
        await params.logger.event('plan_loop_nudge', { step, kind: nudge.kind })
      }
    }

    if (workLoopGuard) {
      const nudge = evaluateWorkLoopNudge(workLoopGuard, params.approvedPlanId)
      if (nudge) {
        await params.session.addMessage('user', nudge.message)
        markWorkLoopNudgeSent(workLoopGuard, nudge.kind)
        await params.logger.event('work_loop_nudge', { step, kind: nudge.kind })
      }
    }

    const modelStarted = Date.now()
    const apiMessages = toApiMessages(params.session.getHistory())
    const response = await modelChat(
      params.modelId,
      apiMessages,
      toolSchemas,
      params.signal,
    )

    await params.logger.event('model_step', {
      step,
      profileId: profile.id,
      durationMs: Date.now() - modelStarted,
      promptTokens: response.usage?.prompt_tokens,
      completionTokens: response.usage?.completion_tokens,
      totalTokens: response.usage?.total_tokens,
      toolCallCount: response.toolCalls.length,
      visibleMessageCount: apiMessages.length,
    })

    if (response.toolCalls.length > 0) {
      await params.session.addAssistantWithToolCalls(
        response.content || null,
        response.toolCalls,
      )

      for (const toolCall of response.toolCalls) {
        if (toolCall.type !== 'function') continue
        const fn = toolCall.function
        const activityId =
          params.callbacks?.onToolStart?.(fn.name, toolCall.id) ?? toolCall.id

        const toolStarted = Date.now()
        const { ok, text } = await executeTool(
          params.toolEnv,
          fn.name,
          fn.arguments,
          profile,
          {
            toolContext: params.toolContext,
            toolCallId: toolCall.id,
            activityId,
          },
        )
        params.callbacks?.onToolDone?.(fn.name, toolCall.id, activityId, ok, preview(text))

        await params.logger.event('tool', {
          step,
          name: fn.name,
          ok,
          durationMs: Date.now() - toolStarted,
          resultPreview: preview(text),
        })

        await params.session.addMessage('tool', text, {
          tool_call_id: toolCall.id,
          name: fn.name,
        })

        if (planLoopGuard) {
          recordPlanToolInvocation(planLoopGuard, fn.name, fn.arguments, ok)
        }
        if (workLoopGuard) {
          recordWorkToolInvocation(workLoopGuard, fn.name, fn.arguments, ok, text)
        }
      }
      continue
    }

    const text = response.content ?? ''
    await params.session.addMessage('assistant', text)
    return { finalText: text, steps: step + 1 }
  }

  const recoverySummary = workLoopGuard
    ? formatWorkTurnRecoverySummary(workLoopGuard, maxToolIterations)
    : `This turn hit the **${maxToolIterations}** tool-round limit. Ask **what happened?** for a summary.`

  throw new HarnessIterationExhaustedError(
    maxToolIterations,
    maxToolIterations,
    `Agent loop exceeded ${maxToolIterations} tool rounds. Continue in a follow-up message if more work remains.`,
    recoverySummary,
  )
}
