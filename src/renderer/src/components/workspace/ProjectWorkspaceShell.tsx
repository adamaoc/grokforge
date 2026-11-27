import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react'
import { useDefaultLayout, usePanelRef, type Layout } from 'react-resizable-panels'
import { toast } from 'sonner'
import { Sidebar } from '@/components/Sidebar'
import { ChatThread } from '@/components/ChatThread'
import { EditorPane } from '@/components/EditorPane'
import { EditorContextBubble } from '@/components/EditorContextBubble'
import { VoiceExpandedPanel, type VoiceControlsStatus } from '@/components/VoiceControls'
import { ProjectHeader } from '@/components/ProjectHeader'
import { SearchPanel } from '@/components/SearchPanel'
import { TerminalPanel } from '@/components/TerminalPanel'
import { AgentOnboardingDialog } from '@/components/AgentOnboardingDialog'
import type { SettingsTab } from '@/components/settings/SettingsPage'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { shouldAutoCollapseVoicePanelOnSessionEnd, voiceHeaderIndicator } from '@/lib/voice-ui-state'
import type { useVoiceSession } from '@/hooks/useVoiceSession'
import {
  dismissOnboardingGlobally,
  markProjectOnboardingSeen,
  shouldShowProjectOnboarding,
} from '@/lib/onboarding-storage'
import { isMacElectron } from '@/lib/electron-chrome'
import { basenamePath } from '@/lib/workspace-paths'
import { isPathUnderWorkspaceRoots } from '@/lib/workspace-path-check'
import { resolveWorkspaceGlobalShortcut } from '@/lib/workspace-global-shortcuts'
import {
  AGENT_CHAT_MAX_ATTACHMENTS,
  AGENT_CHAT_SELECTION_MAX_CHARS,
  type AgentChatAttachment,
  type AgentChatEditorSelection,
  type DiffSession,
  type GrokProjectManifest,
  type WorkspaceFsMutationEvent,
} from '@/types'

/** Percent layouts used when nothing valid is stored. Chat starts full width; the editor opens on demand. */
const DEFAULT_OUTER_LAYOUT: Layout = { sidebar: 17, main: 83 }
const DEFAULT_INNER_LAYOUT: Layout = { chat: 100, editor: 0 }

function sanitizeOuterLayout(layout: Layout | undefined): Layout | undefined {
  if (!layout) return undefined
  const { sidebar: s, main: m } = layout
  if (typeof s !== 'number' || typeof m !== 'number') return undefined
  if (Math.abs(s + m - 100) > 2 || s < 3 || s > 35 || m < 65 || m > 97) return undefined
  return { sidebar: s, main: m }
}

function sanitizeInnerLayout(layout: Layout | undefined): Layout | undefined {
  if (!layout) return undefined
  const { chat: c, editor: e } = layout
  if (typeof c !== 'number' || typeof e !== 'number') return undefined
  if (Math.abs(c + e - 100) > 2 || c < 20 || c > 100 || e < 0 || e > 80) return undefined
  return { chat: c, editor: e }
}

export interface ProjectWorkspaceShellProps {
  project: GrokProjectManifest
  workspaceProjectId: string | null
  openFiles: string[]
  activeFile: string | null
  dirtyFiles: Record<string, boolean>
  setActiveFile: Dispatch<SetStateAction<string | null>>
  onFileOpen: (path: string) => void
  onCloseFile: (path: string) => void
  onEditorUnsavedChange: (hasUnsaved: boolean) => void
  onDirtyFilesChange: (dirtyByPath: Record<string, boolean>) => void
  diffSession: DiffSession | null
  onOpenDiffSession: (session: DiffSession) => void
  onCloseDiffSession: () => void
  searchPanelOpen: boolean
  setSearchPanelOpen: (open: boolean) => void
  jumpToLineRequest: { path: string; line: number } | null
  onJumpToLineHandled: () => void
  onSearchResultOpen: (path: string, line: number) => void
  terminalOpen: boolean
  setTerminalOpen: Dispatch<SetStateAction<boolean>>
  onReturnToDashboard: () => void
  onAddRoot: () => void
  voiceSession: ReturnType<typeof useVoiceSession>
  onOpenSettings: (tab?: SettingsTab) => void
  /** Bump when files change on disk so Monaco reloads matching tabs. */
  editorDiskRefreshRequest: { nonce: number; paths: string[] } | null
  onDiskFilesChanged: (paths: string[]) => void
  /** Increments when files change on disk so the tree refreshes listings. */
  workspaceFsEpoch: number
  workspaceFsChange: { nonce: number; paths: string[] } | null
  onWorkspaceFsMutation: (event: WorkspaceFsMutationEvent, refreshPaths: string[]) => void
  workspaceFsMutationRequest: { nonce: number; event: WorkspaceFsMutationEvent } | null
  onEditProjectName: () => void
  voiceThreadSummaryRef: MutableRefObject<string>
  onRegisterVoiceHandoff: (execute: (() => Promise<void>) | null) => void
  onStopVoiceForHandoff: () => Promise<void>
  onVoiceContinueInAgentChat: () => void
}

