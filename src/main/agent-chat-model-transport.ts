import { AGENT_TOOL_DEFINITIONS } from './agent-workspace-tools'
import { getChatCompletionsUrl, getXaiApiKey } from './grok-stream'

/** Matches OpenAI-style tool_calls on assistant messages (agent runner). */
export type AgentModelToolCall = {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export type AgentModelChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: AgentModelToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

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
  sampleChatCompletion(
    model: string,
    messages: AgentModelChatMessage[],
    signal: AbortSignal,
  ): Promise<AgentChatSampleResult>
  streamFinalAnswer(
    model: string,
    messages: AgentModelChatMessage[],
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
    async sampleChatCompletion(model, messages, signal) {
      const res = await postChatCompletion(
        {
          model,
          messages,
          tools: AGENT_TOOL_DEFINITIONS,
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
    async streamFinalAnswer(model, messages, signal, emitChunk) {
      const res = await postChatCompletion(
        {
          model,
          messages,
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
