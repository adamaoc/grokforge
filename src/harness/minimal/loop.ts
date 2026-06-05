/**
 * Core agent loop: model → tools → repeat until text answer or iteration cap.
 *
 * Orchestration:
 * - {@link runMinimalTurn} (main entry from {@link run-minimal-turn.ts})
 * - {@link MinimalSession} holds messages; {@link toApiMessages} feeds xAI
 * - {@link executeMinimalTool} runs disk tools under workspace root from {@link paths.ts}
 * - {@link MinimalHarnessLogger} records each step (tokens in `model_step`)
 */

import { MINIMAL_MAX_TOOL_ITERATIONS } from './config'
import { maybeCompactMinimalSession } from './compaction'
import { MinimalHarnessLogger, preview } from './logger'
import { minimalModelChat } from './model-client'
import type { MinimalWorkProfile } from './profile'
import { WORK_PROFILE } from './profile'
import { MinimalSession, toApiMessages } from './session'
import { executeMinimalTool, getMinimalToolSchemas } from './tools'

export type MinimalLoopCallbacks = {
  onToolStart?: (name: string) => void
  onToolDone?: (name: string, ok: boolean, preview: string) => void
}

export type MinimalLoopResult = {
  finalText: string
  steps: number
}

export async function runMinimalTurn(params: {
  session: MinimalSession
  workspaceRoot: string
  modelId: string
  userInput: string
  profile?: MinimalWorkProfile
  logger: MinimalHarnessLogger
  signal: AbortSignal
  callbacks?: MinimalLoopCallbacks
}): Promise<MinimalLoopResult> {
  const profile = params.profile ?? WORK_PROFILE
  const toolSchemas = getMinimalToolSchemas(profile)

  await params.session.addMessage('user', params.userInput)
  await maybeCompactMinimalSession(
    params.session,
    params.modelId,
    params.logger,
    params.signal,
  )

  for (let step = 0; step < MINIMAL_MAX_TOOL_ITERATIONS; step += 1) {
    if (params.signal.aborted) throw params.signal.reason ?? new Error('Aborted')

    const modelStarted = Date.now()
    const apiMessages = toApiMessages(params.session.getHistory())
    const response = await minimalModelChat(
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
        const { ok, text } = await executeMinimalTool(
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

  throw new Error(`Agent loop exceeded ${MINIMAL_MAX_TOOL_ITERATIONS} iterations`)
}
