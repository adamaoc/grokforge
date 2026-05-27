/** Conversation-linked file focus for the editor companion (story 143). */

export type AgentFileFocusReason = 'proposal' | 'read' | 'active'

export type AgentFileFocus = {
  path: string
  reason: AgentFileFocusReason
  streamId?: string
}
