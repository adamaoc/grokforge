/**
 * Non-streaming chat completions for the harness tool loop.
 */

import { getChatCompletionsUrl, getXaiApiKey } from '../../main/xai/stream'
import { HARNESS_MODEL_STEP_TIMEOUT_BASE_MS } from '../runtime/model-step-timeout'
import type { AgentModelChatMessage, AgentModelToolCall } from '../../shared/agent/model-message'
import type { HarnessToolDefinition } from '../tools/tool-schema'

export type ModelUsage = {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

export type ModelStepResult = {
  content: string
  toolCalls: AgentModelToolCall[]
  usage?: ModelUsage
}

type ChatCompletionResponse = {
  usage?: ModelUsage
  choices?: Array<{
    message?: {
      content?: string | null
      tool_calls?: AgentModelToolCall[]
    }
  }>
}

const HARNESS_MODEL_TIMEOUT_MESSAGE =
  'Model request timed out. Partial file changes from this turn may already be on disk — refresh the file tree and retry if needed.'

const HARNESS_MODEL_FETCH_FAILED_MESSAGE =
  'Could not reach the xAI API (network error). Check your connection, API key in Settings, and try again.'

export function isHarnessModelTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const msg = error.message.toLowerCase()
  return (
    msg.includes('timed out') ||
    msg.includes('aborted due to timeout') ||
    msg === HARNESS_MODEL_TIMEOUT_MESSAGE.toLowerCase()
  )
}

function isModelFetchError(error: unknown): boolean {
  return error instanceof TypeError && error.message.toLowerCase().includes('fetch failed')
}

/** Map low-level fetch/abort errors to user-facing harness messages. */
export function toHarnessModelError(error: unknown): Error {
  if (isHarnessModelTimeoutError(error)) return new Error(HARNESS_MODEL_TIMEOUT_MESSAGE)
  if (isModelFetchError(error)) return new Error(HARNESS_MODEL_FETCH_FAILED_MESSAGE)
  return error instanceof Error ? error : new Error('Model request failed')
}

function mergeAbortSignals(primary: AbortSignal, timeoutMs: number): AbortSignal {
  if (primary.aborted) return primary
  if (typeof AbortSignal.timeout === 'function' && typeof AbortSignal.any === 'function') {
    return AbortSignal.any([primary, AbortSignal.timeout(timeoutMs)])
  }
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(new Error(HARNESS_MODEL_TIMEOUT_MESSAGE)), timeoutMs)
  primary.addEventListener('abort', () => {
    clearTimeout(timer)
    ac.abort(primary.reason)
  }, { once: true })
  return ac.signal
}

/**
 * One model step with optional tools. Used by {@link loop.ts} and {@link compaction.ts}.
 */
export async function modelChat(
  modelId: string,
  messages: AgentModelChatMessage[],
  tools: readonly HarnessToolDefinition[],
  signal: AbortSignal,
  options?: { maxTokens?: number; disableTools?: boolean; timeoutMs?: number },
): Promise<ModelStepResult> {
  const key = getXaiApiKey()
  if (!key) {
    throw new Error('Missing API key. Add it in Settings or set XAI_API_KEY / GROKFORGE_XAI_API_KEY.')
  }

  const toolBody =
    options?.disableTools || tools.length === 0
      ? {}
      : {
          tools,
          tool_choice: 'auto' as const,
          parallel_tool_calls: false,
        }

  let res: Response
  try {
    res = await fetch(getChatCompletionsUrl(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelId,
        messages,
        stream: false,
        max_tokens: options?.maxTokens ?? 8192,
        ...toolBody,
      }),
      signal: mergeAbortSignals(
        signal,
        options?.timeoutMs ?? HARNESS_MODEL_STEP_TIMEOUT_BASE_MS,
      ),
    })
  } catch (error) {
    throw toHarnessModelError(error)
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 800)}`)
  }

  const json = (await res.json()) as ChatCompletionResponse
  const message = json.choices?.[0]?.message
  if (!message) throw new Error('Model returned no message')

  return {
    content: typeof message.content === 'string' ? message.content : '',
    toolCalls: message.tool_calls ?? [],
    usage: json.usage,
  }
}
