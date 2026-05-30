import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
  type Dispatch,
  type SetStateAction,
  type MutableRefObject,
} from 'react'
import { useDefaultLayout, usePanelRef, type Layout } from 'react-resizable-panels'
import { Sidebar } from '@/components/Sidebar'
import { ChatThread } from '@/components/ChatThread'
import { EditorPane } from '@/components/EditorPane'
import { AgentContextCompanion } from '@/components/AgentContextCompanion'
import {
  buildAgentContextCompanionView,
  EMPTY_AGENT_CONTEXT_COMPANION_SNAPSHOT,
  type AgentContextCompanionActions,
  type AgentContextCompanionSnapshot,
} from '@/lib/agent-context-companion'
import type { EditorContextCompanionBubbleSummary } from '@/components/EditorContextBubble'
import { VoiceExpandedPanel } from '@/components/VoiceControls'
import type { VoiceControlsStatus } from '@/components/VoiceControls'
import {
  shouldAutoCollapseVoicePanelOnSessionEnd,
  voiceHeaderIndicator,
} from '@/lib/voice-ui-state'
import { useVoiceSession } from '@/hooks/useVoiceSession'
import { ProjectHeader } from '@/components/ProjectHeader'
import { SearchPanel } from '@/components/SearchPanel'
import { TerminalPanel } from '@/components/TerminalPanel'
import { BuildChannelIndicator } from '@/components/BuildChannelIndicator'
import { ProjectWelcome } from '@/components/ProjectWelcome'
import { AgentOnboardingDialog } from '@/components/AgentOnboardingDialog'
import {
  dismissOnboardingGlobally,
  markProjectOnboardingSeen,
  shouldShowProjectOnboarding,
} from '@/lib/onboarding-storage'
import { SettingsPage } from '@/components/SettingsPage'
import { isMacElectron } from '@/lib/electron-chrome'
import { AgentChatActivityProvider } from '@/context/AgentChatActivityProvider'
import {
  RECENT_PROJECT_DISPLAY_NAME_MAX_LEN,
  AGENT_CHAT_SELECTION_MAX_CHARS,
  AGENT_CHAT_MAX_ATTACHMENTS,
  type AgentChatAttachment,
  type AgentChatEditorSelection,
  type DiffSession,
  type GrokProjectManifest,
  type OpenProjectByIdFailure,
  type OpenProjectResult,
  type Root,
  type WorkspaceFsMutationEvent,
} from '@/types'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { reconcilePathsForMutation } from '@/lib/workspace-fs-mutation-state'
import { basenamePath } from '@/lib/workspace-paths'
import { isPathUnderWorkspaceRoots, normalizeFsPath } from '@/lib/workspace-path-check'
import type { AgentContextPin } from '@/types'
import { AGENT_CONTEXT_MAX_PINS_PER_PROJECT } from '@/types'
import { resolveWorkspaceGlobalShortcut } from '@/lib/workspace-global-shortcuts'
import { EditorContextBubble } from '@/components/EditorContextBubble'

type DiffSessionActions = {
  primaryLabel: string
  onPrimary: () => void
  secondaryLabel?: string
  onSecondary?: () => void
  regenerateLabel?: string
  onRegenerate?: () => void
  fixFailedEditLabel?: string
  onFixFailedEdit?: () => void
  primaryDisabled?: boolean
}

function isOpenProjectByIdFailure(
  r: OpenProjectResult | OpenProjectByIdFailure
): r is OpenProjectByIdFailure {
  return 'ok' in r && r.ok === false
}

interface ProjectSwitchGuardAlertProps {
  open: boolean
  closingViaConfirmRef: MutableRefObject<boolean>
  onStay: () => void
  onContinueWithoutSaving: () => void
}

function ProjectSwitchGuardAlert({
  open,
  closingViaConfirmRef,
  onStay,
  onContinueWithoutSaving,
}: ProjectSwitchGuardAlertProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (o) return
        if (closingViaConfirmRef.current) {
          closingViaConfirmRef.current = false
          return
        }
        onStay()
      }}
    >
      <AlertDialogContent className="border-zinc-800 bg-zinc-950 sm:rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">Discard unsaved changes?</AlertDialogTitle>
          <AlertDialogDescription className="text-zinc-400">
            You have unsaved edits in the editor. Switching projects will close open tabs. Continue without saving?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:space-x-0">
          <Button type="button" variant="outline" onClick={onStay}>
            Stay
          </Button>
          <Button type="button" variant="destructive" onClick={onContinueWithoutSaving}>
            Continue without saving
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Percentages (0–100) for Group `defaultLayout` when storage is missing or invalid. Match reference: ~17% sidebar; remainder split ~40% chat / ~60% editor. */
const DEFAULT_OUTER_LAYOUT: Layout = { sidebar: 17, main: 83 }
/** Story 075: first open maximizes chat; editor/files region starts collapsed (0% → collapsible panel). */
const DEFAULT_INNER_LAYOUT: Layout = { chat: 100, editor: 0 }

function sanitizeOuterLayout(layout: Layout | undefined): Layout | undefined {
  if (!layout) return undefined
  const s = layout.sidebar
  const m = layout.main
  if (typeof s !== 'number' || typeof m !== 'number') return undefined
  if (Math.abs(s + m - 100) > 2) return undefined
  if (s < 3 || s > 35) return undefined
  if (m < 65 || m > 97) return undefined
  return { sidebar: s, main: m }
}

function sanitizeInnerLayout(layout: Layout | undefined): Layout | undefined {
  if (!layout) return undefined
  const c = layout.chat
  const e = layout.editor
  if (typeof c !== 'number' || typeof e !== 'number') return undefined
  if (Math.abs(c + e - 100) > 2) return undefined
  if (c < 20 || c > 100) return undefined
  if (e < 0 || e > 80) return undefined
  return { chat: c, editor: e }
}

