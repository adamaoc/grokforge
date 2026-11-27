import { createContext, useContext } from 'react'
import type { ChatTurnContextV1 } from '@/types'

export type AgentChatAppSurface = 'welcome' | 'settings' | 'workspace'

export type AgentStreamRegistration = {
  streamId: string
  projectId: string
  assistantId: string
  model?: string
  assistantCreatedAt: Date
  /** Persisted on the assistant line when the turn completes (story 065). */
  turnContext?: ChatTurnContextV1
}

export type AgentChatActivityContextValue = {
  registerAgentStream: (meta: AgentStreamRegistration) => void
  unregisterAgentStream: (streamId: string) => void
  /** After loadChatThread, merge an in-flight assistant if the coordinator still holds this project. */
  consumeInflightAssistantSnapshot: (projectId: string) => {
    streamId: string
    assistantId: string
    content: string
    model?: string
    createdAt: Date
    turnContext?: ChatTurnContextV1
  } | null
  activityForProject: (projectId: string) => 'none' | 'running' | 'unread'
  /** Call after localStorage unread map changes outside this provider (e.g. project delete). */
  refreshAgentChatUnreadUi: () => void
}

export const AgentChatActivityContext = createContext<AgentChatActivityContextValue | null>(null)

export function useAgentChatActivity(): AgentChatActivityContextValue {
  const v = useContext(AgentChatActivityContext)
  if (!v) {
    throw new Error('useAgentChatActivity must be used within AgentChatActivityProvider')
  }
  return v
}

/** Optional: welcome subtree without provider (tests / dev). */
export function useAgentChatActivityOptional(): AgentChatActivityContextValue | null {
  return useContext(AgentChatActivityContext)
}
