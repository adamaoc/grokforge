import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ProjectWorkspaceShell } from '@/components/workspace/ProjectWorkspaceShell'
import { ProjectSwitchGuardAlert } from '@/components/workspace/ProjectSwitchGuardAlert'
import { ProjectNameDialog, type ProjectNameDialogFlow } from '@/components/workspace/ProjectNameDialog'
import { BuildChannelIndicator } from '@/components/BuildChannelIndicator'
import { ProjectWelcome } from '@/components/ProjectWelcome'
import { SettingsPage, type SettingsTab } from '@/components/settings/SettingsPage'
import { useVoiceSession } from '@/hooks/useVoiceSession'
import { isMacElectron } from '@/lib/electron-chrome'
import { AgentChatActivityProvider } from '@/context/AgentChatActivityProvider'
import { reconcilePathsForMutation } from '@/lib/workspace-fs-mutation-state'
import {
  RECENT_PROJECT_DISPLAY_NAME_MAX_LEN,
  type DiffSession,
  type GrokProjectManifest,
  type OpenProjectByIdFailure,
  type OpenProjectResult,
  type WorkspaceFsMutationEvent,
} from '@/types'

function isOpenProjectByIdFailure(r: OpenProjectResult | OpenProjectByIdFailure): r is OpenProjectByIdFailure {
  return 'ok' in r && r.ok === false
}

type NonceRequest = { nonce: number; paths: string[] }
const bump = (paths: string[]) => (prev: NonceRequest | null): NonceRequest => ({
  nonce: (prev?.nonce ?? 0) + 1,
  paths,
})

