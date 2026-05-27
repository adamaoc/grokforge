import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import Editor, { type OnMount } from '@monaco-editor/react'
import type { editor as MonacoEditor } from 'monaco-editor'
import { Save, PanelRightClose } from 'lucide-react'
import { toast } from 'sonner'
import type {
  AgentChatEditorSelection,
  DiffSession,
  GrokProjectManifest,
  Root,
  WorkspaceFsMutationEvent,
} from '@/types'
import { getLanguageFromPath } from '@/lib/getLanguageFromPath'
import { normalizeFsPath } from '@/lib/workspace-path-check'
import { isSameOrDescendantPath, remapRecordForRename } from '@/lib/workspace-fs-mutation-state'
import { EditorEmptyState } from '@/components/EditorEmptyState'
import { EditorTabBar } from '@/components/EditorTabBar'
import { GroupedDiffView } from '@/components/GroupedDiffView'
import { AgentEditSafetyBanner } from '@/components/AgentEditSafetyBanner'
import { AgentProposalTraceSnippet } from '@/components/AgentProposalTraceSnippet'
import { DiffViewErrorBoundary } from '@/components/DiffViewErrorBoundary'
import type { AgentEditSafetyResult } from '../../../shared/agent-edit-safety-warnings'
import { formatDiffSessionSummary, summarizeDiffSessionStats } from '../../../shared/diff-line-stats'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

