import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, type MutableRefObject } from 'react'
import {
  Send,
  Square,
  MoreVertical,
  Trash2,
  Copy,
  Volume2,
  Loader2,
  FileText,
  RefreshCw,
  Folder,
  X,
  TextCursorInput,
  AlertTriangle,
  Play,
  Ban,
  FileDiff,
  SearchCode,
  Paperclip,
  Image as ImageIcon,
} from 'lucide-react'
import type {
  AgentChatAttachment,
  AgentChatActivityPayload,
  AgentCommandApprovalRequest,
  AgentChatEditorSelection,
  AgentChatEventPayload,
  AgentEditProposalRejectedFile,
  ChatTurnContextV1,
  DiffSession,
  GrokProjectManifest,
  Root,
  ChatMessage,
  PersistedChatLineV1,
} from '@/types'
import { CHAT_STORE_SCHEMA_VERSION, getModelForIntent, AGENT_CHAT_MAX_ATTACHMENTS } from '@/types'
import { cn } from '@/lib/utils'
import { ModelBadge } from '@/components/grokforge/ModelBadge'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { subscribeChatThreadLines } from '@/lib/chat-thread-bus'
import { subscribeVoiceUserDraft } from '@/lib/voice-user-draft-bus'
import { buildVoiceAgentHandoffUserText } from '@/lib/voice-agent-handoff'
import { useReadAloud, readAloudVoiceIdFromManifest } from '@/hooks/useReadAloud'
import { ChatThreadMarkdown } from '@/components/ChatThreadMarkdown'
import {
  AgentActivityTurnContextBanner,
  AssistantMessageContextFooter,
  ChatLiveContextStrip,
  UserMessageContextRow,
} from '@/components/ChatTurnContextUi'
import { AgentTurnTraceInspector } from '@/components/AgentTurnTraceInspector'
import { readStoredAgentWritesMode } from '@/lib/agent-writes-mode'
import { formatRootsForPrompt, isPathUnderWorkspaceRoots, normalizeFsPath } from '@/lib/workspace-path-check'
import { getLanguageFromPath } from '@/lib/getLanguageFromPath'
import { basenamePath } from '@/lib/workspace-paths'
import { assistantReplyClaimsDiskWrites } from '@/lib/assistant-disk-claim-heuristic'
import type { ParsedAgentToolBatch } from '../../../shared/agent-tool-schema'
import {
  extractAgentToolBatchFromAssistantText,
  stripAgentToolFenceFromAssistantDisplay,
} from '../../../shared/agent-tool-schema'
import { AGENT_TOOL_FENCE_INFO } from '../../../shared/agent-tool-contract'
import {
  GF_PLAN_FENCE,
  parseGfPlanFromAssistantContent,
  stripGfPlanFenceFromAssistantDisplay,
} from '../../../shared/gf-plan-contract'
import { PlanModeCard } from '@/components/PlanModeCard'
import { readConversationMode, writeConversationMode } from '@/lib/conversation-mode-storage'
import { supersedePendingPlansBeforeNewUserMessage } from '@/lib/plan-interaction-storage'
import { APPROVED_PLAN_AUTO_RUN_USER_TEXT } from '@/lib/approved-plan-auto-run'
import { buildTextAgentTurnContext, buildVoiceTurnContext } from '@/lib/chat-turn-context'
import { useAgentChatActivityOptional } from '@/context/AgentChatActivityProvider'
import {
  CHAT_ATTACHMENT_MAX_BYTES_BASE64_STAGING,
  CHAT_ATTACHMENT_MAX_FILE_BYTES,
  CHAT_ATTACHMENT_MAX_TOTAL_BYTES_PER_TURN,
} from '../../../shared/chat-attachment-contract'

type ApplyBatchOutcome = 'none' | 'partial' | 'complete'

interface ChatThreadProps {
  /** App storage project id (for plan interaction persistence). */
  projectId?: string | null
  project: GrokProjectManifest
  activeRoot: Root | null
  activeFilePath?: string | null
  openTabs?: Array<{ path: string; dirty: boolean }>
  attachments?: AgentChatAttachment[]
  editorSelection?: AgentChatEditorSelection | null
  onRemoveAttachment?: (attachment: AgentChatAttachment) => void
  onClearAttachments?: () => void
  /** Staged uploads merged into `attachments` in the shell. */
  onAddChatAttachments?: (items: AgentChatAttachment[]) => void
  /** After agent writes or undo, pass absolute paths so the editor can reload from disk. */
  onAgentDiskFilesChanged?: (paths: string[]) => void
  /** Open a workspace file in the editor tab strip. */
  onOpenFileInEditor?: (path: string) => void
  /** Open a read-only diff review in the editor column. */
  onOpenDiffSession?: (
    session: DiffSession,
    actions?: {
      primaryLabel: string
      onPrimary: () => void
      secondaryLabel?: string
      onSecondary?: () => void
      primaryDisabled?: boolean
    } | null,
  ) => void
  onCloseDiffSession?: () => void
  /** Filled with a bounded recent-thread summary for voice session hydration (077). */
  voiceThreadSummaryRef?: MutableRefObject<string>
  /** Registers an async handoff runner (voice → agent chat). */
  onRegisterVoiceHandoff?: (execute: (() => Promise<void>) | null) => void
  /** Stops the voice session before starting agent chat (from App / useVoiceSession). */
  onStopVoiceForHandoff?: () => Promise<void>
  /**
   * When the editor column is collapsed, a context bubble sits top-right over this panel —
   * reserve horizontal space so messages and composer do not run underneath it.
   */
  reserveContextBubbleInset?: boolean
}

type PendingEditProposal = {
  batch: ParsedAgentToolBatch
  rejected: AgentEditProposalRejectedFile[]
  source: 'tool' | 'fence'
}

function makeWelcomeMessage(project: GrokProjectManifest, activeRoot: Root | null): ChatMessage {
  return {
    id: 'welcome',
    role: 'assistant',
    content: `Hey! I'm GrokForge, your agentic coding companion. I've loaded your **${project.name}** project with ${project.roots.length} roots${activeRoot ? ` (active: **${activeRoot.label}**)` : ''}.\n\nI understand the full context across all roots. What would you like to build or change today?`,
    timestamp: new Date(),
  }
}

function lineToMessage(line: PersistedChatLineV1): ChatMessage {
  return {
    id: line.id,
    role: line.role,
    content: line.content,
    timestamp: new Date(line.timestamp),
    model: line.model,
    attachments: line.attachments,
    turnContext: line.turnContext,
  }
}

