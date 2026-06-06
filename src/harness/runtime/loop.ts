/**
 * Core agent loop: model → tools → repeat until text answer or iteration cap.
 *
 * Orchestration:
 * - {@link runHarnessTurnLoop} (main entry from {@link run-turn.ts})
 * - {@link HarnessSession} holds messages; {@link toApiMessages} feeds xAI
 * - {@link executeTool} runs disk tools under workspace root from {@link paths.ts}
 * - {@link HarnessLogger} records each step (tokens in `model_step`)
 */

import { HARNESS_MAX_TOOL_ITERATIONS } from './config'
import { maybeCompactHarnessSession } from './compaction'
import { HarnessLogger, preview } from '../logging/logger'
import { modelChat as defaultModelChat } from '../model/client'
import type { ModelStepResult } from '../model/client'
import type { HarnessWorkProfile } from '../profile/work-profile'
import { WORK_PROFILE } from '../profile/work-profile'
import { HarnessSession, toApiMessages } from '../session/session'
import { executeTool, getToolSchemas } from '../tools/tools'

export type HarnessLoopCallbacks = {
  onToolStart?: (name: string) => void
  onToolDone?: (name: string, ok: boolean, preview: string) => void
}

export type HarnessLoopResult = {
  finalText: string
  steps: number
}

export async function runHarnessTurnLoop(params: {
  session: HarnessSession
  workspaceRoot: string
  modelId: string
  userInput: string
  profile?: HarnessWorkProfile
  logger: HarnessLogger
  signal: AbortSignal
  callbacks?: HarnessLoopCallbacks
  modelChat?: (
    modelId: string,
    messages: ReturnType<typeof toApiMessages>,
    tools: ReturnType<typeof getToolSchemas>,
    signal: AbortSignal,
  ) => Promise<ModelStepResult>
}): Promise<HarnessLoopResult> {
  const profile = params.profile ?? WORK_PROFILE
  const toolSchemas = getToolSchemas(profile)
  const modelChat = params.modelChat ?? defaultModelChat

  await params.session.addMessage('user', params.userInput)
  await maybeCompactHarnessSession(
    params.session,
    params.modelId,
    params.logger,
    params.signal,
  )

  for (let step = 0; step < HARNESS_MAX_TOOL_ITERATIONS; step += 1) {
    if (params.signal.aborted) throw params.signal.reason ?? new Error('Aborted')

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
        params.callbacks?.onToolStart?.(fn.name)

        const toolStarted = Date.now()
        const { ok, text } = await executeTool(
          params.workspaceRoot,
          fn.name,
          fn.arguments,
          profile,
        )
        params.callbacks?.onToolDone?.(fn.name, ok, preview(text))

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
      }
      continue
    }

    const text = response.content ?? ''
    await params.session.addMessage('assistant', text)
    return { finalText: text, steps: step + 1 }
  }

  throw new Error(`Agent loop exceeded ${HARNESS_MAX_TOOL_ITERATIONS} iterations`)
}
