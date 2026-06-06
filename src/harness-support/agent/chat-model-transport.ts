import { AGENT_TOOL_DEFINITIONS } from '../tools/workspace-tools'
import { getChatCompletionsUrl, getXaiApiKey } from '../../main/xai/stream'
import type { AgentProviderRequest } from '../compaction/turn-snapshot'
import type { AgentModelToolCall } from '../../shared/agent/model-message'

export type { AgentModelChatMessage, AgentModelToolCall } from '../../shared/agent/model-message'

type ChatCompletionResponse = {
  choices?: Array<{
    finish_reason?: string
    message?: {
      role?: string
      content?: string | null
      tool_calls?: AgentModelToolCall[]
    }
  }>
}

export type AgentChatSampleResult = {
  content: string
  toolCalls: AgentModelToolCall[]
}

/**
 * Pluggable xAI chat completions transport (non-streaming sample + streaming final).
 * Production uses HTTP; tests inject scripted implementations.
 */
export type AgentChatModelTransport = {
  sampleChatCompletion(request: AgentProviderRequest, signal: AbortSignal): Promise<AgentChatSampleResult>
  streamFinalAnswer(
    request: AgentProviderRequest,
    signal: AbortSignal,
    emitChunk: (delta: string) => void,
  ): Promise<void>
}

/** Per-request ceiling so a hung xAI call does not leave the UI on “thinking” indefinitely. */
export const AGENT_CHAT_SAMPLE_TIMEOUT_MS = 90_000
export const AGENT_CHAT_STREAM_TIMEOUT_MS = 120_000

function mergeAbortSignals(primary: AbortSignal, timeoutMs: number): AbortSignal {
  if (primary.aborted) return primary
  if (typeof AbortSignal.timeout === 'function' && typeof AbortSignal.any === 'function') {
    return AbortSignal.any([primary, AbortSignal.timeout(timeoutMs)])
  }
  const timeout = AbortSignal.timeout?.(timeoutMs)
  if (timeout) return AbortSignal.any([primary, timeout])
  const ac = new AbortController()
  const onPrimary = () => ac.abort(primary.reason)
  const timer = setTimeout(() => {
    ac.abort(new Error('Chat completion request timed out'))
  }, timeoutMs)
  primary.addEventListener('abort', onPrimary, { once: true })
  ac.signal.addEventListener(
    'abort',
    () => {
      clearTimeout(timer)
      primary.removeEventListener('abort', onPrimary)
    },
    { once: true },
  )
  return ac.signal
}

async function postChatCompletion(
  body: unknown,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<Response> {
  const key = getXaiApiKey()
  if (!key) throw new Error('Missing API key. Add it in Settings or set XAI_API_KEY / GROKFORGE_XAI_API_KEY.')
  return fetch(getChatCompletionsUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: mergeAbortSignals(signal, timeoutMs),
  })
}

function chatCompletionBody(
  request: AgentProviderRequest,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  return {
    model: request.model,
    messages: request.messages,
    ...(request.reasoningEffort ? { reasoning_effort: request.reasoningEffort } : {}),
    ...extra,
  }
}

export function createHttpAgentChatModelTransport(): AgentChatModelTransport {
  return {
    async sampleChatCompletion(request, signal) {
      const toolOptions = request.disableTools
        ? {}
        : {
            tools: request.tools.length > 0 ? request.tools : AGENT_TOOL_DEFINITIONS,
            tool_choice: 'auto',
            parallel_tool_calls: false,
          }
      const res = await postChatCompletion(
        chatCompletionBody(request, {
          ...toolOptions,
          max_tokens: request.sampleMaxTokens ?? 1200,
          stream: false,
        }),
        signal,
        AGENT_CHAT_SAMPLE_TIMEOUT_MS,
      )
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 800)}`)
      }
      const json = (await res.json()) as ChatCompletionResponse
      const choice = json.choices?.[0]
      const message = choice?.message
      if (choice?.finish_reason === 'length' && process.env.NODE_ENV === 'development') {
        console.warn(
          '[GrokForge agent-chat] tool_sample hit max_tokens — propose_file_edits JSON may be truncated',
          { model: request.model, maxTokens: request.sampleMaxTokens },
        )
      }
      return {
        content: typeof message?.content === 'string' ? message.content : '',
        toolCalls: message?.tool_calls ?? [],
      }
    },
    async streamFinalAnswer(request, signal, emitChunk) {
      const res = await postChatCompletion(
        chatCompletionBody(request, {
          stream: true,
          max_tokens: 4096,
        }),
        signal,
        AGENT_CHAT_STREAM_TIMEOUT_MS,
      )
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 800)}`)
      }
      if (!res.body) throw new Error('No response body')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      try {
        while (!signal.aborted) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const rawLine of lines) {
            const line = rawLine.replace(/\r$/, '')
            if (!line.startsWith('data:')) continue
            const data = line.slice(5).trimStart()
            if (data === '[DONE]') return
            try {
              const json = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string | null } }> }
              const delta = json.choices?.[0]?.delta?.content
              if (delta) emitChunk(delta)
            } catch {
              /* ignore malformed SSE */
            }
          }
        }
      } finally {
        reader.releaseLock()
      }
    },
  }
}