export function ChatThread({
  projectId = null,
  project,
  activeRoot,
  activeFilePath,
  openTabs = [],
  attachments = [],
  editorSelection,
  onRemoveAttachment,
  onClearAttachments,
  onAgentDiskFilesChanged,
  onOpenFileInEditor,
  onOpenDiffSession,
  onCloseDiffSession,
  onAddChatAttachments,
  reserveContextBubbleInset = false,
  voiceThreadSummaryRef,
  onRegisterVoiceHandoff,
  onStopVoiceForHandoff,
}: ChatThreadProps) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null)
  const [voiceUserDraft, setVoiceUserDraft] = useState<{ id: string; content: string } | null>(null)
  const [input, setInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [streamingStreamId, setStreamingStreamId] = useState<string | null>(null)
  /** True from send intent until stream/mock completes — blocks double Enter and double click. */
  const [isSending, setIsSending] = useState(false)
  /** While a turn is in flight, keep the transcript pinned to the latest chunk (avoids the user bubble sitting off-screen). */
  const pinChatToBottom = isSending || isThinking || !!streamingStreamId
  const messagesRef = useRef<ChatMessage[] | null>(null)
  const isSendingRef = useRef(false)
  messagesRef.current = messages
  isSendingRef.current = isSending
  /** Thread send path: fast default model vs stronger model (`manifest.models`). */
  const [chatModelIntent, setChatModelIntent] = useState<'chat_default' | 'planning'>('chat_default')
  /** Normal chat vs Plan mode — composer control; sole source of `activeContext.chatMode` for the agent. */
  const [conversationMode, setConversationMode] = useState<'normal' | 'plan'>('normal')
  const [planUiEpoch, setPlanUiEpoch] = useState(0)

  const displayThreadModel = useMemo(
    () => getModelForIntent(project, chatModelIntent),
    [project, chatModelIntent],
  )
  const planningModelId = useMemo(() => getModelForIntent(project, 'planning'), [project])

  const readAloudVoiceId = useMemo(() => readAloudVoiceIdFromManifest(project), [project])
  const readAloud = useReadAloud(readAloudVoiceId)

  const streamIdRef = useRef<string | null>(null)
  const assistantIdRef = useRef<string | null>(null)
  const streamHandlerRef = useRef<(p: AgentChatEventPayload) => void>(() => {})
  const assistantBufferRef = useRef('')
  const assistantCreatedAtRef = useRef<Date>(new Date())
  const proposalCreatedInTurnRef = useRef(false)
  /** Model id for the in-flight turn (persists correctly if the user toggles intent mid-stream). */
  const streamChatModelRef = useRef('')

  const onAgentDiskFilesChangedRef = useRef(onAgentDiskFilesChanged)
  const onOpenFileInEditorRef = useRef(onOpenFileInEditor)
  const onOpenDiffSessionRef = useRef(onOpenDiffSession)
  const onCloseDiffSessionRef = useRef(onCloseDiffSession)
  const agentActivity = useAgentChatActivityOptional()
  const projectRef = useRef(project)
  const activeRootRef = useRef(activeRoot)
  const agentActivityRef = useRef(agentActivity)
  projectRef.current = project
  activeRootRef.current = activeRoot
  agentActivityRef.current = agentActivity

  const welcomeKey = useMemo(
    () => `${project.name}\0${project.roots.map((r) => r.id).join(',')}\0${activeRoot?.id ?? ''}`,
    [project.name, project.roots, activeRoot?.id],
  )

  const displayMessages = useMemo(() => {
    if (!messages) return null
    if (!voiceUserDraft) return messages
    if (messages.some((m) => m.id === voiceUserDraft.id)) return messages
    const draftMessage: ChatMessage = {
      id: voiceUserDraft.id,
      role: 'user',
      content: voiceUserDraft.content,
      timestamp: new Date(),
      model: getModelForIntent(project, 'voice'),
      turnContext: buildVoiceTurnContext({
        project,
        activeRoot,
        activeFilePath: activeFilePath ?? null,
      }),
    }
    return [...messages, draftMessage]
  }, [messages, voiceUserDraft, project, activeRoot, activeFilePath])

  const threadList = useMemo(
    () => displayMessages ?? messages ?? [],
    [displayMessages, messages],
  )

  useEffect(() => {
    if (!voiceThreadSummaryRef || !messages) return
    const parts: string[] = []
    let total = 0
    const maxChars = 10_000
    const tail = messages.filter((m) => m.id !== 'welcome').slice(-32)
    for (const m of tail) {
      const line = `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.trim()}`
      if (total + line.length + 2 > maxChars) break
      parts.push(line)
      total += line.length + 2
    }
    voiceThreadSummaryRef.current = parts.join('\n\n')
  }, [messages, voiceThreadSummaryRef])

  useEffect(() => {
    onAgentDiskFilesChangedRef.current = onAgentDiskFilesChanged
    onOpenFileInEditorRef.current = onOpenFileInEditor
    onOpenDiffSessionRef.current = onOpenDiffSession
    onCloseDiffSessionRef.current = onCloseDiffSession
  }, [onAgentDiskFilesChanged, onOpenFileInEditor, onOpenDiffSession, onCloseDiffSession])

  useEffect(() => {
    setConversationMode(readConversationMode(projectId))
  }, [projectId])

  const [pendingProposal, setPendingProposal] = useState<PendingEditProposal | null>(null)
  const [agentActivities, setAgentActivities] = useState<AgentChatActivityPayload[]>([])
  const [activityOpen, setActivityOpen] = useState(false)
  const [dismissedSelectionKey, setDismissedSelectionKey] = useState<string | null>(null)
  const [commandApprovals, setCommandApprovals] = useState<AgentCommandApprovalRequest[]>([])
  const [traceInspectorOpen, setTraceInspectorOpen] = useState(false)
  /** Shown with agent activity rows so tool steps align with the scoped turn (story 065). */
  const [liveTurnContext, setLiveTurnContext] = useState<ChatTurnContextV1 | null>(null)

  const selectionKey = editorSelection
    ? `${editorSelection.path}:${editorSelection.startLine}-${editorSelection.endLine}:${editorSelection.text ?? ''}`
    : null
  const effectiveEditorSelection = editorSelection && selectionKey !== dismissedSelectionKey ? editorSelection : null

  const notifyDiskChange = useCallback((paths: string[]) => {
    if (paths.length === 0) return
    onAgentDiskFilesChangedRef.current?.(paths)
  }, [])

  const invokeApplyBatch = useCallback(async (payload: ParsedAgentToolBatch): Promise<ApplyBatchOutcome> => {
    const electron = window.electron
    if (!electron?.agentToolBatch) {
      toast.error('Apply requires the GrokForge desktop app.')
      return 'none'
    }
    const res = await electron.agentToolBatch(payload)
    if (!res.ok) {
      toast.error(res.error)
      return 'none'
    }
    const appliedPaths = res.applied.map((a) => a.path)
    const conflicts = res.conflicts ?? []
    const incomplete = conflicts.length > 0 || res.skipped.length > 0
    if (conflicts.length > 0) {
      toast.error('File changed since review', {
        duration: 18_000,
        description: `No conflicted files were overwritten. Close this review and open Review diff again to compare against current disk contents.\n\n${conflicts
          .slice(0, 8)
          .map((c) => `${c.path}\n  -> ${c.reason}`)
          .join('\n\n')}`,
      })
    }
    if (appliedPaths.length === 0) {
      if (res.skipped.length > 0) {
        const rootsLines = formatRootsForPrompt(project.roots)
        toast.error('No files were written', {
          duration: 18_000,
          description: `GrokForge only writes paths that sit under your workspace roots (exact prefixes). Wrong folder names (for example GrokForge vs GrokForgev02) or missing src/… segments are rejected.\n\nYour roots:\n${rootsLines}\n\n${res.skipped
            .slice(0, 8)
            .map((s) => `${s.path}\n  → ${s.reason}`)
            .join('\n\n')}`,
        })
      }
      return 'none'
    }
    notifyDiskChange(appliedPaths)
    const runUndo = async () => {
      const u = window.electron?.agentUndoLastBatch
      if (!u) return
      const ur = await u()
      if (ur.ok && ur.restoredPaths.length > 0) {
        notifyDiskChange(ur.restoredPaths)
        toast.message('Changes reverted')
      } else if (!ur.ok) {
        toast.error(ur.error)
      }
    }
    toast.success(`Updated ${appliedPaths.length} file(s)`, {
      description: incomplete
        ? 'Some paths were not applied. Open tabs whose paths match were reloaded from disk.'
        : 'Open tabs whose paths match were reloaded from disk.',
      action: { label: 'Undo', onClick: () => void runUndo() },
    })
    if (res.skipped.length > 0) {
      toast.message('Some writes were skipped', {
        description: res.skipped
          .slice(0, 6)
          .map((s) => `${s.path}: ${s.reason}`)
          .join(' · '),
      })
    }
    return incomplete ? 'partial' : 'complete'
  }, [notifyDiskChange, project.roots])

  const handleAssistantTurnComplete = useCallback(
    (content: string) => {
      const parsed = extractAgentToolBatchFromAssistantText(content)
      if (!parsed) {
        setPendingProposal(null)
        return
      }
      const mode = readStoredAgentWritesMode()
      if (mode === 'auto_apply') {
        setPendingProposal(null)
        void invokeApplyBatch(parsed)
      } else {
        setPendingProposal({ batch: parsed, rejected: [], source: 'fence' })
      }
    },
    [invokeApplyBatch],
  )

  const pendingWriteBatch = pendingProposal?.batch ?? null
  const pendingRejectedPaths = pendingProposal?.rejected ?? []

  const pendingUniquePaths = useMemo(() => {
    if (!pendingWriteBatch) return []
    return Array.from(new Set(pendingWriteBatch.operations.map((o) => o.path)))
  }, [pendingWriteBatch])

  const pendingPathPreflight = useMemo(() => {
    return pendingUniquePaths.map((path) => ({
      path,
      underRoot: isPathUnderWorkspaceRoots(path, project.roots),
    }))
  }, [pendingUniquePaths, project.roots])

  const pendingOpByNormalizedPath = useMemo(() => {
    const out = new Map<string, ParsedAgentToolBatch['operations'][number]>()
    for (const op of pendingWriteBatch?.operations ?? []) {
      out.set(normalizeFsPath(op.path), op)
    }
    return out
  }, [pendingWriteBatch])

  const hasAnyApplyablePath = pendingPathPreflight.some((p) => p.underRoot)

  const findRootForPath = useCallback((path: string): Root | null => {
    const candidate = normalizeFsPath(path)
    if (!candidate) return null
    const roots = [...project.roots].sort((a, b) => normalizeFsPath(b.path).length - normalizeFsPath(a.path).length)
    for (const root of roots) {
      const rootPath = normalizeFsPath(root.path)
      if (!rootPath || rootPath === '/') continue
      if (candidate === rootPath || candidate.startsWith(rootPath.endsWith('/') ? rootPath : `${rootPath}/`)) return root
    }
    return null
  }, [project.roots])

  const appendPersistedLine = useCallback(async (m: ChatMessage) => {
    const electron = window.electron
    if (!electron?.appendChatMessage) return
    if (m.id === 'welcome') return
    const payload: PersistedChatLineV1 = {
      schemaVersion: CHAT_STORE_SCHEMA_VERSION,
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: (m.timestamp instanceof Date ? m.timestamp : new Date(m.timestamp)).toISOString(),
      model: m.model,
      attachments: m.attachments,
      ...(m.turnContext ? { turnContext: m.turnContext } : {}),
    }
    const res = await electron.appendChatMessage(payload)
    if (!res.ok) toast.error(res.error)
  }, [])

  const processAgentStreamEvent = useCallback((p: AgentChatEventPayload) => {
    if (p.streamId !== streamIdRef.current) return
    if (p.phase === 'activity') {
      setAgentActivities((prev) => {
        const idx = prev.findIndex((a) => a.id === p.activity.id)
        if (idx === -1) return [...prev, p.activity].slice(-12)
        const next = [...prev]
        next[idx] = p.activity
        return next
      })
      return
    }
    if (p.phase === 'command_approval_required') {
      setCommandApprovals((prev) => {
        if (prev.some((item) => item.requestId === p.request.requestId)) return prev
        return [...prev, p.request].slice(-4)
      })
      return
    }
    if (p.phase === 'edit_proposal') {
      proposalCreatedInTurnRef.current = true
      const batch = p.proposal.batch as ParsedAgentToolBatch
      const mode = readStoredAgentWritesMode()
      if (mode === 'auto_apply') {
        setPendingProposal(null)
        void invokeApplyBatch(batch)
      } else {
        setPendingProposal({ batch, rejected: p.proposal.rejected, source: 'tool' })
      }
      if (p.proposal.rejected.length > 0) {
        toast.message('Some proposed paths were rejected', {
          description: p.proposal.rejected
            .slice(0, 4)
            .map((item) => `${item.path}: ${item.reason}`)
            .join(' · '),
        })
      }
      return
    }
    if (p.phase === 'activity_clear_running') {
      setAgentActivities((prev) =>
        prev.map((a) =>
          a.status === 'running'
            ? {
                ...a,
                status: p.reason === 'done' ? 'done' : 'error',
                title:
                  p.reason === 'cancelled'
                    ? `${a.title} cancelled`
                    : p.reason === 'error'
                      ? `${a.title} stopped`
                      : a.title,
              }
            : a,
        ),
      )
      return
    }
    if (p.phase === 'turn_started') {
      return
    }
    if (p.phase === 'final_chunk') {
      assistantBufferRef.current += p.delta
      setMessages((prev) =>
        prev
          ? prev.map((m) => (m.id === assistantIdRef.current ? { ...m, content: m.content + p.delta } : m))
          : prev,
      )
      return
    }
    if (p.phase === 'done') {
      streamHandlerRef.current = () => {}
      streamIdRef.current = null
      const endedAssistantId = assistantIdRef.current
      assistantIdRef.current = null
      const finalContent = assistantBufferRef.current
      if (finalContent.trim()) {
        /* Assistant line persisted by AgentChatActivityProvider (070). */
      } else if (endedAssistantId) {
        setMessages((prev) => (prev ? prev.filter((m) => m.id !== endedAssistantId) : prev))
      }
      setIsThinking(false)
      setStreamingStreamId(null)
      setIsSending(false)
      setCommandApprovals([])
      const hadProposal = proposalCreatedInTurnRef.current
      const trimmedFinal = finalContent.trim()
      if (
        trimmedFinal &&
        !hadProposal &&
        extractAgentToolBatchFromAssistantText(finalContent) === null &&
        assistantReplyClaimsDiskWrites(finalContent)
      ) {
        toast.message('No file edit proposal was attached', {
          description:
            'This reply reads like files were already changed, but GrokForge did not receive the grokforge-agent-tools JSON fence or a propose_file_edits tool result. Ask the model to emit the edit block or call propose_file_edits.',
          duration: 14_000,
        })
      }
      if (!hadProposal) handleAssistantTurnComplete(finalContent)
      proposalCreatedInTurnRef.current = false
      setLiveTurnContext(null)
      return
    }
    if (p.phase === 'cancelled') {
      streamHandlerRef.current = () => {}
      streamIdRef.current = null
      const endedAssistantId = assistantIdRef.current
      assistantIdRef.current = null
      setIsThinking(false)
      setStreamingStreamId(null)
      setIsSending(false)
      setCommandApprovals([])
      setLiveTurnContext(null)
      setMessages((prev) =>
        prev ? prev.filter((m) => m.id !== endedAssistantId || m.content.trim().length > 0) : prev,
      )
      return
    }
    if (p.phase === 'error') {
      toast.error(p.error)
      streamHandlerRef.current = () => {}
      streamIdRef.current = null
      const erroredAssistantId = assistantIdRef.current
      assistantIdRef.current = null
      setIsThinking(false)
      setStreamingStreamId(null)
      setIsSending(false)
      setCommandApprovals([])
      setLiveTurnContext(null)
      setMessages((prev) =>
        prev
          ? prev.map((m) =>
              m.id === erroredAssistantId
                ? { ...m, content: m.content.trim() ? m.content : `_(Error: ${p.error})_` }
                : m,
            )
          : prev,
      )
      return
    }
  }, [handleAssistantTurnComplete, invokeApplyBatch])

  const processAgentStreamEventRef = useRef(processAgentStreamEvent)
  processAgentStreamEventRef.current = processAgentStreamEvent

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const el = window.electron
      const emptyWelcome = makeWelcomeMessage(projectRef.current, activeRootRef.current)
      if (!el?.loadChatThread) {
        if (!cancelled) setMessages([emptyWelcome])
        return
      }
      const res = await el.loadChatThread()
      if (cancelled) return
      if (!res.ok) {
        toast.error(res.error)
        setMessages([emptyWelcome])
        return
      }
      if (res.wasCorrupt) {
        toast.message('Chat history was unreadable and was reset', {
          description: 'The on-disk log was removed. Earlier lines could not be recovered.',
        })
      }
      const restored = res.messages.filter((m) => m.id !== 'welcome')
      let nextMessages: ChatMessage[] =
        restored.length > 0 ? restored.map(lineToMessage) : [emptyWelcome]

      const inflight = agentActivityRef.current?.consumeInflightAssistantSnapshot(projectId ?? '')
      if (!cancelled && inflight && projectId && !nextMessages.some((m) => m.id === inflight.assistantId)) {
        nextMessages = [
          ...nextMessages,
          {
            id: inflight.assistantId,
            role: 'assistant',
            content: inflight.content,
            timestamp: inflight.createdAt,
            model: inflight.model,
            turnContext: inflight.turnContext,
          },
        ]
        streamIdRef.current = inflight.streamId
        assistantIdRef.current = inflight.assistantId
        assistantBufferRef.current = inflight.content
        assistantCreatedAtRef.current = inflight.createdAt
        if (inflight.model) streamChatModelRef.current = inflight.model
        if (inflight.turnContext) setLiveTurnContext(inflight.turnContext)
        streamHandlerRef.current = processAgentStreamEventRef.current
        setIsThinking(true)
        setStreamingStreamId(inflight.streamId)
        setIsSending(true)
      }

      if (!cancelled) setMessages(nextMessages)
    })()
    return () => {
      cancelled = true
    }
  }, [projectId])

  useEffect(() => {
    setMessages((prev) => {
      if (!prev || !prev.some((m) => m.id === 'welcome')) return prev
      return prev.map((m) =>
        m.id === 'welcome' ? makeWelcomeMessage(projectRef.current, activeRootRef.current) : m,
      )
    })
  }, [welcomeKey])

  useEffect(() => {
    const unsub = subscribeChatThreadLines((line) => {
      setVoiceUserDraft((d) => (d && line.role === 'user' && line.id === d.id ? null : d))
      setMessages((prev) => (prev ? [...prev, lineToMessage(line)] : prev))
    })
    return unsub
  }, [])

  useEffect(() => {
    const unsub = subscribeVoiceUserDraft((ev) => {
      if (ev.kind === 'clear') setVoiceUserDraft(null)
      else setVoiceUserDraft({ id: ev.id, content: ev.content })
    })
    return unsub
  }, [])

  useEffect(() => {
    const unsub = window.electron?.onAgentChatEvent?.((p) => streamHandlerRef.current(p))
    return () => {
      unsub?.()
    }
  }, [])

  useEffect(() => {
    return () => {
      streamHandlerRef.current = () => {}
    }
  }, [])

  const messagesScrollRef = useRef<HTMLDivElement>(null)
  const attachmentFileInputRef = useRef<HTMLInputElement>(null)
  const [composerDragActive, setComposerDragActive] = useState(false)
  const messagesHydrated = messages !== null

  /** After disk hydration (or welcome fallback), anchor the viewport to the latest messages — remount per `projectId` resets deps. */
  useLayoutEffect(() => {
    if (!messagesHydrated) return
    const root = messagesScrollRef.current
    if (!root) return

    const scrollToBottom = () => {
      root.scrollTop = Math.max(0, root.scrollHeight - root.clientHeight)
    }

    scrollToBottom()
    let raf1 = 0
    let raf2 = 0
    raf1 = requestAnimationFrame(() => {
      scrollToBottom()
      raf2 = requestAnimationFrame(scrollToBottom)
    })
    const t = window.setTimeout(scrollToBottom, 200)

    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      window.clearTimeout(t)
    }
  }, [projectId, messagesHydrated])

  /** During an agent turn, keep the scroll viewport pinned so the user bubble and streaming reply stay in view. */
  useLayoutEffect(() => {
    if (!threadList.length || !pinChatToBottom) return
    const root = messagesScrollRef.current
    if (!root) return
    const scrollToBottom = () => {
      root.scrollTop = Math.max(0, root.scrollHeight - root.clientHeight)
    }
    scrollToBottom()
    const raf = requestAnimationFrame(scrollToBottom)
    return () => cancelAnimationFrame(raf)
  }, [threadList, pinChatToBottom])

  const handleClearThread = async () => {
    const el = window.electron
    if (!el?.clearChatThread) {
      toast.error('Clear history requires the GrokForge desktop app.')
      return
    }
    const res = await el.clearChatThread()
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setMessages([makeWelcomeMessage(project, activeRoot)])
    setPendingProposal(null)
    if (projectId) {
      try {
        localStorage.removeItem(`grokforge.planInteraction.v1:${projectId}`)
      } catch {
        /* ignore */
      }
    }
    toast.message('Chat history cleared')
  }

  const handleRefreshProjectIntelligence = async () => {
    const el = window.electron
    if (!el?.refreshProjectIntelligence) {
      toast.error('Project intelligence refresh requires the GrokForge desktop app.')
      return
    }
    const res = await el.refreshProjectIntelligence()
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success('Project intelligence refreshed', {
      description: `${res.fileCountScanned} indexed file(s); ${res.sensitiveSkipped} sensitive file(s) excluded.`,
    })
  }

  type StartAgentTurnOptions = {
    /** Clear composer input and attachments after a successful start; restore input if start fails. Default true. */
    manageComposerInput?: boolean
    activeChatMode?: 'fast' | 'plan'
    modelIntent?: 'chat_default' | 'planning'
    supersedePlans?: boolean
    baseMessages: ChatMessage[]
  }

  const startAgentTurnWithUserText = async (text: string, options: StartAgentTurnOptions) => {
    const trimmed = text.trim()
    const manageComposerInput = options.manageComposerInput !== false
    const supersedePlans = options.supersedePlans !== false
    const { baseMessages } = options

    if (!trimmed || isSending) return

    if (supersedePlans && projectId) {
      supersedePendingPlansBeforeNewUserMessage(
        projectId,
        baseMessages.filter((m) => m.id !== 'welcome').map((m) => ({ id: m.id, role: m.role, content: m.content })),
      )
      setPlanUiEpoch((n) => n + 1)
    }

    setPendingProposal(null)

    const electron = window.electron
    if (!electron?.agentChatCapabilities || !electron.agentChatStart || !electron.agentChatCancel) {
      toast.error('Chat requires the GrokForge desktop app.')
      return
    }

    const effectiveActiveChatMode =
      options.activeChatMode ?? (conversationMode === 'plan' ? 'plan' : 'fast')
    const effectiveModelIntent = options.modelIntent ?? chatModelIntent

    const turnCtx = buildTextAgentTurnContext({
      project,
      activeRoot,
      activeFilePath: activeFilePath ?? null,
      modelIntent: effectiveModelIntent,
      chatMode: effectiveActiveChatMode,
    })

    setIsSending(true)

    try {
      const caps = await electron.agentChatCapabilities()

      if (!caps.apiKeyConfigured) {
        toast.message('Grok API key not configured', {
          description:
            'Add your key in Settings, or set XAI_API_KEY / GROKFORGE_XAI_API_KEY in .env or your shell (see .env.example). Using a mock reply for now.',
        })
        streamChatModelRef.current = getModelForIntent(project, effectiveModelIntent, { logSelection: true })
        const userMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'user',
          content: trimmed,
          timestamp: new Date(),
          model: streamChatModelRef.current,
          turnContext: turnCtx,
        }
        setMessages((prev) => (prev ? [...prev, userMessage] : prev))
        void appendPersistedLine(userMessage)
        if (manageComposerInput) setInput('')
        setIsThinking(true)
        window.setTimeout(() => {
          const mockPlanFence =
            effectiveActiveChatMode === 'plan'
              ? `\n\n\`\`\`${GF_PLAN_FENCE}\n${JSON.stringify(
                  {
                    schemaVersion: 1,
                    summary: 'Mock plan: explore the workspace, then implement requested changes safely.',
                    filesLikelyTouched: project.roots.map((r) => `${r.label}/*`),
                    risksUnknowns: ['This is a mock reply without a live model.'],
                    steps: [
                      { id: '1', title: 'Review workspace roots and key files' },
                      { id: '2', title: 'Implement changes with propose_file_edits / tools' },
                      { id: '3', title: 'Verify with tests or typecheck' },
                    ],
                    verification: 'Run project tests or typecheck after edits.',
                  },
                  null,
                  2,
                )}\n\`\`\`\n`
              : ''
          const response: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `Understood. I've analyzed the full workspace (${project.roots.map((r) => r.label).join(', ')}).\n\nHere's my plan:\n\n1. **Update auth flow** in both frontend and backend roots for consistency\n2. **Add new dashboard components** using shadcn/ui + Tailwind v4\n3. **Sync changes** to the design and docs roots\n\nWould you like me to start executing this across the multi-root workspace?${mockPlanFence}`,
            timestamp: new Date(),
            model: streamChatModelRef.current,
            turnContext: turnCtx,
          }
          setMessages((prev) => (prev ? [...prev, response] : prev))
          void appendPersistedLine(response)
          handleAssistantTurnComplete(response.content)
          if (manageComposerInput) {
            onClearAttachments?.()
            if (selectionKey) setDismissedSelectionKey(selectionKey)
          }
          setIsThinking(false)
          setIsSending(false)
        }, 1200)
        return
      }

      const priorSnapshot = baseMessages
      streamChatModelRef.current = getModelForIntent(project, effectiveModelIntent, { logSelection: true })

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: trimmed,
        timestamp: new Date(),
        model: streamChatModelRef.current,
        turnContext: turnCtx,
        attachments:
          attachments.length > 0
            ? attachments.map((a) => ({
                type: a.type,
                path: a.path,
              }))
            : undefined,
      }
      setMessages((prev) => (prev ? [...prev, userMessage] : prev))
      if (manageComposerInput) setInput('')

      const streamId = crypto.randomUUID()
      const assistantId = crypto.randomUUID()
      assistantIdRef.current = assistantId
      streamIdRef.current = streamId
      assistantBufferRef.current = ''
      assistantCreatedAtRef.current = new Date()
      proposalCreatedInTurnRef.current = false
      setAgentActivities([])
      setActivityOpen(false)

      const assistantShell: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: assistantCreatedAtRef.current,
        model: streamChatModelRef.current,
        turnContext: turnCtx,
      }
      setMessages((prev) => (prev ? [...prev, assistantShell] : prev))
      setIsThinking(true)
      setStreamingStreamId(streamId)

      streamHandlerRef.current = processAgentStreamEventRef.current
      if (projectId && agentActivity) {
        agentActivity.registerAgentStream({
          streamId,
          projectId,
          assistantId,
          model: streamChatModelRef.current,
          assistantCreatedAt: assistantCreatedAtRef.current,
          turnContext: turnCtx,
        })
      }

      const threadSnapshot = priorSnapshot
        .filter((m) => m.id !== 'welcome')
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .filter((m) => m.role !== 'assistant' || m.content.trim().length > 0)
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
      const start = await electron.agentChatStart({
        streamId,
        model: streamChatModelRef.current,
        userText: trimmed,
        threadSnapshot,
        activeContext: {
          activeRootId: activeRoot?.id ?? null,
          activeFilePath: activeFilePath ?? null,
          openTabs,
          attachments,
          editorSelection: effectiveEditorSelection,
          chatMode: effectiveActiveChatMode,
        },
      })

      if (!start.ok) {
        toast.error(start.error)
        agentActivity?.unregisterAgentStream(streamId)
        streamHandlerRef.current = () => {}
        streamIdRef.current = null
        assistantIdRef.current = null
        setIsThinking(false)
        setStreamingStreamId(null)
        setIsSending(false)
        setLiveTurnContext(null)
        setMessages((prev) =>
          prev ? prev.filter((m) => m.id !== userMessage.id && m.id !== assistantId) : prev,
        )
        if (manageComposerInput) setInput(trimmed)
        return
      }

      setLiveTurnContext(turnCtx)
      void appendPersistedLine(userMessage)
      if (manageComposerInput) {
        onClearAttachments?.()
        if (selectionKey) setDismissedSelectionKey(selectionKey)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to send message'
      toast.error(msg)
      const sid = streamIdRef.current
      if (sid) agentActivity?.unregisterAgentStream(sid)
      const aid = assistantIdRef.current
      streamHandlerRef.current = () => {}
      streamIdRef.current = null
      assistantIdRef.current = null
      if (aid) {
        setMessages((prev) => (prev ? prev.filter((m) => m.id !== aid || m.content.trim().length > 0) : prev))
      }
      setIsSending(false)
      setIsThinking(false)
      setStreamingStreamId(null)
      setLiveTurnContext(null)
    }
  }

  const startAgentTurnWithUserTextRef = useRef(startAgentTurnWithUserText)
  startAgentTurnWithUserTextRef.current = startAgentTurnWithUserText
  const onStopVoiceForHandoffRef = useRef(onStopVoiceForHandoff)
  onStopVoiceForHandoffRef.current = onStopVoiceForHandoff

  useLayoutEffect(() => {
    if (!onRegisterVoiceHandoff) return
    const run = async () => {
      if (isSendingRef.current) {
        toast.message('Agent is busy', {
          description: 'Wait for the current turn to finish, then try handoff again.',
        })
        return
      }
      const msgs = messagesRef.current
      if (!msgs?.length) return
      const text = buildVoiceAgentHandoffUserText(msgs)
      if (!text.trim()) return
      try {
        await onStopVoiceForHandoffRef.current?.()
      } catch {
        /* ignore */
      }
      await startAgentTurnWithUserTextRef.current(text, { baseMessages: msgs, manageComposerInput: false })
    }
    onRegisterVoiceHandoff(run)
    return () => onRegisterVoiceHandoff(null)
  }, [onRegisterVoiceHandoff])

  const sendMessage = async () => {
    const text = input.trim()
    if (!messages || !text || isSending) return
    await startAgentTurnWithUserText(text, { baseMessages: messages })
  }

  const handlePlanApproveAndRun = () => {
    if (!messages) return
    if (isSending) {
      toast.message('Agent is busy', {
        description: 'Wait for the current turn to finish, then approve again.',
      })
      return
    }
    if (projectId) {
      writeConversationMode(projectId, 'normal')
      setConversationMode('normal')
    }
    setChatModelIntent('chat_default')
    void startAgentTurnWithUserText(APPROVED_PLAN_AUTO_RUN_USER_TEXT, {
      manageComposerInput: false,
      activeChatMode: 'fast',
      modelIntent: 'chat_default',
      baseMessages: messages,
      supersedePlans: true,
    })
  }

  const cancelStream = () => {
    const id = streamIdRef.current
    if (!id || !window.electron?.agentChatCancel) return
    void window.electron.agentChatCancel(id)
  }

  const applyPendingBatch = useCallback(() => {
    const pending = pendingWriteBatch
    if (!pending) return
    void (async () => {
      const outcome = await invokeApplyBatch(pending)
      if (outcome !== 'none') setPendingProposal(null)
      if (outcome === 'complete') onCloseDiffSessionRef.current?.()
    })()
  }, [pendingWriteBatch, invokeApplyBatch])

  const reviewPendingBatch = useCallback(() => {
    const pending = pendingWriteBatch
    const openDiff = onOpenDiffSessionRef.current
    if (!pending || !openDiff) return
    const readFile = window.electron?.readFile
    if (!readFile) {
      toast.error('Diff review requires the GrokForge desktop app.')
      return
    }

    void (async () => {
      const byPath = new Map<string, ParsedAgentToolBatch['operations'][number]>()
      for (const op of pending.operations) {
        if (!isPathUnderWorkspaceRoots(op.path, project.roots)) continue
        byPath.set(normalizeFsPath(op.path), op)
      }

      if (byPath.size === 0) {
        toast.error('No reviewable paths', {
          description: 'All proposed writes are outside your workspace roots.',
        })
        return
      }

      const sessionId = `agent-proposal-${Date.now().toString(36)}`
      const files: DiffSession['files'] = []
      const reviewedOperations: ParsedAgentToolBatch['operations'] = []
      let skipped = 0

      for (const [normalizedPath, op] of byPath) {
        const root = findRootForPath(op.path)
        if (!root) {
          skipped += 1
          continue
        }
        const original = await readFile(op.path)
        const expectedOriginalContent = original
        files.push({
          id: `${sessionId}:${files.length}:${normalizedPath}`,
          rootId: root.id,
          rootLabel: root.label,
          path: op.path,
          status: op.op === 'delete_file' ? 'deleted' : expectedOriginalContent === null ? 'created' : 'modified',
          language: getLanguageFromPath(op.path),
          original: expectedOriginalContent ?? '',
          modified: op.op === 'write_file' ? op.content : '',
        })
        reviewedOperations.push({
          ...op,
          expectedOriginalContent,
        })
      }

      if (files.length === 0) {
        toast.error('No files could be loaded for review')
        return
      }

      if (skipped > 0) {
        toast.message('Some proposed paths were skipped', {
          description: 'Only paths under a workspace root are included in this review.',
        })
      }

      openDiff(
        {
          id: sessionId,
          title: 'Agent proposed edits',
          description: `${files.length} ${files.length === 1 ? 'file' : 'files'} ready for review`,
          files,
          source: 'agent-proposal',
        },
        {
          primaryLabel: 'Apply all',
          onPrimary: () => {
            void (async () => {
              const outcome = await invokeApplyBatch({ ...pending, operations: reviewedOperations })
              if (outcome === 'none') return
              setPendingProposal(null)
              if (outcome === 'complete') onCloseDiffSessionRef.current?.()
            })()
          },
          secondaryLabel: 'Discard',
          onSecondary: () => {
            setPendingProposal(null)
            onCloseDiffSessionRef.current?.()
          },
          primaryDisabled: !hasAnyApplyablePath,
        },
      )
    })()
  }, [findRootForPath, hasAnyApplyablePath, invokeApplyBatch, pendingWriteBatch, project.roots])

  const respondToCommandApproval = useCallback(async (request: AgentCommandApprovalRequest, approved: boolean) => {
    const api = window.electron?.agentCommandApprovalRespond
    if (!api) {
      toast.error('Command approval requires the GrokForge desktop app.')
      return
    }
    const res = await api({ streamId: request.streamId, requestId: request.requestId, approved })
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setCommandApprovals((prev) => prev.filter((item) => item.requestId !== request.requestId))
  }, [])

  const copyCommandApproval = useCallback(async (request: AgentCommandApprovalRequest) => {
    const api = window.electron?.writeClipboardText
    if (!api) {
      toast.error('Clipboard requires the GrokForge desktop app.')
      return
    }
    const res = await api(request.command)
    if (res.ok) toast.success('Command copied')
    else toast.error(res.error || 'Could not copy command')
  }, [])

  const ingestFilesForChat = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList)
      const el = window.electron
      if (!el?.stageChatAttachment) {
        toast.error('Attachments require the GrokForge desktop app.')
        return
      }
      if (!projectId) {
        toast.error('Save this workspace as a project before attaching files.')
        return
      }

      const added: AgentChatAttachment[] = []
      let pendingBytes = attachments.reduce((sum, a) => sum + (a.byteSize ?? 0), 0)

      const uint8ToBase64 = (bytes: Uint8Array): string => {
        let binary = ''
        const chunkSize = 0x8000
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize) as unknown as number[])
        }
        return btoa(binary)
      }

      for (const file of files) {
        if (file.name === '.' || file.name === '..') continue
        if (attachments.length + added.length >= AGENT_CHAT_MAX_ATTACHMENTS) {
          toast.message('Attachment limit reached', {
            description: `At most ${AGENT_CHAT_MAX_ATTACHMENTS} items per message.`,
          })
          break
        }
        if (file.size > CHAT_ATTACHMENT_MAX_FILE_BYTES) {
          toast.error(`Too large: ${file.name}`, {
            description: `Max ${Math.round(CHAT_ATTACHMENT_MAX_FILE_BYTES / (1024 * 1024))} MiB per file.`,
          })
          continue
        }
        if (pendingBytes + file.size > CHAT_ATTACHMENT_MAX_TOTAL_BYTES_PER_TURN) {
          toast.error('Total attachment size limit reached', {
            description: `Max ${Math.round(CHAT_ATTACHMENT_MAX_TOTAL_BYTES_PER_TURN / (1024 * 1024))} MiB of files per message.`,
          })
          break
        }

        let res: Awaited<ReturnType<typeof el.stageChatAttachment>>
        const srcPath = typeof file.path === 'string' && file.path.trim() ? file.path.trim() : ''
        if (srcPath) {
          res = await el.stageChatAttachment({ kind: 'path', projectId, sourcePath: srcPath })
        } else {
          if (file.size > CHAT_ATTACHMENT_MAX_BYTES_BASE64_STAGING) {
            toast.error(`Cannot attach: ${file.name}`, {
              description:
                'This file has no desktop path. Pick files from disk, or use a file under 8 MiB for inline staging.',
            })
            continue
          }
          const buf = new Uint8Array(await file.arrayBuffer())
          res = await el.stageChatAttachment({
            kind: 'bytes',
            projectId,
            base64: uint8ToBase64(buf),
            originalName: file.name,
            mediaType: file.type || undefined,
          })
        }
        if (!res.ok) {
          toast.error(res.error)
          continue
        }
        added.push({
          type: 'file',
          path: res.path,
          source: 'upload',
          displayName: res.displayName,
          mediaType: res.mediaType,
          byteSize: res.byteSize,
        })
        pendingBytes += res.byteSize
      }

      if (added.length) {
        onAddChatAttachments?.(added)
        toast.success(added.length === 1 ? 'Attached 1 file' : `Attached ${added.length} files`)
      }
    },
    [attachments, onAddChatAttachments, projectId],
  )

  const busy = isSending || isThinking || !!streamingStreamId
  const hasContextChips = attachments.length > 0 || Boolean(effectiveEditorSelection)

  const compactPathLabel = (path: string) => {
    const parts = path.split(/[\\/]/).filter(Boolean)
    if (parts.length <= 2) return path
    return `${parts.at(-2)}/${parts.at(-1)}`
  }
  const relativePendingPathLabel = (path: string) => {
    const normalized = normalizeFsPath(path)
    const root = project.roots
      .map((item) => ({ root: item, normalized: normalizeFsPath(item.path) }))
      .filter((item) => item.normalized && normalized.startsWith(item.normalized))
      .sort((a, b) => b.normalized.length - a.normalized.length)[0]
    if (!root) return path
    if (normalized === root.normalized) return basenamePath(path)
    return normalized.slice(root.normalized.length + 1)
  }
  const riskLabel = (request: AgentCommandApprovalRequest) => {
    if (request.risk === 'network_or_install') return 'Network/install'
    if (request.risk === 'soft_risk') return 'Elevated risk'
    return 'Approval required'
  }

  if (messages === null) {
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-col items-center justify-center bg-zinc-950 text-sm text-zinc-500">
        Loading thread…
      </div>
    )
  }

  return (
    <>
    <div className="grid h-full min-h-0 min-w-0 w-full flex-1 grid-rows-[minmax(0,1fr)_auto] overflow-hidden bg-zinc-950">
      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        <div
          ref={messagesScrollRef}
          className="custom-scrollbar flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-x-hidden overflow-y-auto"
        >
        <div className="flex min-h-full min-w-0 w-full flex-col">
          <div className="min-h-0 flex-1 basis-0" aria-hidden />
          <div
            className={cn(
              'min-w-0 w-full max-w-full shrink-0 space-y-6 px-4 pb-4 pt-4',
              reserveContextBubbleInset
                ? 'pr-[min(19rem,calc(100%-2.5rem))]'
                : 'pr-4',
            )}
          >
          <ChatLiveContextStrip
            project={project}
            activeRoot={activeRoot}
            activeFilePath={activeFilePath}
            conversationMode={conversationMode}
            chatModelIntent={chatModelIntent}
            displayThreadModel={displayThreadModel}
          />
          <AnimatePresence>
            {threadList.map((msg, index) => {
              const plan =
                msg.role === 'assistant' ? parseGfPlanFromAssistantContent(msg.content) : null
              const assistantMarkdown =
                msg.role === 'assistant' ? stripGfPlanFenceFromAssistantDisplay(msg.content) : msg.content
              const assistantVisible =
                msg.role === 'assistant'
                  ? stripAgentToolFenceFromAssistantDisplay(assistantMarkdown)
                  : msg.content
              const showAssistantMd = msg.role === 'assistant' && assistantVisible.trim().length > 0
              const showEmptyToolFence =
                msg.role === 'assistant' &&
                msg.content.trim().length > 0 &&
                !assistantVisible.trim() &&
                !plan &&
                msg.content.includes(AGENT_TOOL_FENCE_INFO)
              const showGfPlanStreaming =
                msg.role === 'assistant' &&
                msg.content.trim().length > 0 &&
                !assistantVisible.trim() &&
                !plan &&
                new RegExp('```\\s*' + GF_PLAN_FENCE, 'i').test(msg.content)
              return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                className={cn(
                  'flex w-full min-w-0 max-w-full overflow-x-hidden',
                  msg.role === 'user' ? 'justify-end' : 'justify-start',
                )}
              >
                <div
                  className={cn(
                    'min-w-0',
                    msg.role === 'user'
                      ? cn(
                          'rounded-2xl border bg-zinc-800/95 px-4 py-3 text-zinc-100 shadow-sm',
                          msg.turnContext?.source === 'voice'
                            ? 'border-violet-600/45 shadow-[0_0_0_1px_rgba(139,92,246,0.12)]'
                            : 'border-zinc-700/90',
                          reserveContextBubbleInset
                            ? 'max-w-[min(85%,min(26rem,calc(100%-1rem)))]'
                            : 'max-w-[min(85%,26rem)]',
                        )
                      : cn(
                          'w-full max-w-full px-0 py-1',
                          (msg.turnContext?.source === 'voice' || msg.model?.startsWith('grok-voice')) &&
                            'border-l-2 border-l-violet-500/45 pl-2',
                        ),
                  )}
                >
                  {msg.role === 'assistant' ? (
                    msg.content.trim() ? (
                      <>
                        {showAssistantMd ? (
                          <ChatThreadMarkdown content={assistantVisible} role="assistant" />
                        ) : showEmptyToolFence ? (
                          <p className="text-sm leading-relaxed text-zinc-500">
                            This reply included structured file edits (hidden in chat).
                          </p>
                        ) : showGfPlanStreaming ? (
                          <p className="text-sm leading-relaxed text-zinc-500">Structured plan (streaming)…</p>
                        ) : null}
                        {plan ? (
                          <PlanModeCard
                            key={`${msg.id}-plan-${planUiEpoch}`}
                            projectId={projectId}
                            messageId={msg.id}
                            plan={plan}
                            onApproveAndRun={handlePlanApproveAndRun}
                          />
                        ) : null}
                      </>
                    ) : isThinking ? (
                      <div className="text-sm leading-relaxed text-zinc-400">…</div>
                    ) : null
                  ) : (
                    <>
                      <ChatThreadMarkdown content={msg.content || ''} role="user" />
                      {msg.turnContext ? (
                        <UserMessageContextRow turnContext={msg.turnContext} model={msg.model} />
                      ) : null}
                    </>
                  )}
                  {msg.role === 'assistant' && msg.id !== 'welcome' ? (
                    <AssistantMessageContextFooter
                      turnContext={msg.turnContext}
                      model={msg.model}
                      leadingActions={
                        <>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-10 w-10 shrink-0 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                                aria-label="Copy message"
                                onClick={() => void readAloud.copyPlainText(assistantVisible)}
                              >
                                <Copy size={14} aria-hidden />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-xs">
                              Copy
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                disabled={
                                  readAloud.loadingMessageId !== null &&
                                  readAloud.loadingMessageId !== msg.id
                                }
                                aria-busy={readAloud.loadingMessageId === msg.id}
                                className="h-10 w-10 shrink-0 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-40"
                                aria-label={
                                  readAloud.playingMessageId === msg.id ? 'Stop read aloud' : 'Read aloud'
                                }
                                onClick={() => void readAloud.toggleReadAloud(msg.id, assistantVisible)}
                              >
                                {readAloud.loadingMessageId === msg.id ? (
                                  <Loader2 size={14} className="animate-spin" aria-hidden />
                                ) : readAloud.playingMessageId === msg.id ? (
                                  <Square size={14} aria-hidden />
                                ) : (
                                  <Volume2 size={14} aria-hidden />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-xs">
                              {readAloud.playingMessageId === msg.id ? 'Stop' : 'Read aloud'}
                            </TooltipContent>
                          </Tooltip>
                        </>
                      }
                    />
                  ) : null}
                </div>
              </motion.div>
              )
            })}
          </AnimatePresence>

          {commandApprovals.map((request) => (
            <div
              key={request.requestId}
              className="rounded-xl border border-amber-900/50 bg-amber-950/20 px-3 py-3 text-sm text-zinc-300"
            >
              <div className="mb-2 flex min-w-0 items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-300" aria-hidden />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white">Approve agent command?</div>
                    <div className="mt-0.5 text-xs text-amber-200/90">{riskLabel(request)}</div>
                  </div>
                </div>
                <span className="shrink-0 rounded-full border border-amber-800/60 px-2 py-0.5 font-mono text-[10px] text-amber-200/90">
                  {request.timeoutMs}ms
                </span>
              </div>
              <div className="space-y-2">
                <div>
                  <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">Command</div>
                  <pre className="max-h-32 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950/80 px-2 py-2 font-mono text-[11px] leading-relaxed text-zinc-200 custom-scrollbar">
                    {request.command}
                  </pre>
                </div>
                <div className="grid gap-2 text-xs text-zinc-400 sm:grid-cols-2">
                  <div className="min-w-0 rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-2 py-1.5">
                    <div className="text-[10px] uppercase tracking-wide text-zinc-500">Root</div>
                    <div className="truncate text-zinc-300">{request.rootLabel}</div>
                    <div className="truncate font-mono text-[10px] text-zinc-500" title={request.rootPath}>
                      {request.rootPath}
                    </div>
                  </div>
                  <div className="min-w-0 rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-2 py-1.5">
                    <div className="text-[10px] uppercase tracking-wide text-zinc-500">Purpose</div>
                    <div className="line-clamp-2 text-zinc-300">{request.purpose}</div>
                  </div>
                </div>
                <p className="text-xs leading-relaxed text-amber-100/80">{request.policyReason}</p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="h-8 rounded-xl"
                  onClick={() => void respondToCommandApproval(request, true)}
                >
                  <Play size={13} aria-hidden /> Approve
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-xl border-zinc-700"
                  onClick={() => void respondToCommandApproval(request, false)}
                >
                  <Ban size={13} aria-hidden /> Reject
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-xl text-zinc-400 hover:bg-zinc-900 hover:text-white"
                  onClick={() => void copyCommandApproval(request)}
                >
                  <Copy size={13} aria-hidden /> Copy
                </Button>
              </div>
            </div>
          ))}

          {agentActivities.length > 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-400">
              {liveTurnContext ? <AgentActivityTurnContextBanner turnContext={liveTurnContext} /> : null}
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 text-left"
                onClick={() => setActivityOpen((o) => !o)}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {agentActivities.some((a) => a.status === 'running') ? (
                    <Loader2 size={13} className="shrink-0 animate-spin text-gf-accent" aria-hidden />
                  ) : (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-gf-accent/80" aria-hidden />
                  )}
                  <span className="min-w-0 truncate">
                    {agentActivities[agentActivities.length - 1]?.title ?? 'Agent activity'}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-zinc-500">
                  {activityOpen ? 'Hide' : 'Show'}
                </span>
              </button>
              {activityOpen ? (
                <div className="mt-2 space-y-1 border-t border-zinc-800/80 pt-2">
                  {agentActivities.map((a) => (
                    <div key={a.id} className="flex min-w-0 items-start gap-2">
                      <span
                        className={cn(
                          'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                          a.status === 'running'
                            ? 'bg-gf-accent'
                            : a.status === 'error'
                              ? 'bg-red-400'
                              : 'bg-zinc-500',
                        )}
                      />
                      <div className="min-w-0">
                        <div className="truncate text-zinc-300">{a.title}</div>
                        {a.detail ? <div className="line-clamp-3 text-zinc-500">{a.detail}</div> : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}

          {isThinking && (
            <div className="flex items-center gap-3 pl-1 text-sm text-zinc-400">
              <div className="flex gap-1">
                <div className="h-1 w-1 animate-bounce rounded-full bg-zinc-400" style={{ animationDelay: '0ms' }} />
                <div className="h-1 w-1 animate-bounce rounded-full bg-zinc-400" style={{ animationDelay: '150ms' }} />
                <div className="h-1 w-1 animate-bounce rounded-full bg-zinc-400" style={{ animationDelay: '300ms' }} />
              </div>
              Grok is thinking…
              {streamingStreamId && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="ml-2 h-7 rounded-lg border-zinc-700 text-xs"
                  onClick={cancelStream}
                >
                  <Square size={12} className="mr-1" /> Stop
                </Button>
              )}
            </div>
          )}
        </div>
        </div>
      </div>

      {pendingWriteBatch ? (
        <div
          className={cn(
            'shrink-0 border-t border-zinc-800 bg-zinc-900/90 py-3 pl-4',
            reserveContextBubbleInset ? 'pr-[min(19rem,calc(100%-2.5rem))]' : 'pr-4',
          )}
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              {pendingProposal?.source === 'tool' ? 'Agent edit proposal' : 'Pending file updates'}
            </div>
            {pendingProposal?.source === 'tool' ? (
              <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                Tool proposal
              </span>
            ) : null}
          </div>
          {!hasAnyApplyablePath ? (
            <p className="mb-3 text-sm leading-relaxed text-amber-200/90">
              None of these paths are under your workspace roots, so Apply will not change your project files. Ask
              Grok to use an absolute path that starts with one of your roots (see the tree or Settings). Wrong parent
              folder names are a common cause.
            </p>
          ) : (
            <p className="mb-3 text-xs leading-relaxed text-zinc-500">
              Green paths will be changed; amber paths are outside your roots and will be skipped by the app.
            </p>
          )}
          <ul className="mb-3 max-h-40 min-w-0 space-y-2 overflow-y-auto custom-scrollbar text-sm">
            {pendingPathPreflight.map(({ path, underRoot }) => {
              const op = pendingOpByNormalizedPath.get(normalizeFsPath(path))
              const action = op?.op === 'delete_file' ? 'delete' : 'write'
              const displayPath = relativePendingPathLabel(path)
              return (
                <li
                  key={path}
                  className={cn(
                    'flex min-w-0 flex-col gap-1 rounded-lg border px-2 py-2 sm:flex-row sm:items-center sm:justify-between',
                    underRoot ? 'border-zinc-700/80 bg-zinc-950/50' : 'border-amber-900/40 bg-amber-950/20',
                  )}
                >
                  <div className="min-w-0">
                    <span className="font-mono text-[11px] text-zinc-300" title={path}>
                      {displayPath}
                    </span>
                    <div className={cn('mt-0.5 text-[10px] font-medium', underRoot ? 'text-gf-accent' : 'text-amber-300')}>
                      {underRoot ? `Under workspace root — will ${action}` : 'Not under any root — will be skipped'}
                    </div>
                  </div>
                  {op?.op === 'delete_file' ? null : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 gap-1 self-start rounded-lg px-2 text-xs text-zinc-400 hover:text-white sm:self-center"
                      onClick={() => onOpenFileInEditorRef.current?.(path)}
                    >
                      <FileText size={14} aria-hidden /> Open
                    </Button>
                  )}
                </li>
              )
            })}
            {pendingRejectedPaths.map((item) => (
              <li
                key={`rejected:${item.path}:${item.reason}`}
                className="flex min-w-0 flex-col gap-1 rounded-lg border border-red-900/40 bg-red-950/20 px-2 py-2"
              >
                <span className="font-mono text-[11px] text-zinc-300" title={item.path}>
                  {relativePendingPathLabel(item.path)}
                </span>
                <div className="mt-0.5 text-[10px] font-medium text-red-300">
                  Rejected by GrokForge - {item.reason}
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={cn(!hasAnyApplyablePath && 'cursor-not-allowed')}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-xl border-zinc-700"
                    disabled={busy || !hasAnyApplyablePath}
                    onClick={() => reviewPendingBatch()}
                  >
                    <FileDiff size={14} aria-hidden /> Review diff
                  </Button>
                </span>
              </TooltipTrigger>
              {!hasAnyApplyablePath ? (
                <TooltipContent side="top" className="max-w-xs text-xs">
                  Only workspace-root paths can be reviewed or applied.
                </TooltipContent>
              ) : (
                <TooltipContent side="top" className="text-xs">
                  Compare current disk contents with the proposed full-file writes.
                </TooltipContent>
              )}
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={cn(!hasAnyApplyablePath && 'cursor-not-allowed')}>
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-xl"
                    disabled={busy || !hasAnyApplyablePath}
                    onClick={() => applyPendingBatch()}
                  >
                    Apply all
                  </Button>
                </span>
              </TooltipTrigger>
              {!hasAnyApplyablePath ? (
                <TooltipContent side="top" className="max-w-xs text-xs">
                  Fix paths so at least one is under a workspace root, or ask Grok again with the correct absolute paths.
                </TooltipContent>
              ) : (
                <TooltipContent side="top" className="text-xs">
                  Writes only paths under your roots; skipped paths stay unchanged.
                </TooltipContent>
              )}
            </Tooltip>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl border-zinc-700"
              onClick={() => setPendingProposal(null)}
            >
              Discard
            </Button>
          </div>
        </div>
      ) : null}
      </div>

      <div
        className={cn(
          'min-h-0 shrink-0 border-t border-zinc-800 px-4 pb-4 pt-4',
          reserveContextBubbleInset ? 'pr-[min(19rem,calc(100%-2.5rem))]' : '',
        )}
      >
        <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
            <div className="flex items-center gap-2" role="group" aria-label="Conversation mode">
              <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Mode</span>
              <div className="flex rounded-lg border border-zinc-800 bg-zinc-900 p-0.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setConversationMode('normal')
                    if (projectId) writeConversationMode(projectId, 'normal')
                  }}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-[10px] font-medium tracking-tight transition-colors',
                    conversationMode === 'normal' ? 'bg-zinc-800 text-gf-accent' : 'text-zinc-500 hover:text-zinc-300',
                    busy && 'pointer-events-none opacity-50',
                  )}
                >
                  Chat
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setConversationMode('plan')
                    if (projectId) writeConversationMode(projectId, 'plan')
                  }}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-[10px] font-medium tracking-tight transition-colors',
                    conversationMode === 'plan' ? 'bg-zinc-800 text-gf-accent' : 'text-zinc-500 hover:text-zinc-300',
                    busy && 'pointer-events-none opacity-50',
                  )}
                >
                  Plan
                </button>
              </div>
            </div>
            {!projectId ? (
              <span className="text-[10px] text-zinc-600">Save this workspace as a project to persist Plan mode.</span>
            ) : null}
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-zinc-500">Next turn</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="flex rounded-lg border border-zinc-800 bg-zinc-900 p-0.5"
                    role="group"
                    aria-label="Model for next message"
                  >
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setChatModelIntent('chat_default')}
                      className={cn(
                        'rounded-md px-2 py-0.5 text-[10px] font-medium tracking-tight transition-colors',
                        chatModelIntent === 'chat_default'
                          ? 'bg-zinc-800 text-gf-accent'
                          : 'text-zinc-500 hover:text-zinc-300',
                        busy && 'pointer-events-none opacity-50',
                      )}
                    >
                      Fast
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setChatModelIntent('planning')}
                      className={cn(
                        'rounded-md px-2 py-0.5 font-mono text-[10px] font-medium tracking-tight transition-colors',
                        chatModelIntent === 'planning'
                          ? 'bg-zinc-800 text-gf-accent'
                          : 'text-zinc-500 hover:text-zinc-300',
                        busy && 'pointer-events-none opacity-50',
                      )}
                      title={planningModelId}
                    >
                      {planningModelId}
                    </button>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[240px] text-xs">
                  Picks which manifest model id runs the next turn: <span className="font-mono">models.default</span>{' '}
                  (Fast) vs <span className="font-mono">models.planning</span> ({planningModelId}). This is not Plan
                  mode — use <strong>Mode</strong> (Chat / Plan) for structured plans.
                </TooltipContent>
              </Tooltip>
              <ModelBadge variant="chip" title={displayThreadModel}>
                {displayThreadModel}
              </ModelBadge>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                aria-label="Thread options"
              >
                <MoreVertical size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-zinc-800 bg-zinc-950 text-zinc-200">
              <DropdownMenuItem
                className="cursor-pointer gap-2 focus:bg-zinc-900 focus:text-white"
                onClick={() => void handleRefreshProjectIntelligence()}
              >
                <RefreshCw size={14} className="text-zinc-500" />
                Refresh project intelligence
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer gap-2 focus:bg-zinc-900 focus:text-white"
                onClick={() => setTraceInspectorOpen(true)}
              >
                <SearchCode size={14} className="text-zinc-500" />
                Last agent turn trace…
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer gap-2 focus:bg-zinc-900 focus:text-white"
                onClick={() => void handleClearThread()}
              >
                <Trash2 size={14} className="text-zinc-500" />
                Clear history
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {hasContextChips ? (
          <div className="mb-3 flex min-w-0 flex-wrap gap-2">
            {attachments.map((attachment) => {
              const chipLabel = attachment.displayName?.trim() || compactPathLabel(attachment.path)
              const isUploadImage =
                attachment.source === 'upload' &&
                (attachment.mediaType?.startsWith('image/') ?? /\.(png|jpe?g|gif|webp|bmp|svg|ico)$/i.test(attachment.path))
              return (
              <Tooltip key={`${attachment.type}:${attachment.path}`}>
                <TooltipTrigger asChild>
                  <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300">
                    {attachment.type === 'folder' ? (
                      <Folder size={13} className="shrink-0 text-zinc-500" aria-hidden />
                    ) : attachment.source === 'upload' && isUploadImage ? (
                      <ImageIcon size={13} className="shrink-0 text-gf-accent" aria-hidden />
                    ) : attachment.source === 'upload' ? (
                      <Paperclip size={13} className="shrink-0 text-gf-accent" aria-hidden />
                    ) : (
                      <FileText size={13} className="shrink-0 text-zinc-500" aria-hidden />
                    )}
                    <span className="max-w-48 truncate font-mono text-[11px]">{chipLabel}</span>
                    <button
                      type="button"
                      className="ml-0.5 rounded-full p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                      aria-label={`Remove ${attachment.type} attachment`}
                      onClick={() => onRemoveAttachment?.(attachment)}
                    >
                      <X size={12} aria-hidden />
                    </button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-sm break-all font-mono text-[11px]">
                  {attachment.path}
                  {attachment.source === 'upload' ? '\n(upload staging)' : ''}
                </TooltipContent>
              </Tooltip>
              )
            })}
            {effectiveEditorSelection ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300">
                    <TextCursorInput size={13} className="shrink-0 text-gf-accent" aria-hidden />
                    <span className="max-w-48 truncate font-mono text-[11px]">
                      {compactPathLabel(effectiveEditorSelection.path)}:{effectiveEditorSelection.startLine}
                      {effectiveEditorSelection.endLine !== effectiveEditorSelection.startLine
                        ? `-${effectiveEditorSelection.endLine}`
                        : ''}
                    </span>
                    <button
                      type="button"
                      className="ml-0.5 rounded-full p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                      aria-label="Remove editor selection context"
                      onClick={() => selectionKey && setDismissedSelectionKey(selectionKey)}
                    >
                      <X size={12} aria-hidden />
                    </button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-sm break-all font-mono text-[11px]">
                  {effectiveEditorSelection.path}:{effectiveEditorSelection.startLine}-{effectiveEditorSelection.endLine}
                  {effectiveEditorSelection.truncated ? ' (truncated)' : ''}
                </TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        ) : null}
        <input
          ref={attachmentFileInputRef}
          type="file"
          multiple
          className="sr-only"
          aria-hidden
          tabIndex={-1}
          accept=".png,.jpg,.jpeg,.gif,.webp,.bmp,.svg,.ico,.avif,.heic,.heif,.tif,.tiff,.pdf,.txt,.md,.markdown,.json,.csv,.yaml,.yml,.xml,.html,.htm,.css,.scss,.less,.ts,.tsx,.js,.jsx,.mjs,.cjs,.vue,.svelte,.rs,.go,.java,.kt,.kts,.swift,.rb,.php,.c,.h,.cpp,.hpp,.cc,.cs,.fs,.sql,.sh,.bash,.zsh,.ps1,.toml,.ini,.cfg,.conf,.log,.rtf,.mdx,.tex,.rst"
          onChange={(e) => {
            const list = e.target.files
            if (list?.length) void ingestFilesForChat(list)
            e.target.value = ''
          }}
        />
        <div
          className={cn(
            'relative min-w-0 rounded-2xl transition-shadow',
            composerDragActive && 'ring-2 ring-primary ring-offset-2 ring-offset-zinc-950',
          )}
          onDragEnter={(ev) => {
            ev.preventDefault()
            ev.stopPropagation()
            setComposerDragActive(true)
          }}
          onDragOver={(ev) => {
            ev.preventDefault()
            ev.stopPropagation()
          }}
          onDragLeave={(ev) => {
            ev.preventDefault()
            if (!ev.currentTarget.contains(ev.relatedTarget as Node)) setComposerDragActive(false)
          }}
          onDrop={(ev) => {
            ev.preventDefault()
            ev.stopPropagation()
            setComposerDragActive(false)
            if (ev.dataTransfer.files?.length) void ingestFilesForChat(ev.dataTransfer.files)
          }}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={busy}
                className="gf-no-drag absolute bottom-2 left-2 z-10 h-9 w-9 rounded-xl text-zinc-400 hover:bg-zinc-800 hover:text-white"
                aria-label="Attach files"
                onClick={() => attachmentFileInputRef.current?.click()}
              >
                <Paperclip size={18} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[16rem] text-xs">
              Attach images or documents — drop files here or click. Max {AGENT_CHAT_MAX_ATTACHMENTS} files ·{' '}
              {Math.round(CHAT_ATTACHMENT_MAX_FILE_BYTES / (1024 * 1024))} MiB each ·{' '}
              {Math.round(CHAT_ATTACHMENT_MAX_TOTAL_BYTES_PER_TURN / (1024 * 1024))} MiB total per message.
            </TooltipContent>
          </Tooltip>
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void sendMessage()
              }
            }}
            placeholder="Ask GrokForge anything about your project..."
            className={cn(
              'gf-chat-composer custom-scrollbar gf-no-drag w-full min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900 py-2.5 pl-12 pr-14 text-sm text-zinc-100 shadow-none placeholder:text-zinc-500',
              'focus-visible:border-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
            disabled={busy}
            aria-label="Message to agent"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                disabled={busy}
                onClick={() => void sendMessage()}
                className="gf-no-drag absolute bottom-2 right-2 h-9 w-9 rounded-xl bg-primary text-primary-foreground shadow-none hover:bg-primary/90"
                aria-label="Send message"
              >
                <Send size={18} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-[14rem] text-xs">
              Send (Enter) · New line (Shift+Enter)
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
    <AgentTurnTraceInspector open={traceInspectorOpen} onOpenChange={setTraceInspectorOpen} />
    </>
  )
}
