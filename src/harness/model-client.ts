/**
 * Non-streaming chat completions for the harness tool loop.
 */

import { getChatCompletionsUrl, getXaiApiKey } from '../main/grok-stream'
import { HARNESS_CHAT_SAMPLE_TIMEOUT_MS } from './config'
import type { AgentModelChatMessage, AgentModelToolCall } from '../shared/agent-model-message'
import type { HarnessToolDefinition } from './tool-schema'

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

function mergeAbortSignals(primary: AbortSignal, timeoutMs: number): AbortSignal {
  if (primary.aborted) return primary
  if (typeof AbortSignal.timeout === 'function' && typeof AbortSignal.any === 'function') {
    return AbortSignal.any([primary, AbortSignal.timeout(timeoutMs)])
  }
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(new Error('Chat completion request timed out')), timeoutMs)
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
  options?: { maxTokens?: number; disableTools?: boolean },
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

  const res = await fetch(getChatCompletionsUrl(), {
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
    signal: mergeAbortSignals(signal, HARNESS_CHAT_SAMPLE_TIMEOUT_MS),
  })

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
