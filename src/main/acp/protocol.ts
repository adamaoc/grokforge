/**
 * The subset of the Agent Client Protocol (ACP, protocol version 1) GrokForge uses.
 * Reference: https://agentclientprotocol.com — field names match the wire format seen
 * from `grok agent stdio` and `@agentclientprotocol/claude-agent-acp`.
 */

export const ACP_PROTOCOL_VERSION = 1

export type AcpAuthMethod = { id: string; name: string; description?: string | null }

export type AcpInitializeResult = {
  protocolVersion: number
  agentCapabilities?: {
    loadSession?: boolean
    promptCapabilities?: { image?: boolean; audio?: boolean; embeddedContext?: boolean }
  }
  authMethods?: AcpAuthMethod[]
  agentInfo?: { name?: string; title?: string; version?: string }
}

export type AcpSessionMode = { id: string; name: string; description?: string | null }

export type AcpNewSessionResult = {
  sessionId: string
  modes?: { currentModeId: string; availableModes: AcpSessionMode[] } | null
  /** Claude adapter: model picker etc. */
  configOptions?: Array<{
    id: string
    category?: string
    currentValue?: string
    options?: Array<{ value: string; name: string; description?: string }>
  }>
  /** Grok Build: `_meta.modelState.currentModelId`. */
  _meta?: Record<string, unknown>
}

export type AcpContentBlock =
  | { type: 'text'; text: string }
  | { type: 'resource_link'; uri: string; name: string; mimeType?: string }
  | { type: 'image'; data: string; mimeType: string }
  | { type: string; [key: string]: unknown }

export type AcpStopReason = 'end_turn' | 'max_tokens' | 'max_turn_requests' | 'refusal' | 'cancelled'

export type AcpPromptResult = { stopReason: AcpStopReason | string }

export type AcpToolKind =
  | 'read'
  | 'edit'
  | 'delete'
  | 'move'
  | 'search'
  | 'execute'
  | 'think'
  | 'fetch'
  | 'switch_mode'
  | 'other'

export type AcpToolStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

export type AcpToolCallContent =
  | { type: 'content'; content: AcpContentBlock }
  | { type: 'diff'; path: string; oldText?: string | null; newText: string }
  | { type: 'terminal'; terminalId: string }

export type AcpToolCallFields = {
  toolCallId: string
  title?: string | null
  kind?: AcpToolKind | string | null
  status?: AcpToolStatus | null
  content?: AcpToolCallContent[] | null
  locations?: Array<{ path: string; line?: number | null }> | null
  rawInput?: unknown
}

export type AcpPlanEntry = {
  content: string
  priority?: 'high' | 'medium' | 'low'
  status?: 'pending' | 'in_progress' | 'completed'
}

export type AcpSessionUpdate =
  | { sessionUpdate: 'agent_message_chunk'; content: AcpContentBlock }
  | { sessionUpdate: 'agent_thought_chunk'; content: AcpContentBlock }
  | { sessionUpdate: 'user_message_chunk'; content: AcpContentBlock }
  | ({ sessionUpdate: 'tool_call' } & AcpToolCallFields)
  | ({ sessionUpdate: 'tool_call_update' } & AcpToolCallFields)
  | { sessionUpdate: 'plan'; entries: AcpPlanEntry[] }
  | { sessionUpdate: 'current_mode_update'; currentModeId: string }
  | { sessionUpdate: string; [key: string]: unknown }

export type AcpSessionNotification = { sessionId: string; update: AcpSessionUpdate }

export type AcpPermissionOptionKind = 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always'

export type AcpPermissionOption = {
  optionId: string
  name: string
  kind: AcpPermissionOptionKind | string
}

export type AcpRequestPermissionParams = {
  sessionId: string
  toolCall: AcpToolCallFields
  options: AcpPermissionOption[]
}

export type AcpRequestPermissionResult = {
  outcome: { outcome: 'selected'; optionId: string } | { outcome: 'cancelled' }
}

export type AcpReadTextFileParams = {
  sessionId: string
  path: string
  /** 1-based start line. */
  line?: number | null
  limit?: number | null
}

export type AcpWriteTextFileParams = { sessionId: string; path: string; content: string }
