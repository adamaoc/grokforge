/** OpenAI-style chat messages for the agent provider loop (shared; no Node imports). */

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