function EditorPaneCollapseStrip({ onCollapse }: { onCollapse: () => void }) {
  return (
    <div className="flex shrink-0 items-stretch border-b border-l border-zinc-800 bg-zinc-950">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-auto min-h-[3.25rem] w-10 shrink-0 rounded-none text-zinc-400 hover:bg-zinc-900 hover:text-white"
            aria-label="Collapse editor pane"
            onClick={onCollapse}
          >
            <PanelRightClose className="h-4 w-4" aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          Hide editor pane
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

interface EditorPaneProps {
  openFiles: string[]
  activeFile: string | null
  onActiveFileChange: (path: string | null) => void
  onCloseFile: (path: string) => void
  onUnsavedChange?: (hasUnsaved: boolean) => void
  project: GrokProjectManifest
  activeRoot: Root | null
  /** In-memory diff session; when open, file tabs are hidden until closed. */
  diffSession?: DiffSession | null
  diffSessionActions?: {
    primaryLabel: string
    onPrimary: () => void
    secondaryLabel?: string
    onSecondary?: () => void
    regenerateLabel?: string
    onRegenerate?: () => void
    fixFailedEditLabel?: string
    onFixFailedEdit?: () => void
    primaryDisabled?: boolean
  } | null
  onCloseDiffSession?: () => void
  /** When set for the active file, editor scrolls to line and clears via callback (story 016). */
  jumpToLineRequest?: { path: string; line: number } | null
  onJumpToLineHandled?: () => void
  /** When nonce changes, reload matching open tabs from disk (agent writes / undo). */
  diskRefreshRequest?: { nonce: number; paths: string[] } | null
  /** When file-tree mutations rename/delete paths, preserve or discard editor-local buffers coherently. */
  mutationRequest?: { nonce: number; event: WorkspaceFsMutationEvent } | null
  /** Called after a successful save so shell-level status badges can refresh. */
  onFileSaved?: (paths: string[]) => void
  /** Reports per-tab dirty state so the agent can distinguish saved vs unsaved active context. */
  onDirtyFilesChange?: (dirtyByPath: Record<string, boolean>) => void
  onEditorSelectionChange?: (selection: AgentChatEditorSelection | null) => void
  selectionMaxChars?: number
  onOpenSearch?: () => void
  onAskAgent?: () => void
  /** Collapse the editor ResizablePanel (same affordance as sidebar `PanelLeftClose`). */
  onCollapseEditorPane?: () => void
  /** Conversation-linked strip above Monaco / diff (story 143). */
  contextCompanion?: ReactNode
  contextCompanionHighlight?: boolean
  agentEmptyHint?: string | null
}

export function EditorPane({
  openFiles,
  activeFile,
  onActiveFileChange,
  onCloseFile,
  onUnsavedChange,
  project,
  activeRoot,
  diffSession,
  diffSessionActions,
  onCloseDiffSession,
  jumpToLineRequest,
  onJumpToLineHandled,
  diskRefreshRequest,
  mutationRequest,
  onFileSaved,
  onDirtyFilesChange,
  onEditorSelectionChange,
  selectionMaxChars = 4_000,
  onOpenSearch,
  onAskAgent,
  onCollapseEditorPane,
  contextCompanion,
  contextCompanionHighlight = false,
  agentEmptyHint,
}: EditorPaneProps) {
  const editorShellClass = cn(
    'flex min-h-0 flex-1 flex-col bg-zinc-950',
    contextCompanionHighlight && 'ring-1 ring-inset ring-primary/25',
  )
  const [fileContents, setFileContents] = useState<Record<string, string>>({})
  const [isDirty, setIsDirty] = useState<Record<string, boolean>>({})
  const [pendingClosePath, setPendingClosePath] = useState<string | null>(null)
  const activeFileRef = useRef(activeFile)
  const fileContentsRef = useRef(fileContents)
  const isDirtyRef = useRef(isDirty)
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const selectionDisposeRef = useRef<{ dispose: () => void } | null>(null)

  activeFileRef.current = activeFile
  fileContentsRef.current = fileContents
  isDirtyRef.current = isDirty

  const revealLine = useCallback((editor: MonacoEditor.IStandaloneCodeEditor, line: number) => {
    const lineNumber = Math.max(1, Math.floor(line) || 1)
    editor.revealLineInCenter(lineNumber)
    editor.setPosition({ lineNumber, column: 1 })
    editor.focus()
  }, [])

  const reportEditorSelection = useCallback(
    (editor: MonacoEditor.IStandaloneCodeEditor | null) => {
      const path = activeFileRef.current
      if (!editor || !path) {
        onEditorSelectionChange?.(null)
        return
      }
      const selection = editor.getSelection()
      const model = editor.getModel()
      if (!selection || !model || selection.isEmpty()) {
        onEditorSelectionChange?.(null)
        return
      }
      const text = model.getValueInRange(selection)
      if (!text.trim()) {
        onEditorSelectionChange?.(null)
        return
      }
      const capped = text.length > selectionMaxChars ? text.slice(0, selectionMaxChars) : text
      onEditorSelectionChange?.({
        path,
        startLine: Math.min(selection.startLineNumber, selection.endLineNumber),
        endLine: Math.max(selection.startLineNumber, selection.endLineNumber),
        text: capped,
        truncated: text.length > selectionMaxChars,
      })
    },
    [onEditorSelectionChange, selectionMaxChars],
  )

  const handleEditorMount: OnMount = useCallback(
    (editor) => {
      editorRef.current = editor
      selectionDisposeRef.current?.dispose()
      selectionDisposeRef.current = editor.onDidChangeCursorSelection(() => reportEditorSelection(editor))
      reportEditorSelection(editor)
    },
    [reportEditorSelection],
  )

  useEffect(() => {
    const req = jumpToLineRequest
    if (!req || activeFile !== req.path) return
    let cancelled = false
    let attempts = 0
    const tick = () => {
      if (cancelled) return
      const editor = editorRef.current
      if (editor) {
        revealLine(editor, req.line)
        onJumpToLineHandled?.()
        return
      }
      attempts += 1
      if (attempts < 40) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    return () => {
      cancelled = true
    }
  }, [activeFile, jumpToLineRequest, onJumpToLineHandled, revealLine])

  useEffect(() => {
    if (openFiles.length === 0) {
      editorRef.current = null
      selectionDisposeRef.current?.dispose()
      selectionDisposeRef.current = null
      onEditorSelectionChange?.(null)
    }
  }, [onEditorSelectionChange, openFiles.length])

  useEffect(() => {
    if (!diffSession) return
    onEditorSelectionChange?.(null)
  }, [diffSession, onEditorSelectionChange])

  useEffect(() => {
    onEditorSelectionChange?.(null)
    const id = requestAnimationFrame(() => reportEditorSelection(editorRef.current))
    return () => cancelAnimationFrame(id)
  }, [activeFile, onEditorSelectionChange, reportEditorSelection])

  useEffect(() => {
    return () => {
      selectionDisposeRef.current?.dispose()
      onEditorSelectionChange?.(null)
    }
  }, [onEditorSelectionChange])

  const saveFileAtPath = useCallback(
    async (path: string | null) => {
      if (!path || !window.electron?.writeFile) return false
      if (!isDirtyRef.current[path]) return true
      const content = fileContentsRef.current[path] ?? ''
      const success = await window.electron.writeFile(path, content)
      if (success) {
        setIsDirty((prev) => ({ ...prev, [path]: false }))
        onFileSaved?.([path])
        return true
      }
      toast.error('Could not save file. Check permissions and try again.')
      return false
    },
    [onFileSaved],
  )

  const saveActiveFile = useCallback(async () => {
    const path = activeFileRef.current
    if (!path) return
    await saveFileAtPath(path)
  }, [saveFileAtPath])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      if (event.key !== 's' && event.key !== 'S') return
      if (!activeFileRef.current) return
      event.preventDefault()
      void saveActiveFile()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [saveActiveFile])

  useEffect(() => {
    const event = mutationRequest?.event
    if (!event) return
    if (event.op === 'rename') {
      setFileContents((prev) => remapRecordForRename(prev, event))
      setIsDirty((prev) => remapRecordForRename(prev, event))
      return
    }
    if (event.op !== 'delete') return
    const shouldRemove = (path: string) =>
      event.isDirectory
        ? isSameOrDescendantPath(path, event.path)
        : normalizeFsPath(path) === normalizeFsPath(event.path)
    setFileContents((prev) => Object.fromEntries(Object.entries(prev).filter(([path]) => !shouldRemove(path))))
    setIsDirty((prev) => Object.fromEntries(Object.entries(prev).filter(([path]) => !shouldRemove(path))))
  }, [mutationRequest?.event, mutationRequest?.nonce])

  useEffect(() => {
    const hasUnsaved = openFiles.some((file) => isDirty[file])
    onUnsavedChange?.(hasUnsaved)
    onDirtyFilesChange?.(Object.fromEntries(openFiles.map((file) => [file, Boolean(isDirty[file])])))
  }, [isDirty, onDirtyFilesChange, onUnsavedChange, openFiles])

  useEffect(() => {
    const keep = new Set(openFiles)
    setFileContents((prev) => {
      let changed = false
      const next = { ...prev }
      for (const path of Object.keys(next)) {
        if (!keep.has(path)) {
          delete next[path]
          changed = true
        }
      }
      return changed ? next : prev
    })
    setIsDirty((prev) => {
      let changed = false
      const next = { ...prev }
      for (const path of Object.keys(next)) {
        if (!keep.has(path)) {
          delete next[path]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [openFiles])

  useEffect(() => {
    if (!activeFile || !window.electron?.readFile) return
    let cancelled = false
    void window.electron.readFile(activeFile).then((content) => {
      if (cancelled || content === null) return
      setFileContents((prev) => {
        if (activeFile in prev) return prev
        return { ...prev, [activeFile]: content }
      })
      setIsDirty((prev) => {
        if (prev[activeFile]) return prev
        return { ...prev, [activeFile]: false }
      })
    })
    return () => {
      cancelled = true
    }
  }, [activeFile])

  useEffect(() => {
    const req = diskRefreshRequest
    if (!req?.paths.length) return
    const readFile = window.electron?.readFile
    if (!readFile) return
    const want = new Set(req.paths.map((path) => normalizeFsPath(path)))
    void (async () => {
      for (const path of openFiles) {
        if (!want.has(normalizeFsPath(path))) continue
        const content = await readFile(path)
        if (content === null) continue
        setFileContents((prev) => ({ ...prev, [path]: content }))
        setIsDirty((prev) => ({ ...prev, [path]: false }))
      }
    })()
  }, [diskRefreshRequest, openFiles])

  const handleEditorChange = (value: string | undefined) => {
    if (!activeFile || value === undefined) return
    setFileContents((prev) => ({ ...prev, [activeFile]: value }))
    setIsDirty((prev) => ({ ...prev, [activeFile]: true }))
  }

  const finishClose = (path: string) => {
    setPendingClosePath(null)
    onCloseFile(path)
  }

  const handleTabCloseClick = (path: string) => {
    if (isDirty[path]) {
      setPendingClosePath(path)
      return
    }
    onCloseFile(path)
  }

  const pendingFileName = pendingClosePath ? pendingClosePath.split('/').pop() || pendingClosePath : ''

  const agentProposalSafety: AgentEditSafetyResult[] =
    diffSession?.source === 'agent-proposal'
      ? diffSession.files
          .map((f) => f.editSafety)
          .filter((item): item is AgentEditSafetyResult => item != null)
      : []

  const diffSessionStatsLine = diffSession
    ? formatDiffSessionSummary(diffSession.files.length, summarizeDiffSessionStats(diffSession.files))
    : null

  if (diffSession) {
    return (
      <div className={editorShellClass}>
        {contextCompanion}
        <div className="gf-no-drag flex shrink-0 flex-col gap-2 border-b border-zinc-800 bg-zinc-950 px-4 py-2.5">
          <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">{diffSession.title}</div>
            <div className="truncate text-xs text-zinc-500">
              {diffSession.description ?? diffSessionStatsLine ?? `${diffSession.files.length} files`}
              <span className="text-zinc-600"> · {diffSession.source}</span>
            </div>
            {diffSession.warnings?.length ? (
              <div className="mt-1 truncate text-[11px] text-amber-300">
                {diffSession.warnings.length} skipped or capped item{diffSession.warnings.length === 1 ? '' : 's'}
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {onCollapseEditorPane ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white"
                    aria-label="Collapse editor pane"
                    onClick={onCollapseEditorPane}
                  >
                    <PanelRightClose className="h-4 w-4" aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Hide editor pane
                </TooltipContent>
              </Tooltip>
            ) : null}
            {diffSessionActions?.onFixFailedEdit && diffSessionActions.fixFailedEditLabel ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-lg border-amber-800/80 bg-zinc-900 text-xs text-amber-100/90 hover:bg-zinc-800"
                onClick={diffSessionActions.onFixFailedEdit}
              >
                {diffSessionActions.fixFailedEditLabel}
              </Button>
            ) : null}
            {diffSessionActions?.onRegenerate && diffSessionActions.regenerateLabel ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-lg border-zinc-700 bg-zinc-900 text-xs hover:bg-zinc-800"
                onClick={diffSessionActions.onRegenerate}
              >
                {diffSessionActions.regenerateLabel}
              </Button>
            ) : null}
            {diffSessionActions?.secondaryLabel && diffSessionActions.onSecondary ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-lg border-zinc-700 bg-zinc-900 text-xs hover:bg-zinc-800"
                onClick={diffSessionActions.onSecondary}
              >
                {diffSessionActions.secondaryLabel}
              </Button>
            ) : null}
            {diffSessionActions ? (
              <Button
                type="button"
                size="sm"
                className="h-8 rounded-lg text-xs"
                disabled={diffSessionActions.primaryDisabled}
                onClick={diffSessionActions.onPrimary}
              >
                {diffSessionActions.primaryLabel}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-lg border-zinc-700 bg-zinc-900 text-xs hover:bg-zinc-800"
              onClick={onCloseDiffSession}
            >
              Close
            </Button>
          </div>
          </div>
          {agentProposalSafety.length > 0 ? (
            <AgentEditSafetyBanner assessments={agentProposalSafety} />
          ) : null}
          {diffSession.source === 'agent-proposal' ? <AgentProposalTraceSnippet /> : null}
        </div>
        <div className="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-1">
          <DiffViewErrorBoundary onClose={onCloseDiffSession}>
            <GroupedDiffView session={diffSession} project={project} />
          </DiffViewErrorBoundary>
        </div>
      </div>
    )
  }

  if (openFiles.length === 0) {
    return (
      <div className={editorShellClass}>
        {contextCompanion}
        <EditorEmptyState
          project={project}
          activeRoot={activeRoot}
          onOpenSearch={onOpenSearch}
          onAskAgent={onAskAgent}
          onCollapseEditorPane={onCollapseEditorPane}
          agentContextHint={agentEmptyHint}
        />
      </div>
    )
  }

  return (
    <div className={editorShellClass}>
      {contextCompanion}
      <div className="gf-no-drag flex min-h-0 shrink-0 items-stretch">
        <div className="min-w-0 flex-1 overflow-hidden">
          <EditorTabBar
            openFiles={openFiles}
            activeFile={activeFile}
            isDirty={isDirty}
            onSelectFile={onActiveFileChange}
            onCloseTab={handleTabCloseClick}
          />
        </div>
        {onCollapseEditorPane ? <EditorPaneCollapseStrip onCollapse={onCollapseEditorPane} /> : null}
      </div>
      <div className="relative min-h-0 flex-1">
        {activeFile ? (
          <>
            <Editor
              height="100%"
              language={getLanguageFromPath(activeFile)}
              value={fileContents[activeFile] ?? ''}
              onChange={handleEditorChange}
              onMount={handleEditorMount}
              theme="vs-dark"
              options={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 14,
                lineHeight: 1.6,
                minimap: { enabled: true },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                wordWrap: 'on',
                padding: { top: 16, bottom: 16 },
              }}
            />
            {isDirty[activeFile] ? (
              <div className="pointer-events-none absolute right-4 top-4 flex items-center gap-2">
                <div className="pointer-events-auto">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void saveActiveFile()}
                    title="Save (Ctrl/Cmd+S)"
                    className="h-8 rounded-full border-zinc-700 bg-zinc-900 text-xs hover:bg-zinc-800"
                  >
                    <Save size={14} /> Save
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
      <AlertDialog open={pendingClosePath !== null} onOpenChange={(open) => !open && setPendingClosePath(null)}>
        <AlertDialogContent className="border-zinc-800 bg-zinc-950 sm:rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Save changes?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              {pendingFileName ? (
                <>
                  <span className="font-medium text-zinc-300">{pendingFileName}</span> has unsaved changes. Save
                  before closing, or discard them.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:space-x-0">
            <Button type="button" variant="outline" onClick={() => setPendingClosePath(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (pendingClosePath) finishClose(pendingClosePath)
              }}
            >
              Don't save
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!pendingClosePath) return
                void (async () => {
                  const ok = await saveFileAtPath(pendingClosePath)
                  if (ok) finishClose(pendingClosePath)
                })()
              }}
            >
              Save
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
