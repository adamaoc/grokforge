import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { AgentChatEventPayload, AgentTurnChanges, PersistedChatLineV1 } from '@/types'
import { CHAT_STORE_SCHEMA_VERSION } from '@/types'
import { publishChatThreadLine } from '@/lib/chat-thread-bus'
import {
  clearAgentChatUnread,
  markAgentChatUnread,
  readAgentChatUnreadProjectIds,
} from '@/lib/agent-chat-unread-storage'
import {
  AgentChatActivityContext,
  type AgentChatActivityContextValue,
  type AgentChatAppSurface,
  type AgentStreamRegistration,
} from '@/context/agent-chat-activity-context'
import { formatTurnError } from '@/components/chat-thread/chat-thread-helpers'
import { routingLabel } from '@/components/chat-thread/use-agent-turn'

export type { AgentChatAppSurface, AgentStreamRegistration }

type StreamSession = AgentStreamRegistration & {
  buffer: string
  turnChanges?: AgentTurnChanges
}

export function AgentChatActivityProvider({
  surface,
  activeWorkspaceProjectId,
  children,
}: {
  surface: AgentChatAppSurface
  activeWorkspaceProjectId: string | null
  children: React.ReactNode
}) {
  const sessionsRef = useRef(new Map<string, StreamSession>())
  const [runningVersion, setRunningVersion] = useState(0)
  const [unreadVersion, setUnreadVersion] = useState(0)

  const bumpRunning = useCallback(() => {
    setRunningVersion((n) => n + 1)
  }, [])

  const bumpUnread = useCallback(() => {
    setUnreadVersion((n) => n + 1)
  }, [])

  const runningProjectIds = useMemo(() => {
    void runningVersion
    const out = new Set<string>()
    for (const s of sessionsRef.current.values()) {
      out.add(s.projectId)
    }
    return out
  }, [runningVersion])

  const unreadProjectIds = useMemo(() => {
    void unreadVersion
    return readAgentChatUnreadProjectIds()
  }, [unreadVersion])

  const activityForProject = useCallback(
    (projectId: string): 'none' | 'running' | 'unread' => {
      if (runningProjectIds.has(projectId)) return 'running'
      if (unreadProjectIds.has(projectId)) return 'unread'
      return 'none'
    },
    [runningProjectIds, unreadProjectIds],
  )

  const persistAssistant = useCallback(async (session: StreamSession, content: string, role: 'assistant'): Promise<void> => {
    const trimmed = content.trim()
    if (!trimmed && !session.turnChanges) return
    const appendForProject = window.electron?.appendChatMessageForProject
    if (!appendForProject) {
      console.error('[AgentChatActivity] appendChatMessageForProject unavailable')
      return
    }
    const record: PersistedChatLineV1 = {
      schemaVersion: CHAT_STORE_SCHEMA_VERSION,
      id: session.assistantId,
      role,
      content,
      timestamp: session.assistantCreatedAt.toISOString(),
      model: session.model,
      ...(session.turnContext ? { turnContext: session.turnContext } : {}),
      ...(session.turnChanges ? { turnChanges: session.turnChanges } : {}),
    }
    const res = await appendForProject({ projectId: session.projectId, payload: record })
    if (!res.ok) {
      console.error('[AgentChatActivity] appendChatMessageForProject failed', res.error)
      return
    }
  }, [])

  const endSession = useCallback(
    async (
      streamId: string,
      kind: 'done' | 'cancelled' | 'error',
      opts: { errorMessage?: string } = {},
    ) => {
      const session = sessionsRef.current.get(streamId)
      if (!session) return

      sessionsRef.current.delete(streamId)
      bumpRunning()

      let assistantContent = session.buffer
      if (kind === 'error') {
        const err = opts.errorMessage?.trim() || 'Unknown error'
        assistantContent = formatTurnError(assistantContent, err)
      }

      await persistAssistant(session, assistantContent, 'assistant')

      const hadAssistant = assistantContent.trim().length > 0 || Boolean(session.turnChanges)
      if (hadAssistant) {
        publishChatThreadLine({
          schemaVersion: CHAT_STORE_SCHEMA_VERSION,
          id: session.assistantId,
          role: 'assistant',
          content: assistantContent,
          timestamp: session.assistantCreatedAt.toISOString(),
          model: session.model,
          ...(session.turnContext ? { turnContext: session.turnContext } : {}),
          ...(session.turnChanges ? { turnChanges: session.turnChanges } : {}),
        })
      }
      const onWorkspaceForProject =
        surface === 'workspace' && activeWorkspaceProjectId === session.projectId

      if (hadAssistant) {
        if (onWorkspaceForProject) {
          clearAgentChatUnread(session.projectId)
        } else {
          markAgentChatUnread(session.projectId)
        }
        bumpUnread()
      }
    },
    [activeWorkspaceProjectId, bumpRunning, bumpUnread, persistAssistant, surface],
  )

  useLayoutEffect(() => {
    const unsub = window.electron?.onAgentChatEvent?.((p: AgentChatEventPayload) => {
      const session = sessionsRef.current.get(p.streamId)
      if (!session) return

      if (p.phase === 'final_chunk') {
        session.buffer += p.delta
        return
      }

      if (p.phase === 'turn_started') {
        session.model = routingLabel(p.routing)
        return
      }

      if (p.phase === 'turn_changes') {
        session.turnChanges = p.changes
        return
      }

      if (p.phase === 'done') {
        void endSession(p.streamId, 'done')
        return
      }

      if (p.phase === 'cancelled') {
        void endSession(p.streamId, 'cancelled')
        return
      }

      if (p.phase === 'error') {
        void endSession(p.streamId, 'error', { errorMessage: p.error })
      }
    })
    return () => {
      unsub?.()
    }
  }, [endSession])

  useEffect(() => {
    if (surface === 'workspace' && activeWorkspaceProjectId) {
      clearAgentChatUnread(activeWorkspaceProjectId)
      bumpUnread()
    }
  }, [surface, activeWorkspaceProjectId, bumpUnread])

  const registerAgentStream = useCallback(
    (meta: AgentStreamRegistration) => {
      sessionsRef.current.set(meta.streamId, {
        ...meta,
        buffer: '',
      })
      bumpRunning()
    },
    [bumpRunning],
  )

  const unregisterAgentStream = useCallback(
    (streamId: string) => {
      if (sessionsRef.current.delete(streamId)) bumpRunning()
    },
    [bumpRunning],
  )

  const consumeInflightAssistantSnapshot = useCallback((projectId: string) => {
    for (const [sid, s] of sessionsRef.current) {
      if (s.projectId !== projectId) continue
      return {
        streamId: sid,
        assistantId: s.assistantId,
        content: s.buffer,
        model: s.model,
        createdAt: s.assistantCreatedAt,
        turnContext: s.turnContext,
      }
    }
    return null
  }, [])

  const value = useMemo(
    () =>
      ({
        registerAgentStream,
        unregisterAgentStream,
        consumeInflightAssistantSnapshot,
        activityForProject,
        refreshAgentChatUnreadUi: bumpUnread,
      }) satisfies AgentChatActivityContextValue,
    [
      activityForProject,
      bumpUnread,
      consumeInflightAssistantSnapshot,
      registerAgentStream,
      unregisterAgentStream,
    ],
  )

  return <AgentChatActivityContext.Provider value={value}>{children}</AgentChatActivityContext.Provider>
}