export default function App() {
  const [project, setProject] = useState<GrokProjectManifest | null>(null)
  const [workspaceProjectId, setWorkspaceProjectId] = useState<string | null>(null)
  const [openFiles, setOpenFiles] = useState<string[]>([])
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [dirtyFiles, setDirtyFiles] = useState<Record<string, boolean>>({})
  const [isLoadingProject, setIsLoadingProject] = useState(false)
  const [diffSession, setDiffSession] = useState<DiffSession | null>(null)
  const [searchPanelOpen, setSearchPanelOpen] = useState(false)
  const [jumpToLineRequest, setJumpToLineRequest] = useState<{ path: string; line: number } | null>(null)
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('agent')
  const openSettings = useCallback((tab: SettingsTab = 'agent') => {
    setSettingsTab(tab)
    setSettingsOpen(true)
  }, [])
  const [editorDiskRefreshRequest, setEditorDiskRefreshRequest] = useState<NonceRequest | null>(null)
  const [workspaceFsEpoch, setWorkspaceFsEpoch] = useState(0)
  const [workspaceFsChange, setWorkspaceFsChange] = useState<NonceRequest | null>(null)
  const [workspaceFsMutationRequest, setWorkspaceFsMutationRequest] = useState<{
    nonce: number
    event: WorkspaceFsMutationEvent
  } | null>(null)
  const [nameDialog, setNameDialog] = useState<{
    manifest: GrokProjectManifest
    draft: string
    flow: ProjectNameDialogFlow
  } | null>(null)
  const [nameDialogSaving, setNameDialogSaving] = useState(false)

  // Voice ↔ agent chat
  const voiceThreadSummaryRef = useRef('')
  const voiceHandoffRef = useRef<(() => Promise<void>) | null>(null)
  const registerVoiceHandoff = useCallback((fn: (() => Promise<void>) | null) => {
    voiceHandoffRef.current = fn
  }, [])
  const handleVoiceContinueInAgentChat = useCallback(() => {
    const fn = voiceHandoffRef.current
    if (!fn) {
      toast.message('Chat is still loading', { description: 'Try again in a moment.' })
      return
    }
    void fn()
  }, [])
  const voiceSession = useVoiceSession({
    project,
    projectId: workspaceProjectId,
    activeFilePath: activeFile,
    getThreadSummaryForVoice: () => voiceThreadSummaryRef.current,
  })

  // Files changed on disk (agent, revert, save): refresh tree, git badges, open editors.
  const handleDiskFilesChanged = useCallback((paths: string[]) => {
    if (!paths.length) return
    setWorkspaceFsEpoch((e) => e + 1)
    setWorkspaceFsChange(bump(paths))
    setEditorDiskRefreshRequest(bump(paths))
  }, [])

  useEffect(() => {
    return window.electron?.onWorkspaceFsChanged?.((payload) => {
      const paths = payload.paths.length > 0 ? payload.paths : (project?.roots.map((r) => r.path) ?? [])
      handleDiskFilesChanged(paths)
    })
  }, [handleDiskFilesChanged, project?.roots])

  const handleWorkspaceFsMutation = useCallback(
    (event: WorkspaceFsMutationEvent, refreshPaths: string[]) => {
      const reconciled = reconcilePathsForMutation(openFiles, activeFile, dirtyFiles, event)
      setOpenFiles(reconciled.openFiles)
      setActiveFile(reconciled.activeFile)
      setDirtyFiles(reconciled.dirtyFiles)
      setWorkspaceFsMutationRequest((prev) => ({ nonce: (prev?.nonce ?? 0) + 1, event }))
      if (refreshPaths.length) {
        setWorkspaceFsEpoch((epoch) => epoch + 1)
        setWorkspaceFsChange(bump(refreshPaths))
        if (event.op === 'create') setEditorDiskRefreshRequest(bump([event.path]))
      }
      if (event.op === 'create' && !event.isDirectory) {
        setOpenFiles((prev) => (prev.includes(event.path) ? prev : [...prev, event.path]))
        setActiveFile(event.path)
      }
    },
    [activeFile, dirtyFiles, openFiles],
  )

  // Unsaved-changes guard when leaving a project.
  const hasUnsavedRef = useRef(false)
  const [switchGuard, setSwitchGuard] = useState<{ resolve: (proceed: boolean) => void } | null>(null)
  const switchGuardClosingRef = useRef(false)
  const waitForProjectSwitchDecision = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        if (!hasUnsavedRef.current) {
          resolve(true)
          return
        }
        switchGuardClosingRef.current = false
        setSwitchGuard({ resolve })
      }),
    [],
  )
  const finishSwitchGuard = (proceed: boolean) => {
    setSwitchGuard((prev) => {
      prev?.resolve(proceed)
      return null
    })
  }

  const resetWorkspaceState = useCallback(() => {
    setDiffSession(null)
    setSearchPanelOpen(false)
    setTerminalOpen(false)
    setJumpToLineRequest(null)
    setOpenFiles([])
    setActiveFile(null)
    setDirtyFiles({})
    setEditorDiskRefreshRequest(null)
    setWorkspaceFsMutationRequest(null)
    setWorkspaceFsEpoch(0)
  }, [])

  const applyOpenedProject = useCallback(
    (opened: OpenProjectResult) => {
      resetWorkspaceState()
      setProject(opened.manifest)
      setWorkspaceProjectId(opened.projectId)
    },
    [resetWorkspaceState],
  )

  const openProject = useCallback(
    async (load: () => Promise<OpenProjectResult | OpenProjectByIdFailure | null>) => {
      if (!(await waitForProjectSwitchDecision())) return
      setIsLoadingProject(true)
      try {
        const res = await load()
        if (!res) return
        if (isOpenProjectByIdFailure(res)) {
          toast.error(res.error)
          return
        }
        applyOpenedProject(res)
      } catch (error: unknown) {
        console.error('Failed to load project:', error)
        toast.error(error instanceof Error ? error.message : 'Failed to open project.')
      } finally {
        setIsLoadingProject(false)
      }
    },
    [applyOpenedProject, waitForProjectSwitchDecision],
  )

  const returnToDashboard = useCallback(async () => {
    if (!(await waitForProjectSwitchDecision())) return
    resetWorkspaceState()
    setWorkspaceProjectId(null)
    setProject(null)
  }, [resetWorkspaceState, waitForProjectSwitchDecision])

  useEffect(() => {
    void window.electron?.setWindowTitle?.(project?.name?.trim() || 'GrokForge')
  }, [project])

  const handleAddRoot = useCallback(async () => {
    const add = window.electron?.addWorkspaceRoot
    if (!add) return
    try {
      const res = await add()
      if (!res) return
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setProject(res.manifest)
      const added = res.manifest.roots[res.manifest.roots.length - 1]
      if (added) toast.success(`Added folder: ${added.label}`)
      if (res.manifest.roots.length === 2) {
        const [r0, r1] = res.manifest.roots.map((r) => r.label?.trim())
        const suggestion = r0 && r1 ? `${r0} · ${r1}` : res.manifest.name.trim() || 'My project'
        setNameDialog({
          manifest: res.manifest,
          draft: suggestion.slice(0, RECENT_PROJECT_DISPLAY_NAME_MAX_LEN),
          flow: 'multi-root',
        })
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add folder')
    }
  }, [])

  const saveProjectName = useCallback(async () => {
    if (!nameDialog || !workspaceProjectId) return
    const trimmed = nameDialog.draft.trim()
    const save = window.electron?.saveManifest
    const renameRecent = window.electron?.updateRecentPickerName
    if (!trimmed || !save || !renameRecent) return
    const base = nameDialog.flow === 'rename' && project ? project : nameDialog.manifest
    const next: GrokProjectManifest = { ...base, name: trimmed }
    setNameDialogSaving(true)
    try {
      if (!(await save(next))) {
        toast.error('Could not save project name.')
        return
      }
      const recentRes = await renameRecent(workspaceProjectId, trimmed)
      if (!recentRes.ok) {
        toast.error(recentRes.error)
        return
      }
      setProject(next)
      setNameDialog(null)
    } finally {
      setNameDialogSaving(false)
    }
  }, [nameDialog, workspaceProjectId, project])

  // Stable callbacks: EditorPane effects depend on these, so inline arrows would loop renders.
  const handleEditorUnsavedChange = useCallback((hasUnsaved: boolean) => {
    hasUnsavedRef.current = hasUnsaved
  }, [])
  const handleFileOpen = useCallback((filePath: string) => {
    setOpenFiles((prev) => (prev.includes(filePath) ? prev : [...prev, filePath]))
    setActiveFile(filePath)
  }, [])
  const handleSearchResultOpen = useCallback((path: string, line: number) => {
    setOpenFiles((prev) => (prev.includes(path) ? prev : [...prev, path]))
    setActiveFile(path)
    setJumpToLineRequest({ path, line })
    setSearchPanelOpen(false)
  }, [])
  const handleJumpToLineHandled = useCallback(() => setJumpToLineRequest(null), [])
  const handleCloseDiffSession = useCallback(() => setDiffSession(null), [])

  const handleCloseFile = (path: string) => {
    setOpenFiles((prev) => {
      const next = prev.filter((f) => f !== path)
      setActiveFile((af) => (af !== path ? af : (next[next.length - 1] ?? null)))
      return next
    })
    setDirtyFiles((prev) => {
      if (!(path in prev)) return prev
      const next = { ...prev }
      delete next[path]
      return next
    })
  }

  const switchGuardAlert = (
    <ProjectSwitchGuardAlert
      open={switchGuard !== null}
      closingViaConfirmRef={switchGuardClosingRef}
      onStay={() => finishSwitchGuard(false)}
      onContinueWithoutSaving={() => {
        switchGuardClosingRef.current = true
        finishSwitchGuard(true)
      }}
    />
  )

  const surface = settingsOpen ? 'settings' : !project ? 'welcome' : 'workspace'

  return (
    <AgentChatActivityProvider surface={surface} activeWorkspaceProjectId={workspaceProjectId}>
      <BuildChannelIndicator />
      {settingsOpen ? (
        <SettingsPage
          onBack={() => setSettingsOpen(false)}
          macTitleBarInset={isMacElectron()}
          project={project}
          onProjectSaved={setProject}
          initialTab={settingsTab}
        />
      ) : !project ? (
        <ProjectWelcome
          isLoadingProject={isLoadingProject}
          onBrowseProject={() => void openProject(() => window.electron?.openProject?.() ?? Promise.resolve(null))}
          onOpenRecent={(id) =>
            void openProject(() => window.electron?.openProjectById?.(id) ?? Promise.resolve(null))
          }
          onOpenSettings={() => openSettings()}
          macTitleBarInset={isMacElectron()}
        />
      ) : (
        <>
          <ProjectWorkspaceShell
            project={project}
            workspaceProjectId={workspaceProjectId}
            openFiles={openFiles}
            activeFile={activeFile}
            dirtyFiles={dirtyFiles}
            setActiveFile={setActiveFile}
            onFileOpen={handleFileOpen}
            onCloseFile={handleCloseFile}
            onEditorUnsavedChange={handleEditorUnsavedChange}
            onDirtyFilesChange={setDirtyFiles}
            diffSession={diffSession}
            onOpenDiffSession={setDiffSession}
            onCloseDiffSession={handleCloseDiffSession}
            searchPanelOpen={searchPanelOpen}
            setSearchPanelOpen={setSearchPanelOpen}
            jumpToLineRequest={jumpToLineRequest}
            onJumpToLineHandled={handleJumpToLineHandled}
            onSearchResultOpen={handleSearchResultOpen}
            terminalOpen={terminalOpen}
            setTerminalOpen={setTerminalOpen}
            onReturnToDashboard={() => void returnToDashboard()}
            onAddRoot={() => void handleAddRoot()}
            voiceSession={voiceSession}
            onOpenSettings={openSettings}
            editorDiskRefreshRequest={editorDiskRefreshRequest}
            onDiskFilesChanged={handleDiskFilesChanged}
            workspaceFsEpoch={workspaceFsEpoch}
            workspaceFsChange={workspaceFsChange}
            onWorkspaceFsMutation={handleWorkspaceFsMutation}
            workspaceFsMutationRequest={workspaceFsMutationRequest}
            onEditProjectName={() =>
              project && setNameDialog({ manifest: project, draft: project.name.trim(), flow: 'rename' })
            }
            voiceThreadSummaryRef={voiceThreadSummaryRef}
            onRegisterVoiceHandoff={registerVoiceHandoff}
            onStopVoiceForHandoff={() => voiceSession.stop()}
            onVoiceContinueInAgentChat={handleVoiceContinueInAgentChat}
          />
          <ProjectNameDialog
            open={nameDialog !== null}
            flow={nameDialog?.flow ?? 'rename'}
            draft={nameDialog?.draft ?? ''}
            saving={nameDialogSaving}
            onDraftChange={(draft) => setNameDialog((prev) => (prev ? { ...prev, draft } : prev))}
            onCancel={() => setNameDialog(null)}
            onSave={() => void saveProjectName()}
          />
        </>
      )}
      {switchGuardAlert}
    </AgentChatActivityProvider>
  )
}