interface ProjectWorkspaceShellProps {
  project: GrokProjectManifest
  workspaceProjectId: string | null
  activeRoot: Root | null
  setActiveRoot: Dispatch<SetStateAction<Root | null>>
  openFiles: string[]
  activeFile: string | null
  dirtyFiles: Record<string, boolean>
  setActiveFile: Dispatch<SetStateAction<string | null>>
  onFileOpen: (path: string) => void
  onCloseFile: (path: string) => void
  onEditorUnsavedChange: (hasUnsaved: boolean) => void
  onDirtyFilesChange: (dirtyByPath: Record<string, boolean>) => void
  diffSession: DiffSession | null
  diffSessionActions: DiffSessionActions | null
  onOpenDiffSession: (session: DiffSession, actions?: DiffSessionActions | null) => void
  onCloseDiffSession: () => void
  searchPanelOpen: boolean
  setSearchPanelOpen: (open: boolean) => void
  jumpToLineRequest: { path: string; line: number } | null
  onJumpToLineHandled: () => void
  onSearchResultOpen: (path: string, line: number) => void
  terminalOpen: boolean
  setTerminalOpen: Dispatch<SetStateAction<boolean>>
  /** Story 025: Sidebar bottom button now returns to the Project Dashboard, not the OS folder picker. */
  onReturnToDashboard: () => void
  /** Story 025: append a workspace root via the main-process folder picker. */
  onAddRoot: () => void
  voiceSession: ReturnType<typeof useVoiceSession>
  onOpenSettings: () => void
  /** Bump when agent/undo wrote paths so Monaco reloads from disk. */
  editorDiskRefreshRequest: { nonce: number; paths: string[] } | null
  onAgentDiskFilesChanged: (paths: string[]) => void
  /** Increments when agent or undo changes files on disk so sidebars refresh directory listings. */
  workspaceFsEpoch: number
  /** Latest app-driven file changes; used for git status refresh after writes. */
  workspaceFsChange: { nonce: number; paths: string[] } | null
  /** Local file tree mutations — refresh and reconcile editor paths. */
  onWorkspaceFsMutation: (event: WorkspaceFsMutationEvent, refreshPaths: string[]) => void
  /** Lets editor preserve in-memory buffers across path-changing file tree mutations. */
  workspaceFsMutationRequest: { nonce: number; event: WorkspaceFsMutationEvent } | null
  /** Opens the project rename dialog (same modal as multi-root naming). */
  onEditProjectName: () => void
  /** Recent text chat summary for voice session hydration (077). */
  voiceThreadSummaryRef: MutableRefObject<string>
  onRegisterVoiceHandoff: (execute: (() => Promise<void>) | null) => void
  onStopVoiceForHandoff: () => Promise<void>
  onVoiceContinueInAgentChat: () => void
  /** ChatThread registers clearing pending agent proposals when the diff UI closes. */
  onRegisterClearPendingAgentProposal: (clear: (() => void) | null) => void
  /** Refresh diff header actions after apply failure while review is open (092). */
  onUpdateDiffSessionActions?: (actions: DiffSessionActions) => void
}

