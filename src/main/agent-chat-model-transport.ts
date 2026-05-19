import { AGENT_TOOL_DEFINITIONS } from './agent-workspace-tools'
import { getChatCompletionsUrl, getXaiApiKey } from './grok-stream'
import type { AgentProviderRequest } from '../shared/agent-turn-snapshot'
import type { AgentModelToolCall } from '../shared/agent-model-message'

export type { AgentModelChatMessage, AgentModelToolCall } from '../shared/agent-model-message'

type ChatCompletionResponse = {
  choices?: Array<{
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

async function postChatCompletion(body: unknown, signal: AbortSignal): Promise<Response> {
  const key = getXaiApiKey()
  if (!key) throw new Error('Missing API key. Add it in Settings or set XAI_API_KEY / GROKFORGE_XAI_API_KEY.')
  return fetch(getChatCompletionsUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  })
}

export function createHttpAgentChatModelTransport(): AgentChatModelTransport {
  return {
    async sampleChatCompletion(request, signal) {
      const res = await postChatCompletion(
        {
          model: request.model,
          messages: request.messages,
          tools: request.tools.length > 0 ? request.tools : AGENT_TOOL_DEFINITIONS,
          tool_choice: 'auto',
          parallel_tool_calls: false,
          max_tokens: 1200,
          stream: false,
        },
        signal,
      )
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 800)}`)
      }
      const json = (await res.json()) as ChatCompletionResponse
      const message = json.choices?.[0]?.message
      return {
        content: typeof message?.content === 'string' ? message.content : '',
        toolCalls: message?.tool_calls ?? [],
      }
    },
    async streamFinalAnswer(request, signal, emitChunk) {
      const res = await postChatCompletion(
        {
          model: request.model,
          messages: request.messages,
          stream: true,
          max_tokens: 4096,
        },
        signal,
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