/** The open-project workspace: sidebar, chat, editor, terminal, voice panel. */
export function ProjectWorkspaceShell({
  project,
  workspaceProjectId,
  openFiles,
  activeFile,
  dirtyFiles,
  setActiveFile,
  onFileOpen,
  onCloseFile,
  onEditorUnsavedChange,
  onDirtyFilesChange,
  diffSession,
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
  onDiskFilesChanged,
  workspaceFsEpoch,
  workspaceFsChange,
  onWorkspaceFsMutation,
  workspaceFsMutationRequest,
  onEditProjectName,
  voiceThreadSummaryRef,
  onRegisterVoiceHandoff,
  onStopVoiceForHandoff,
  onVoiceContinueInAgentChat,
}: ProjectWorkspaceShellProps) {
  const outerLayout = useDefaultLayout({ id: 'grokforge-shell-outer-v4', panelIds: ['sidebar', 'main'] })
  const innerLayoutStorageId = `grokforge-shell-chat-editor-v5:${workspaceProjectId ?? '_'}`
  const innerLayout = useDefaultLayout({ id: innerLayoutStorageId, panelIds: ['chat', 'editor'] })
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
  const [chatAttachments, setChatAttachments] = useState<AgentChatAttachment[]>([])
  const [editorSelection, setEditorSelection] = useState<AgentChatEditorSelection | null>(null)
  const [onboardingOpen, setOnboardingOpen] = useState(false)

  useEffect(() => {
    setOnboardingOpen(workspaceProjectId ? shouldShowProjectOnboarding(workspaceProjectId) : false)
  }, [workspaceProjectId])

  const closeOnboarding = useCallback(() => {
    if (workspaceProjectId) markProjectOnboardingSeen(workspaceProjectId)
    setOnboardingOpen(false)
  }, [workspaceProjectId])

  const syncSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed(sidebarPanelRef.current?.isCollapsed() ?? false)
  }, [sidebarPanelRef])

  const handleToggleSidebar = useCallback(() => {
    const api = sidebarPanelRef.current
    if (!api) return
    if (api.isCollapsed()) api.expand()
    else api.collapse()
    requestAnimationFrame(() => syncSidebarCollapsed())
  }, [sidebarPanelRef, syncSidebarCollapsed])

  const syncEditorPaneCollapsed = useCallback(() => {
    setEditorPaneCollapsed(editorPanelRef.current?.isCollapsed() ?? false)
  }, [editorPanelRef])

  const ensureEditorPaneExpanded = useCallback(() => {
    const api = editorPanelRef.current
    if (api?.isCollapsed()) api.expand()
    requestAnimationFrame(() => syncEditorPaneCollapsed())
  }, [editorPanelRef, syncEditorPaneCollapsed])

  const handleToggleEditorPane = useCallback(() => {
    const api = editorPanelRef.current
    if (!api) return
    if (api.isCollapsed()) api.expand()
    else api.collapse()
    requestAnimationFrame(() => syncEditorPaneCollapsed())
  }, [editorPanelRef, syncEditorPaneCollapsed])

  const handleCollapseEditorPane = useCallback(() => {
    const api = editorPanelRef.current
    if (!api || api.isCollapsed()) return
    api.collapse()
    requestAnimationFrame(() => syncEditorPaneCollapsed())
  }, [editorPanelRef, syncEditorPaneCollapsed])

  const openSearchWorkspace = useCallback(() => {
    ensureEditorPaneExpanded()
    setSearchPanelOpen(true)
  }, [ensureEditorPaneExpanded, setSearchPanelOpen])

  // Voice panel: open when a session starts or fails; close when it ends.
  const [voicePanelOpen, setVoicePanelOpen] = useState(false)
  const voiceDisabled = project.voice.defaultVoiceMode === 'off'
  const prevVoiceStatusRef = useRef<VoiceControlsStatus>('idle')
  const prevVoiceActiveRef = useRef(false)
  const voiceIndicator = useMemo(
    () => voiceHeaderIndicator(voiceSession.status, voiceSession.isActive, voicePanelOpen, voiceDisabled),
    [voiceSession.status, voiceSession.isActive, voicePanelOpen, voiceDisabled],
  )
  const voiceStatus = voiceSession.status
  const voiceActive = voiceSession.isActive
  useEffect(() => {
    const status = voiceStatus
    const isActive = voiceActive
    const prevStatus = prevVoiceStatusRef.current
    const prevIsActive = prevVoiceActiveRef.current
    const opened =
      (status === 'connecting' && prevStatus === 'idle') ||
      (isActive && !prevIsActive) ||
      (status === 'error' && prevStatus !== 'error')
    if (opened && !voicePanelOpen) setVoicePanelOpen(true)
    if (shouldAutoCollapseVoicePanelOnSessionEnd(status, isActive, prevIsActive)) setVoicePanelOpen(false)
    prevVoiceStatusRef.current = status
    prevVoiceActiveRef.current = isActive
  }, [voiceStatus, voiceActive, voicePanelOpen])
  useEffect(() => {
    if (!voicePanelOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setVoicePanelOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [voicePanelOpen])

  const openFileWithEditorPane = useCallback(
    (path: string) => {
      ensureEditorPaneExpanded()
      onFileOpen(path)
    },
    [ensureEditorPaneExpanded, onFileOpen],
  )

  const openDiffSessionWithEditorPane = useCallback(
    (session: DiffSession) => {
      ensureEditorPaneExpanded()
      onOpenDiffSession(session)
    },
    [ensureEditorPaneExpanded, onOpenDiffSession],
  )

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
      if (shortcut === 'search') openSearchWorkspace()
      else if (shortcut === 'terminal') setTerminalOpen((o) => !o)
      else if (shortcut === 'sidebar') handleToggleSidebar()
      else if (shortcut === 'editor') handleToggleEditorPane()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [handleToggleEditorPane, handleToggleSidebar, openSearchWorkspace, setTerminalOpen])

  useLayoutEffect(() => {
    const id = window.requestAnimationFrame(() => syncEditorPaneCollapsed())
    return () => window.cancelAnimationFrame(id)
  }, [workspaceProjectId, innerDefaultLayout, syncEditorPaneCollapsed])

  useLayoutEffect(() => {
    const api = terminalPanelRef.current
    if (!api) return
    if (terminalOpen) api.expand()
    else api.collapse()
  }, [terminalOpen, terminalPanelRef])

  const addPathToChat = useCallback(
    (attachment: AgentChatAttachment) => {
      if (!isPathUnderWorkspaceRoots(attachment.path, project.roots)) {
        toast.error('Only files and folders in this project can be attached.')
        return
      }
      setChatAttachments((prev) =>
        prev.some((item) => item.path === attachment.path && item.type === attachment.type)
          ? prev
          : [...prev, attachment].slice(-AGENT_CHAT_MAX_ATTACHMENTS),
      )
      toast.success('Added to next chat message', { description: basenamePath(attachment.path) || attachment.path })
    },
    [project.roots],
  )

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
          collapsedSize="56px"
          minSize="210px"
          maxSize="32%"
          defaultSize="17%"
          className="flex min-h-0 min-w-0"
          onResize={syncSidebarCollapsed}
        >
          <Sidebar
            project={project}
            activeFile={activeFile}
            openFiles={openFiles}
            dirtyFiles={dirtyFiles}
            onFileOpen={openFileWithEditorPane}
            onReturnToDashboard={onReturnToDashboard}
            onAddRoot={onAddRoot}
            onOpenSettings={() => onOpenSettings()}
            collapsed={sidebarCollapsed}
            onToggleSidebar={handleToggleSidebar}
            workspaceFsEpoch={workspaceFsEpoch}
            workspaceFsChange={workspaceFsChange}
            onWorkspaceFsMutation={onWorkspaceFsMutation}
            onAddPathToChat={addPathToChat}
            onOpenDiffSession={openDiffSessionWithEditorPane}
          />
        </ResizablePanel>

        <ResizableHandle aria-label="Resize sidebar" title="Resize sidebar" />

        <ResizablePanel id="main" defaultSize="83%" minSize="55%" className="flex min-h-0 min-w-0 flex-col">
          <ProjectHeader
            project={project}
            onEditProjectName={onEditProjectName}
            onOpenSearch={openSearchWorkspace}
            onOpenTerminal={() => setTerminalOpen((o) => !o)}
            onOpenVoice={() => !voiceDisabled && setVoicePanelOpen((open) => !open)}
            voiceDisabled={voiceDisabled}
            voicePanelOpen={voicePanelOpen}
            voiceHeaderIndicator={voiceIndicator}
            onOpenSettings={() => onOpenSettings()}
          />

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ResizablePanelGroup id="grokforge-workspace-terminal-v1" orientation="vertical" className="min-h-0 min-w-0 flex-1">
              <ResizablePanel id="workspace" defaultSize="68%" minSize="40%" className="flex min-h-0 min-w-0 flex-col">
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
                      <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
                        <ChatThread
                          key={workspaceProjectId ?? project.name}
                          projectId={workspaceProjectId}
                          project={project}
                          activeFilePath={activeFile}
                          openTabs={openFiles.map((path) => ({ path, dirty: Boolean(dirtyFiles[path]) }))}
                          attachments={chatAttachments}
                          editorSelection={editorSelection}
                          onRemoveAttachment={(attachment) =>
                            setChatAttachments((prev) =>
                              prev.filter((item) => item.path !== attachment.path || item.type !== attachment.type),
                            )
                          }
                          onClearAttachments={() => setChatAttachments([])}
                          onAddChatAttachments={mergeChatAttachments}
                          voiceThreadSummaryRef={voiceThreadSummaryRef}
                          onRegisterVoiceHandoff={onRegisterVoiceHandoff}
                          onStopVoiceForHandoff={onStopVoiceForHandoff}
                          onOpenSettings={() => onOpenSettings()}
                          onOpenTerminal={() => setTerminalOpen(true)}
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
                        onCloseDiffSession={onCloseDiffSession}
                        jumpToLineRequest={jumpToLineRequest}
                        onJumpToLineHandled={onJumpToLineHandled}
                        diskRefreshRequest={editorDiskRefreshRequest}
                        mutationRequest={workspaceFsMutationRequest}
                        onFileSaved={onDiskFilesChanged}
                        onEditorSelectionChange={setEditorSelection}
                        selectionMaxChars={AGENT_CHAT_SELECTION_MAX_CHARS}
                        onCollapseEditorPane={handleCollapseEditorPane}
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
                    openFilesCount={openFiles.length}
                    onExpandEditor={() => {
                      editorPanelRef.current?.expand()
                      requestAnimationFrame(() => syncEditorPaneCollapsed())
                    }}
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
                  open={terminalOpen}
                  onClose={() => setTerminalOpen(false)}
                  onOpenFileLink={openSearchResultWithEditorPane}
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
              onOpenVoiceSettings={() => onOpenSettings('voice')}
              project={project}
            />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      <AgentOnboardingDialog
        open={onboardingOpen}
        projectName={project.name}
        rootCount={project.roots.length}
        onOpenChange={(open) => (open ? setOnboardingOpen(true) : closeOnboarding())}
        onGotIt={closeOnboarding}
        onDontShowAgain={() => {
          dismissOnboardingGlobally()
          closeOnboarding()
        }}
      />
    </div>
  )
}