function ProjectWorkspaceShell({
  project,
  workspaceProjectId,
  activeRoot,
  setActiveRoot,
  openFiles,
  activeFile,
  dirtyFiles,
  setActiveFile,
  onFileOpen,
  onCloseFile,
  onEditorUnsavedChange,
  onDirtyFilesChange,
  diffSession,
  diffSessionActions,
  onOpenDiffSession,
  onCloseDiffSession,
  searchPanelOpen,
  setSearchPanelOpen,
  jumpToLineRequest,
  onJumpToLineHandled,
  onSearchResultOpen,
  terminalOpen,
  setTerminalOpen,
  onReturnToDashboard,
  onAddRoot,
  voiceSession,
  onOpenSettings,
  editorDiskRefreshRequest,
  onAgentDiskFilesChanged,
  workspaceFsEpoch,
  workspaceFsChange,
  onWorkspaceFsMutation,
  workspaceFsMutationRequest,
  onEditProjectName,
  voiceThreadSummaryRef,
  onRegisterVoiceHandoff,
  onStopVoiceForHandoff,
  onVoiceContinueInAgentChat,
  onRegisterClearPendingAgentProposal,
  onUpdateDiffSessionActions,
}: ProjectWorkspaceShellProps) {
  const outerLayout = useDefaultLayout({
    id: 'grokforge-shell-outer-v4',
    panelIds: ['sidebar', 'main'],
  })
  const innerLayoutStorageId = `grokforge-shell-chat-editor-v5:${workspaceProjectId ?? '_'}`
  const innerLayout = useDefaultLayout({
    id: innerLayoutStorageId,
    panelIds: ['chat', 'editor'],
  })

  const outerDefaultLayout = useMemo(
    () => sanitizeOuterLayout(outerLayout.defaultLayout) ?? DEFAULT_OUTER_LAYOUT,
    [outerLayout.defaultLayout],
  )
  const innerDefaultLayout = useMemo(
    () => sanitizeInnerLayout(innerLayout.defaultLayout) ?? DEFAULT_INNER_LAYOUT,
    [innerLayout.defaultLayout],
  )

  const sidebarPanelRef = usePanelRef()
  const terminalPanelRef = usePanelRef()
  const editorPanelRef = usePanelRef()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [editorPaneCollapsed, setEditorPaneCollapsed] = useState(false)
  const [companionSnapshot, setCompanionSnapshot] = useState<AgentContextCompanionSnapshot>(
    EMPTY_AGENT_CONTEXT_COMPANION_SNAPSHOT,
  )
  const companionActionsRef = useRef<AgentContextCompanionActions | null>(null)
  const registerContextCompanionActions = useCallback(
    (actions: AgentContextCompanionActions | null) => {
      companionActionsRef.current = actions
    },
    [],
  )
  const [terminalRunningCount, setTerminalRunningCount] = useState(0)
  const [chatAttachments, setChatAttachments] = useState<AgentChatAttachment[]>([])
  const [pinnedContext, setPinnedContext] = useState<AgentContextPin[]>([])
  const [editorSelection, setEditorSelection] = useState<AgentChatEditorSelection | null>(null)
  const [onboardingOpen, setOnboardingOpen] = useState(false)

  useEffect(() => {
    if (!workspaceProjectId) {
      setOnboardingOpen(false)
      return
    }
    setOnboardingOpen(shouldShowProjectOnboarding(workspaceProjectId))
  }, [workspaceProjectId])

  const closeOnboardingForProject = useCallback(() => {
    if (workspaceProjectId) markProjectOnboardingSeen(workspaceProjectId)
    setOnboardingOpen(false)
  }, [workspaceProjectId])

  const handleOnboardingDontShowAgain = useCallback(() => {
    dismissOnboardingGlobally()
    closeOnboardingForProject()
  }, [closeOnboardingForProject])

  useEffect(() => {
    const pid = workspaceProjectId
    if (!pid || !window.electron?.getProjectContextPins) {
      setPinnedContext([])
      return
    }
    let cancelled = false
    void window.electron.getProjectContextPins({ projectId: pid }).then((res) => {
      if (!cancelled && res.ok) setPinnedContext(res.pins)
    })
    return () => {
      cancelled = true
    }
  }, [workspaceProjectId])

  const persistPinnedContext = useCallback(
    async (pins: AgentContextPin[]) => {
      const pid = workspaceProjectId
      if (!pid || !window.electron?.setProjectContextPins) return
      const res = await window.electron.setProjectContextPins({ projectId: pid, pins })
      if (res.ok) {
        setPinnedContext(res.pins)
      } else {
        toast.error(res.error ?? 'Could not save pinned context')
      }
    },
    [workspaceProjectId],
  )

  const pinPathKey = useCallback((path: string) => normalizeFsPath(path).toLowerCase(), [])

  const isPathPinnedForAgent = useCallback(
    (path: string) => pinnedContext.some((pin) => pinPathKey(pin.path) === pinPathKey(path)),
    [pinnedContext, pinPathKey],
  )

  const handleTogglePinForAgent = useCallback(
    (path: string, isDirectory: boolean) => {
      if (!isPathUnderWorkspaceRoots(path, project.roots)) {
        toast.error('Only workspace paths can be pinned.')
        return
      }
      const key = pinPathKey(path)
      if (pinnedContext.some((pin) => pinPathKey(pin.path) === key)) {
        void persistPinnedContext(pinnedContext.filter((pin) => pinPathKey(pin.path) !== key))
        toast.message('Unpinned for agent')
        return
      }
      if (pinnedContext.length >= AGENT_CONTEXT_MAX_PINS_PER_PROJECT) {
        toast.error(`At most ${AGENT_CONTEXT_MAX_PINS_PER_PROJECT} pinned paths per project.`)
        return
      }
      void persistPinnedContext([
        ...pinnedContext,
        { type: isDirectory ? 'folder' : 'file', path },
      ])
      toast.success('Pinned for agent')
    },
    [pinnedContext, persistPinnedContext, pinPathKey, project.roots],
  )

  const handleRemovePinned = useCallback(
    (pin: AgentContextPin) => {
      const key = pinPathKey(pin.path)
      void persistPinnedContext(pinnedContext.filter((item) => pinPathKey(item.path) !== key))
    },
    [pinnedContext, persistPinnedContext, pinPathKey],
  )

  const syncSidebarCollapsed = useCallback(() => {
    const next = sidebarPanelRef.current?.isCollapsed() ?? false
    setSidebarCollapsed(next)
  }, [])

  const handleToggleSidebar = useCallback(() => {
    const api = sidebarPanelRef.current
    if (!api) return
    if (api.isCollapsed()) {
      api.expand()
    } else {
      api.collapse()
    }
    requestAnimationFrame(() => syncSidebarCollapsed())
  }, [syncSidebarCollapsed])

  const syncEditorPaneCollapsed = useCallback(() => {
    setEditorPaneCollapsed(editorPanelRef.current?.isCollapsed() ?? false)
  }, [])

  const ensureEditorPaneExpanded = useCallback(() => {
    const api = editorPanelRef.current
    if (api?.isCollapsed()) {
      api.expand()
    }
    requestAnimationFrame(() => syncEditorPaneCollapsed())
  }, [syncEditorPaneCollapsed])

  const handleToggleEditorPane = useCallback(() => {
    const api = editorPanelRef.current
    if (!api) return
    if (api.isCollapsed()) {
      api.expand()
    } else {
      api.collapse()
    }
    requestAnimationFrame(() => syncEditorPaneCollapsed())
  }, [syncEditorPaneCollapsed])

  const handleCollapseEditorPane = useCallback(() => {
    const api = editorPanelRef.current
    if (!api || api.isCollapsed()) return
    api.collapse()
    requestAnimationFrame(() => syncEditorPaneCollapsed())
  }, [syncEditorPaneCollapsed])

  const openSearchWorkspace = useCallback(() => {
    ensureEditorPaneExpanded()
    setSearchPanelOpen(true)
  }, [ensureEditorPaneExpanded, setSearchPanelOpen])

  const [voicePanelOpen, setVoicePanelOpen] = useState(false)
  const voiceDisabled = project.voice.defaultVoiceMode === 'off'
  const prevVoiceStatusRef = useRef<VoiceControlsStatus>('idle')
  const prevVoiceActiveRef = useRef(false)

  const voiceHeaderIndicatorValue = useMemo(
    () =>
      voiceHeaderIndicator(
        voiceSession.status,
        voiceSession.isActive,
        voicePanelOpen,
        voiceDisabled,
      ),
    [voiceSession.status, voiceSession.isActive, voicePanelOpen, voiceDisabled],
  )

  useEffect(() => {
    const status = voiceSession.status
    const isActive = voiceSession.isActive
    const prevStatus = prevVoiceStatusRef.current
    const prevIsActive = prevVoiceActiveRef.current

    const becameConnecting = status === 'connecting' && prevStatus === 'idle'
    const becameActive = isActive && !prevIsActive
    const becameError = status === 'error' && prevStatus !== 'error'
    if ((becameConnecting || becameActive || becameError) && !voicePanelOpen) {
      setVoicePanelOpen(true)
    }

    if (shouldAutoCollapseVoicePanelOnSessionEnd(status, isActive, prevIsActive)) {
      setVoicePanelOpen(false)
    }

    prevVoiceStatusRef.current = status
    prevVoiceActiveRef.current = isActive
  }, [voiceSession.status, voiceSession.isActive, voicePanelOpen])

  useEffect(() => {
    if (!voicePanelOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setVoicePanelOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [voicePanelOpen])

  const handleVoiceHeaderClick = useCallback(() => {
    if (voiceDisabled) return
    setVoicePanelOpen((open) => !open)
  }, [voiceDisabled])

  const openFileWithEditorPane = useCallback(
    (path: string) => {
      ensureEditorPaneExpanded()
      onFileOpen(path)
    },
    [ensureEditorPaneExpanded, onFileOpen],
  )

  const openDiffSessionWithEditorPane = useCallback(
    (session: DiffSession, actions?: DiffSessionActions | null) => {
      ensureEditorPaneExpanded()
      onOpenDiffSession(session, actions)
    },
    [ensureEditorPaneExpanded, onOpenDiffSession],
  )

  const companionView = useMemo(
    () =>
      buildAgentContextCompanionView({
        snapshot: companionSnapshot,
        activeFile,
        diffSession,
        activeFileDirty: activeFile ? Boolean(dirtyFiles[activeFile]) : false,
      }),
    [activeFile, companionSnapshot, diffSession, dirtyFiles],
  )

  const companionActions = useMemo(
    (): AgentContextCompanionActions => ({
      onReviewDiff: () => companionActionsRef.current?.onReviewDiff?.(),
      onApplyAll: () => companionActionsRef.current?.onApplyAll?.(),
      onDiscard: () => companionActionsRef.current?.onDiscard?.(),
      onOpenFile: (path) => openFileWithEditorPane(path),
    }),
    [openFileWithEditorPane],
  )

  const contextCompanionNode = companionView ? (
    <AgentContextCompanion
      view={companionView}
      actions={companionActions}
      proposalBusy={companionSnapshot.proposalBusy}
      canApplyProposal={companionSnapshot.canApplyProposal}
      proposalApplied={companionSnapshot.proposalApplied}
    />
  ) : null

  const editorAgentEmptyHint =
    companionView?.kind === 'idle_empty' ? (companionView.detail ?? null) : null

  const collapsedCompanionBubble = useMemo((): EditorContextCompanionBubbleSummary | null => {
    if (!companionView) return null
    if (companionView.kind === 'proposal') {
      return {
        headline: companionView.headline,
        detail: companionView.detail,
        actionLabel: 'Review diff',
        onAction: () => companionActionsRef.current?.onReviewDiff?.(),
      }
    }
    if (companionView.primaryPath) {
      return {
        headline: companionView.headline,
        detail: companionView.detail,
        actionLabel: companionView.kind === 'live' ? 'Open file' : undefined,
        onAction:
          companionView.kind === 'live'
            ? () => openFileWithEditorPane(companionView.primaryPath!)
            : undefined,
      }
    }
    return null
  }, [companionView, openFileWithEditorPane])

  const openSearchResultWithEditorPane = useCallback(
    (path: string, line: number) => {
      ensureEditorPaneExpanded()
      onSearchResultOpen(path, line)
    },
    [ensureEditorPaneExpanded, onSearchResultOpen],
  )

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const shortcut = resolveWorkspaceGlobalShortcut(e)
      if (!shortcut) return
      e.preventDefault()
      switch (shortcut) {
        case 'search':
          openSearchWorkspace()
          break
        case 'terminal':
          setTerminalOpen((o) => !o)
          break
        case 'sidebar':
          handleToggleSidebar()
          break
        case 'editor':
          handleToggleEditorPane()
          break
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [handleToggleEditorPane, handleToggleSidebar, openSearchWorkspace, setTerminalOpen])

  useLayoutEffect(() => {
    const id = window.requestAnimationFrame(() => {
      syncEditorPaneCollapsed()
    })
    return () => window.cancelAnimationFrame(id)
  }, [workspaceProjectId, innerDefaultLayout, syncEditorPaneCollapsed])

  useLayoutEffect(() => {
    const api = terminalPanelRef.current
    if (!api) return
    if (terminalOpen) {
      api.expand()
    } else {
      api.collapse()
    }
  }, [terminalOpen])

  const handleAddPathToChat = useCallback((attachment: AgentChatAttachment) => {
    if (!isPathUnderWorkspaceRoots(attachment.path, project.roots)) {
      toast.error('Only workspace files and folders can be attached.')
      return
    }
    setChatAttachments((prev) => {
      if (prev.some((item) => item.path === attachment.path && item.type === attachment.type)) return prev
      return [...prev, attachment].slice(-AGENT_CHAT_MAX_ATTACHMENTS)
    })
    toast.success('Added to next chat message', {
      description: basenamePath(attachment.path) || attachment.path,
    })
  }, [project.roots])

  const mergeChatAttachments = useCallback((items: AgentChatAttachment[]) => {
    if (!items.length) return
    setChatAttachments((prev) => {
      const next = [...prev]
      for (const it of items) {
        if (!next.some((x) => x.path === it.path && x.type === it.type)) next.push(it)
      }
      return next.slice(-AGENT_CHAT_MAX_ATTACHMENTS)
    })
  }, [])

  return (
    <div className="h-screen min-h-0 w-screen overflow-hidden bg-gf-canvas font-sans text-white">
      <ResizablePanelGroup
        id="grokforge-shell-outer-v4"
        orientation="horizontal"
        defaultLayout={outerDefaultLayout}
        onLayoutChanged={outerLayout.onLayoutChanged}
        className="h-full min-h-0 w-full"
      >
        <ResizablePanel
          id="sidebar"
          panelRef={sidebarPanelRef}
          collapsible
          collapsedSize="4%"
          minSize="12%"
          maxSize="32%"
          defaultSize="17%"
          className="flex min-h-0 min-w-0"
          onResize={syncSidebarCollapsed}
        >
          <Sidebar
            project={project}
            activeRoot={activeRoot}
            activeFile={activeFile}
            openFiles={openFiles}
            dirtyFiles={dirtyFiles}
            onRootChange={setActiveRoot}
            onFileOpen={openFileWithEditorPane}
            onReturnToDashboard={onReturnToDashboard}
            onAddRoot={onAddRoot}
            onOpenSettings={onOpenSettings}
            collapsed={sidebarCollapsed}
            onToggleSidebar={handleToggleSidebar}
            workspaceFsEpoch={workspaceFsEpoch}
            workspaceFsChange={workspaceFsChange}
            onWorkspaceFsMutation={onWorkspaceFsMutation}
            onAddPathToChat={handleAddPathToChat}
            isPathPinnedForAgent={isPathPinnedForAgent}
            onTogglePinForAgent={handleTogglePinForAgent}
            onOpenDiffSession={openDiffSessionWithEditorPane}
          />
        </ResizablePanel>

        <ResizableHandle aria-label="Resize sidebar" title="Resize sidebar" />

        <ResizablePanel id="main" defaultSize="83%" minSize="55%" className="flex min-h-0 min-w-0 flex-col">
          <ProjectHeader
            project={project}
            activeRoot={activeRoot}
            onEditProjectName={onEditProjectName}
            onOpenSearch={openSearchWorkspace}
            onOpenTerminal={() => setTerminalOpen((o) => !o)}
            onOpenVoice={handleVoiceHeaderClick}
            voiceDisabled={voiceDisabled}
            voicePanelOpen={voicePanelOpen}
            voiceHeaderIndicator={voiceHeaderIndicatorValue}
            onOpenSettings={onOpenSettings}
          />

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ResizablePanelGroup
              id="grokforge-workspace-terminal-v1"
              orientation="vertical"
              className="min-h-0 min-w-0 flex-1"
            >
              <ResizablePanel
                id="workspace"
                defaultSize="68%"
                minSize="40%"
                className="flex min-h-0 min-w-0 flex-col"
              >
                <div className="relative flex min-h-0 min-w-0 flex-1">
                  <ResizablePanelGroup
                    id={innerLayoutStorageId}
                    orientation="horizontal"
                    defaultLayout={innerDefaultLayout}
                    onLayoutChanged={innerLayout.onLayoutChanged}
                    className="flex min-h-0 min-w-0 flex-1"
                  >
                    <ResizablePanel
                      id="chat"
                      defaultSize="72%"
                      minSize="22%"
                      maxSize="100%"
                      className="min-h-0 min-w-0 border-r border-zinc-800"
                      style={{ overflow: 'hidden' }}
                    >
                      {/* Full-height shell: Panel inner uses overflow:auto; this keeps ChatThread height stable. */}
                      <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
                        <ChatThread
                          key={workspaceProjectId ?? project.name}
                          projectId={workspaceProjectId}
                          project={project}
                          activeRoot={activeRoot}
                          activeFilePath={activeFile}
                          openTabs={openFiles.map((path) => ({ path, dirty: Boolean(dirtyFiles[path]) }))}
                          attachments={chatAttachments}
                          pinnedContext={pinnedContext}
                          onRemovePinned={handleRemovePinned}
                          editorSelection={editorSelection}
                          onRemoveAttachment={(attachment) =>
                            setChatAttachments((prev) =>
                              prev.filter((item) => item.path !== attachment.path || item.type !== attachment.type),
                            )
                          }
                          onClearAttachments={() => setChatAttachments([])}
                          onAddChatAttachments={mergeChatAttachments}
                          onAgentDiskFilesChanged={onAgentDiskFilesChanged}
                          onOpenFileInEditor={openFileWithEditorPane}
                          onOpenDiffSession={openDiffSessionWithEditorPane}
                          onCloseDiffSession={onCloseDiffSession}
                          reserveContextBubbleInset={editorPaneCollapsed}
                          voiceThreadSummaryRef={voiceThreadSummaryRef}
                          onRegisterVoiceHandoff={onRegisterVoiceHandoff}
                          onStopVoiceForHandoff={onStopVoiceForHandoff}
                          onRegisterClearPendingAgentProposal={onRegisterClearPendingAgentProposal}
                          onUpdateDiffSessionActions={onUpdateDiffSessionActions}
                          editorPaneCollapsed={editorPaneCollapsed}
                          onCompanionSnapshotChange={setCompanionSnapshot}
                          onRegisterContextCompanionActions={registerContextCompanionActions}
                        />
                      </div>
                    </ResizablePanel>

                    <ResizableHandle
                      withHandle
                      aria-label="Resize or collapse editor panel"
                      title="Drag to resize; double-click to toggle editor"
                    />

                    <ResizablePanel
                      id="editor"
                      panelRef={editorPanelRef}
                      collapsible
                      collapsedSize="0%"
                      defaultSize="28%"
                      minSize="28%"
                      maxSize="78%"
                      className="relative flex min-h-0 min-w-0 flex-col"
                      onResize={() => syncEditorPaneCollapsed()}
                    >
                      <EditorPane
                        key={workspaceProjectId ?? project.name}
                        openFiles={openFiles}
                        activeFile={activeFile}
                        onActiveFileChange={setActiveFile}
                        onCloseFile={onCloseFile}
                        onUnsavedChange={onEditorUnsavedChange}
                        onDirtyFilesChange={onDirtyFilesChange}
                        project={project}
                        diffSession={diffSession}
                        diffSessionActions={diffSessionActions}
                        onCloseDiffSession={onCloseDiffSession}
                        jumpToLineRequest={jumpToLineRequest}
                        onJumpToLineHandled={onJumpToLineHandled}
                        diskRefreshRequest={editorDiskRefreshRequest}
                        mutationRequest={workspaceFsMutationRequest}
                        onFileSaved={onAgentDiskFilesChanged}
                        onEditorSelectionChange={setEditorSelection}
                        selectionMaxChars={AGENT_CHAT_SELECTION_MAX_CHARS}
                        onCollapseEditorPane={handleCollapseEditorPane}
                        contextCompanion={contextCompanionNode}
                        contextCompanionHighlight={companionView?.showProposalAccent}
                        agentEmptyHint={editorAgentEmptyHint}
                      />
                      <SearchPanel
                        project={project}
                        open={searchPanelOpen}
                        onClose={() => setSearchPanelOpen(false)}
                        onOpenResult={openSearchResultWithEditorPane}
                      />
                    </ResizablePanel>
                  </ResizablePanelGroup>

                  <EditorContextBubble
                    visible={editorPaneCollapsed}
                    isMac={isMacElectron()}
                    chatAttachments={chatAttachments}
                    openFilesCount={openFiles.length}
                    terminalOpen={terminalOpen}
                    terminalRunningSessions={terminalRunningCount}
                    onExpandEditor={() => {
                      editorPanelRef.current?.expand()
                      requestAnimationFrame(() => syncEditorPaneCollapsed())
                    }}
                    onOpenTerminal={() => setTerminalOpen(true)}
                    companionSummary={collapsedCompanionBubble}
                  />
                </div>
              </ResizablePanel>

              <ResizableHandle
                aria-label="Resize terminal panel"
                title="Resize terminal panel"
                className={terminalOpen ? 'h-px w-full' : 'hidden'}
              />

              <ResizablePanel
                id="terminal"
                panelRef={terminalPanelRef}
                collapsible
                collapsedSize="0%"
                defaultSize="32%"
                minSize="18%"
                maxSize="58%"
                className="flex min-h-0 min-w-0 flex-col"
              >
                <TerminalPanel
                  project={project}
                  activeRoot={activeRoot}
                  open={terminalOpen}
                  onClose={() => setTerminalOpen(false)}
                  onOpenFileLink={openSearchResultWithEditorPane}
                  onRunningSessionsChange={setTerminalRunningCount}
                />
              </ResizablePanel>
            </ResizablePanelGroup>

            <VoiceExpandedPanel
              open={voicePanelOpen}
              onOpenChange={setVoicePanelOpen}
              isActive={voiceSession.isActive || voiceSession.status === 'connecting'}
              status={voiceSession.status}
              lastError={voiceSession.lastError}
              onToggle={() => void voiceSession.toggle()}
              onContinueInAgentChat={onVoiceContinueInAgentChat}
              project={project}
            />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      <AgentOnboardingDialog
        open={onboardingOpen}
        projectName={project.name}
        rootCount={project.roots.length}
        onOpenChange={(open) => {
          if (!open) closeOnboardingForProject()
          else setOnboardingOpen(true)
        }}
        onGotIt={closeOnboardingForProject}
        onDontShowAgain={handleOnboardingDontShowAgain}
      />
    </div>
  )
}

export default function App() {
  const [project, setProject] = useState<GrokProjectManifest | null>(null)
  const [workspaceProjectId, setWorkspaceProjectId] = useState<string | null>(null)
  const [activeRoot, setActiveRoot] = useState<Root | null>(null)
  const [openFiles, setOpenFiles] = useState<string[]>([])
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [dirtyFiles, setDirtyFiles] = useState<Record<string, boolean>>({})
  const [isLoadingProject, setIsLoadingProject] = useState(false)
  const [diffSession, setDiffSession] = useState<DiffSession | null>(null)
  const [diffSessionActions, setDiffSessionActions] = useState<DiffSessionActions | null>(null)
  const diffSessionRef = useRef<DiffSession | null>(null)
  diffSessionRef.current = diffSession
  const updateDiffSessionActionsIfOpen = useCallback((actions: DiffSessionActions) => {
    if (diffSessionRef.current?.source === 'agent-proposal') {
      setDiffSessionActions(actions)
    }
  }, [])
  const [searchPanelOpen, setSearchPanelOpen] = useState(false)
  const [jumpToLineRequest, setJumpToLineRequest] = useState<{ path: string; line: number } | null>(null)
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editorDiskRefreshRequest, setEditorDiskRefreshRequest] = useState<{
    nonce: number
    paths: string[]
  } | null>(null)
  const [workspaceFsEpoch, setWorkspaceFsEpoch] = useState(0)
  const [workspaceFsChange, setWorkspaceFsChange] = useState<{ nonce: number; paths: string[] } | null>(null)
  const [workspaceFsMutationRequest, setWorkspaceFsMutationRequest] = useState<{
    nonce: number
    event: WorkspaceFsMutationEvent
  } | null>(null)
  const [projectNameDialog, setProjectNameDialog] = useState<{
    manifest: GrokProjectManifest
    draft: string
    flow: 'multi-root' | 'rename'
  } | null>(null)
  const [projectNameDialogSaving, setProjectNameDialogSaving] = useState(false)

  const voiceThreadSummaryRef = useRef('')
  const voiceHandoffExecutorRef = useRef<(() => Promise<void>) | null>(null)
  const clearPendingAgentProposalRef = useRef<(() => void) | null>(null)
  const registerVoiceHandoff = useCallback((fn: (() => Promise<void>) | null) => {
    voiceHandoffExecutorRef.current = fn
  }, [])
  const registerClearPendingAgentProposal = useCallback((clear: (() => void) | null) => {
    clearPendingAgentProposalRef.current = clear
  }, [])

  const handleVoiceContinueInAgentChat = useCallback(() => {
    const fn = voiceHandoffExecutorRef.current
    if (!fn) {
      toast.message('Chat is still loading', { description: 'Try again in a moment.' })
      return
    }
    void fn()
  }, [])

  const voiceSession = useVoiceSession({
    project,
    projectId: workspaceProjectId,
    activeRoot,
    activeFilePath: activeFile,
    getThreadSummaryForVoice: () => voiceThreadSummaryRef.current,
  })

  const handleAgentDiskFilesChanged = useCallback((paths: string[]) => {
    if (!paths.length) return
    setWorkspaceFsEpoch((e) => e + 1)
    setWorkspaceFsChange((prev) => ({ nonce: (prev?.nonce ?? 0) + 1, paths }))
    setEditorDiskRefreshRequest((prev) => ({ nonce: (prev?.nonce ?? 0) + 1, paths }))
  }, [])

  useEffect(() => {
    const subscribe = window.electron?.onWorkspaceFsChanged
    if (!subscribe) return
    return subscribe((payload) => {
      const fallbackPaths = project?.roots.map((root) => root.path) ?? []
      const paths = payload.paths.length > 0 ? payload.paths : fallbackPaths
      if (!paths.length) return
      handleAgentDiskFilesChanged(paths)
    })
  }, [handleAgentDiskFilesChanged, project?.roots])

  const closeDiffSession = useCallback(() => {
    const shouldClearPending = diffSession?.source === 'agent-proposal'
    setDiffSession(null)
    setDiffSessionActions(null)
    if (shouldClearPending) clearPendingAgentProposalRef.current?.()
  }, [diffSession])

  const openDiffSession = useCallback((session: DiffSession, actions?: DiffSessionActions | null) => {
    setDiffSession(session)
    setDiffSessionActions(actions ?? null)
  }, [])

  const handleWorkspaceFsMutation = useCallback(
    (event: WorkspaceFsMutationEvent, refreshPaths: string[]) => {
      const reconciled = reconcilePathsForMutation(openFiles, activeFile, dirtyFiles, event)
      setOpenFiles(reconciled.openFiles)
      setActiveFile(reconciled.activeFile)
      setDirtyFiles(reconciled.dirtyFiles)
      setWorkspaceFsMutationRequest((prev) => ({ nonce: (prev?.nonce ?? 0) + 1, event }))
      if (refreshPaths.length) {
        setWorkspaceFsEpoch((epoch) => epoch + 1)
        setWorkspaceFsChange((prev) => ({ nonce: (prev?.nonce ?? 0) + 1, paths: refreshPaths }))
        if (event.op === 'create') {
          setEditorDiskRefreshRequest((prev) => ({ nonce: (prev?.nonce ?? 0) + 1, paths: [event.path] }))
        }
      }
      if (event.op === 'create' && !event.isDirectory) {
        setOpenFiles((prev) => (prev.includes(event.path) ? prev : [...prev, event.path]))
        setActiveFile(event.path)
      }
    },
    [activeFile, dirtyFiles, openFiles],
  )

  const hasUnsavedRef = useRef(false)
  const [projectSwitchGuard, setProjectSwitchGuard] = useState<{ resolve: (proceed: boolean) => void } | null>(null)
  const projectSwitchClosingViaConfirmRef = useRef(false)

  const onEditorUnsavedChange = useCallback((hasUnsaved: boolean) => {
    hasUnsavedRef.current = hasUnsaved
  }, [])

  const waitForProjectSwitchDecision = useCallback(() => {
    return new Promise<boolean>((resolve) => {
      if (!hasUnsavedRef.current) {
        resolve(true)
        return
      }
      projectSwitchClosingViaConfirmRef.current = false
      setProjectSwitchGuard({ resolve })
    })
  }, [])

  const applyOpenedProject = useCallback((opened: OpenProjectResult) => {
    const { manifest, projectId } = opened
    closeDiffSession()
    setSearchPanelOpen(false)
    setTerminalOpen(false)
    setJumpToLineRequest(null)
    setOpenFiles([])
    setActiveFile(null)
    setDirtyFiles({})
    setEditorDiskRefreshRequest(null)
    setWorkspaceFsMutationRequest(null)
    setWorkspaceFsEpoch(0)
    setProject(manifest)
    setWorkspaceProjectId(projectId)
    if (manifest.roots.length > 0) {
      setActiveRoot(manifest.roots[0])
    }
    toast.success(`Project loaded: ${manifest.name}`)
  }, [closeDiffSession])

  const loadProject = useCallback(async () => {
    const proceed = await waitForProjectSwitchDecision()
    if (!proceed) return

    setIsLoadingProject(true)
    try {
      if (!window.electron?.openProject) {
        toast.error("Electron API not available. Make sure you're running the full desktop app.")
        return
      }
      const opened = await window.electron.openProject()
      if (opened) {
        applyOpenedProject(opened)
      }
    } catch (error: unknown) {
      console.error('Failed to load project:', error)
      const message = error instanceof Error ? error.message : 'Failed to open project. Check the console for details.'
      toast.error(message)
    } finally {
      setIsLoadingProject(false)
    }
  }, [waitForProjectSwitchDecision, applyOpenedProject])

  const loadProjectById = useCallback(
    async (projectId: string) => {
      const proceed = await waitForProjectSwitchDecision()
      if (!proceed) return

      setIsLoadingProject(true)
      try {
        if (!window.electron?.openProjectById) {
          toast.error("Electron API not available. Make sure you're running the full desktop app.")
          return
        }
        const res = await window.electron.openProjectById(projectId)
        if (isOpenProjectByIdFailure(res)) {
          toast.error(res.error)
          return
        }
        applyOpenedProject(res)
      } catch (error: unknown) {
        console.error('Failed to load project:', error)
        const message =
          error instanceof Error ? error.message : 'Failed to open project. Check the console for details.'
        toast.error(message)
      } finally {
        setIsLoadingProject(false)
      }
    },
    [waitForProjectSwitchDecision, applyOpenedProject]
  )

  useEffect(() => {
    // Reserved for future auto-restore of last session.
  }, [])

  useEffect(() => {
    const setTitle = window.electron?.setWindowTitle
    if (!setTitle) return
    const label = project?.name?.trim() || 'GrokForge'
    void setTitle(label)
  }, [project])

  const handleFileOpen = (filePath: string) => {
    setOpenFiles((prev) => (prev.includes(filePath) ? prev : [...prev, filePath]))
    setActiveFile(filePath)
  }

  const handleSearchResultOpen = useCallback((path: string, line: number) => {
    setOpenFiles((prev) => (prev.includes(path) ? prev : [...prev, path]))
    setActiveFile(path)
    setJumpToLineRequest({ path, line })
    setSearchPanelOpen(false)
  }, [])

  const handleJumpToLineHandled = useCallback(() => {
    setJumpToLineRequest(null)
  }, [])

  const returnToProjectDashboard = useCallback(async () => {
    const proceed = await waitForProjectSwitchDecision()
    if (!proceed) return
    closeDiffSession()
    setSearchPanelOpen(false)
    setTerminalOpen(false)
    setJumpToLineRequest(null)
    setOpenFiles([])
    setActiveFile(null)
    setDirtyFiles({})
    setEditorDiskRefreshRequest(null)
    setWorkspaceFsMutationRequest(null)
    setWorkspaceFsEpoch(0)
    setActiveRoot(null)
    setWorkspaceProjectId(null)
    setProject(null)
  }, [waitForProjectSwitchDecision, closeDiffSession])

  const handleAddRoot = useCallback(async () => {
    if (!window.electron?.addWorkspaceRoot) {
      toast.error('Add root requires the GrokForge desktop app.')
      return
    }
    try {
      const res = await window.electron.addWorkspaceRoot()
      if (!res) return
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setProject(res.manifest)
      const added = res.manifest.roots[res.manifest.roots.length - 1]
      if (added) {
        setActiveRoot(added)
        toast.success(`Added root: ${added.label}`)
      }
      if (res.manifest.roots.length === 2) {
        const r0 = res.manifest.roots[0]?.label?.trim()
        const r1 = res.manifest.roots[1]?.label?.trim()
        const suggestion = r0 && r1 ? `${r0} · ${r1}` : res.manifest.name.trim() || 'My project'
        setProjectNameDialog({
          manifest: res.manifest,
          draft: suggestion.slice(0, RECENT_PROJECT_DISPLAY_NAME_MAX_LEN),
          flow: 'multi-root',
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add workspace root'
      toast.error(message)
    }
  }, [])

  const openRenameProjectDialog = useCallback(() => {
    if (!project) return
    setProjectNameDialog({
      manifest: project,
      draft: project.name.trim() || '',
      flow: 'rename',
    })
  }, [project])

  const saveProjectNameFromDialog = useCallback(async () => {
    if (!projectNameDialog || !workspaceProjectId) return
    const trimmed = projectNameDialog.draft.trim()
    if (!trimmed) {
      toast.error('Enter a project name.')
      return
    }
    if (trimmed.length > RECENT_PROJECT_DISPLAY_NAME_MAX_LEN) {
      toast.error(`Name must be at most ${RECENT_PROJECT_DISPLAY_NAME_MAX_LEN} characters.`)
      return
    }
    const save = window.electron?.saveManifest
    const renameRecent = window.electron?.updateRecentPickerName
    if (!save || !renameRecent) {
      toast.error('Saving requires the GrokForge desktop app.')
      return
    }
    const baseManifest =
      projectNameDialog.flow === 'rename' && project ? project : projectNameDialog.manifest
    const next: GrokProjectManifest = { ...baseManifest, name: trimmed }
    setProjectNameDialogSaving(true)
    try {
      const ok = await save(next)
      if (!ok) {
        toast.error('Could not save project name.')
        return
      }
      const recentRes = await renameRecent(workspaceProjectId, trimmed)
      if (!recentRes.ok) {
        toast.error(recentRes.error)
        return
      }
      setProject(next)
      setProjectNameDialog(null)
      toast.success(`Project name set to “${trimmed}”.`)
    } finally {
      setProjectNameDialogSaving(false)
    }
  }, [projectNameDialog, workspaceProjectId, project])

  const handleCloseFile = (path: string) => {
    setOpenFiles((prev) => {
      const next = prev.filter((f) => f !== path)
      setActiveFile((af) => {
        if (af !== path) return af
        return next.length > 0 ? next[next.length - 1] : null
      })
      return next
    })
    setDirtyFiles((prev) => {
      if (!(path in prev)) return prev
      const next = { ...prev }
      delete next[path]
      return next
    })
  }

  const finishProjectSwitchDialog = (proceed: boolean) => {
    setProjectSwitchGuard((prev) => {
      prev?.resolve(proceed)
      return null
    })
  }

  const agentChatSurface = settingsOpen ? 'settings' : !project ? 'welcome' : 'workspace'

  const projectSwitchGuardAlert = (
    <ProjectSwitchGuardAlert
      open={projectSwitchGuard !== null}
      closingViaConfirmRef={projectSwitchClosingViaConfirmRef}
      onStay={() => finishProjectSwitchDialog(false)}
      onContinueWithoutSaving={() => {
        projectSwitchClosingViaConfirmRef.current = true
        finishProjectSwitchDialog(true)
      }}
    />
  )

  return (
    <AgentChatActivityProvider surface={agentChatSurface} activeWorkspaceProjectId={workspaceProjectId}>
      {settingsOpen ? (
        <>
          <BuildChannelIndicator />
          <SettingsPage
            onBack={() => setSettingsOpen(false)}
            macTitleBarInset={isMacElectron()}
            project={project}
            workspaceProjectId={workspaceProjectId}
            onProjectSaved={setProject}
            onAgentDiskFilesChanged={handleAgentDiskFilesChanged}
          />
          {projectSwitchGuardAlert}
        </>
      ) : !project ? (
        <>
          <BuildChannelIndicator />
          <ProjectWelcome
            isLoadingProject={isLoadingProject}
            onBrowseProject={() => void loadProject()}
            onOpenRecent={(id) => void loadProjectById(id)}
            onOpenSettings={() => setSettingsOpen(true)}
            macTitleBarInset={isMacElectron()}
          />
          {projectSwitchGuardAlert}
        </>
      ) : (
        <>
          <BuildChannelIndicator />
          <ProjectWorkspaceShell
            project={project}
            workspaceProjectId={workspaceProjectId}
            activeRoot={activeRoot}
            setActiveRoot={setActiveRoot}
            openFiles={openFiles}
            activeFile={activeFile}
            dirtyFiles={dirtyFiles}
            setActiveFile={setActiveFile}
            onFileOpen={handleFileOpen}
            onCloseFile={handleCloseFile}
            onEditorUnsavedChange={onEditorUnsavedChange}
            onDirtyFilesChange={setDirtyFiles}
            diffSession={diffSession}
            diffSessionActions={diffSessionActions}
            onOpenDiffSession={openDiffSession}
            onCloseDiffSession={closeDiffSession}
            searchPanelOpen={searchPanelOpen}
            setSearchPanelOpen={setSearchPanelOpen}
            jumpToLineRequest={jumpToLineRequest}
            onJumpToLineHandled={handleJumpToLineHandled}
            onSearchResultOpen={handleSearchResultOpen}
            terminalOpen={terminalOpen}
            setTerminalOpen={setTerminalOpen}
            onReturnToDashboard={() => void returnToProjectDashboard()}
            onAddRoot={() => void handleAddRoot()}
            voiceSession={voiceSession}
            onOpenSettings={() => setSettingsOpen(true)}
            editorDiskRefreshRequest={editorDiskRefreshRequest}
            onAgentDiskFilesChanged={handleAgentDiskFilesChanged}
            workspaceFsEpoch={workspaceFsEpoch}
            workspaceFsChange={workspaceFsChange}
            onWorkspaceFsMutation={handleWorkspaceFsMutation}
            workspaceFsMutationRequest={workspaceFsMutationRequest}
            onEditProjectName={openRenameProjectDialog}
            voiceThreadSummaryRef={voiceThreadSummaryRef}
            onRegisterVoiceHandoff={registerVoiceHandoff}
            onStopVoiceForHandoff={() => voiceSession.stop()}
            onVoiceContinueInAgentChat={handleVoiceContinueInAgentChat}
            onRegisterClearPendingAgentProposal={registerClearPendingAgentProposal}
            onUpdateDiffSessionActions={updateDiffSessionActionsIfOpen}
          />
          {projectSwitchGuardAlert}
          <Dialog
            open={projectNameDialog !== null}
            onOpenChange={(open) => {
              if (!open && !projectNameDialogSaving) setProjectNameDialog(null)
            }}
          >
            <DialogContent className="border-zinc-800 bg-zinc-950 text-white sm:rounded-2xl sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-white">
                  {projectNameDialog?.flow === 'rename' ? 'Rename project' : 'Name this project'}
                </DialogTitle>
                <DialogDescription className="text-zinc-400">
                  {projectNameDialog?.flow === 'rename' ? (
                    <>
                      This name appears in the title bar, welcome screen, and agent context. It is stored in GrokForge app
                      data, not in your workspace folders.
                    </>
                  ) : (
                    <>
                      You now have more than one workspace root. Choose a display name for the whole project (saved in
                      GrokForge and shown on the welcome screen).
                    </>
                  )}
                </DialogDescription>
              </DialogHeader>
              <Input
                value={projectNameDialog?.draft ?? ''}
                onChange={(ev) =>
                  setProjectNameDialog((prev) =>
                    prev ? { ...prev, draft: ev.target.value.slice(0, RECENT_PROJECT_DISPLAY_NAME_MAX_LEN) } : prev,
                  )
                }
                maxLength={RECENT_PROJECT_DISPLAY_NAME_MAX_LEN}
                disabled={projectNameDialogSaving}
                placeholder="Project name"
                className="border-zinc-700 bg-zinc-900/80 text-white placeholder:text-zinc-600 focus-visible:ring-primary"
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' && projectNameDialog?.draft.trim() && !projectNameDialogSaving) {
                    ev.preventDefault()
                    void saveProjectNameFromDialog()
                  }
                }}
              />
              <DialogFooter className="gap-2 sm:space-x-0">
                <Button
                  type="button"
                  variant="outline"
                  className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-900"
                  disabled={projectNameDialogSaving}
                  onClick={() => setProjectNameDialog(null)}
                >
                  {projectNameDialog?.flow === 'rename' ? 'Cancel' : 'Skip for now'}
                </Button>
                <Button
                  type="button"
                  disabled={!projectNameDialog?.draft.trim() || projectNameDialogSaving}
                  onClick={() => void saveProjectNameFromDialog()}
                >
                  {projectNameDialogSaving ? 'Saving…' : 'Save'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </AgentChatActivityProvider>
  )
}
