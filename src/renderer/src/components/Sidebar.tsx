import { useCallback, useEffect, useRef, useState } from 'react'
import { FolderOpen, Loader2, GitBranch, PanelLeft, PanelLeftClose, Plus, RefreshCw, Settings, FileDiff } from 'lucide-react'
import { toast } from 'sonner'
import type { AgentChatAttachment, DiffSession, GitStatusSummary, GrokProjectManifest, Root, WorkspaceFsMutationEvent } from '@/types'
import { RootTypeDot } from '@/components/grokforge/RootTypeDot'
import { FileTree } from '@/components/FileTree'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

function isPathUnder(path: string, maybeParent: string): boolean {
  const p = path.replace(/\\/g, '/')
  const parent = maybeParent.replace(/\\/g, '/').replace(/\/+$/, '')
  return p === parent || p.startsWith(`${parent}/`)
}

function expandedRootsForProject(roots: Root[]): Record<string, boolean> {
  return Object.fromEntries(roots.map((root) => [root.id, true]))
}

function formatRefreshTime(timestamp: number | undefined): string {
  if (!timestamp) return 'not refreshed yet'
  return new Date(timestamp).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  })
}

function gitStatusTooltip(status: GitStatusSummary | undefined, refreshedAt: number | undefined): string {
  const suffix = `Last refreshed: ${formatRefreshTime(refreshedAt)}`
  if (!status) {
    return `Git status…\n${suffix}`
  }
  if (status.ok) {
    const repoLines = status.repositories.map((repo) => {
      const changeText = repo.isClean
        ? 'clean'
        : `${repo.dirtyCount} uncommitted change${repo.dirtyCount === 1 ? '' : 's'}`
      return `${repo.repoRelativePath} · ${repo.branch} · ${changeText}`
    })
    return [
      status.repoCount === 1 ? 'Git repository' : `${status.repoCount} nested git repositories`,
      ...repoLines,
      suffix,
    ].join('\n')
  }
  let error: string
  switch (status.code) {
    case 'not_a_repo':
      error = 'Not a git repository'
      break
    case 'git_unavailable':
      error = status.message ?? 'Git is not available'
      break
    case 'git_error':
      error = status.message ?? 'Could not read git status'
      break
    default:
      error = status.message ?? 'Git status unavailable'
  }
  return `${error}\n${suffix}`
}

interface SidebarProps {
  project: GrokProjectManifest
  activeRoot: Root | null
  activeFile: string | null
  openFiles: string[]
  dirtyFiles: Record<string, boolean>
  onRootChange: (root: Root) => void
  onFileOpen: (filePath: string) => void
  /** Sidebar bottom button — story 025: returns to the Project Dashboard (welcome screen) instead of opening the OS picker. */
  onReturnToDashboard: () => void
  /** Story 025: append a new workspace root via main-process folder picker. */
  onAddRoot: () => void
  collapsed: boolean
  onToggleSidebar: () => void
  onOpenSettings: () => void
  /** Increments when workspace files change on disk (e.g. agent writes); refreshes file tree listings. */
  workspaceFsEpoch: number
  /** Latest app-driven file changes; used to refresh matching git status after writes. */
  workspaceFsChange?: { nonce: number; paths: string[] } | null
  /** File tree local mutations — reconcile editor state and refresh affected directories/status. */
  onWorkspaceFsMutation?: (event: WorkspaceFsMutationEvent, refreshPaths: string[]) => void
  onAddPathToChat?: (attachment: AgentChatAttachment) => void
  isPathPinnedForAgent?: (path: string) => boolean
  onTogglePinForAgent?: (path: string, isDirectory: boolean) => void
  onOpenDiffSession?: (session: DiffSession) => void
}

export function Sidebar({
  project,
  activeRoot,
  activeFile,
  openFiles,
  dirtyFiles,
  onRootChange,
  onFileOpen,
  onReturnToDashboard,
  onAddRoot,
  collapsed,
  onToggleSidebar,
  onOpenSettings,
  workspaceFsEpoch,
  workspaceFsChange,
  onWorkspaceFsMutation,
  onAddPathToChat,
  isPathPinnedForAgent,
  onTogglePinForAgent,
  onOpenDiffSession,
}: SidebarProps) {
  const [expandedRoots, setExpandedRoots] = useState<Record<string, boolean>>(() =>
    expandedRootsForProject(project.roots),
  )
  const [gitByRootId, setGitByRootId] = useState<Record<string, GitStatusSummary>>({})
  const [gitRefreshedAtByRootId, setGitRefreshedAtByRootId] = useState<Record<string, number>>({})
  const [gitLoadingIds, setGitLoadingIds] = useState<ReadonlySet<string>>(() => new Set())
  const gitUnavailableToastShownRef = useRef(false)

  const rootsGitKey = project.roots.map((r) => `${r.id}:${r.path}`).join('|')

  const refreshGitStatusForRoot = useCallback(async (root: Root) => {
    const api = window.electron?.gitStatus
    if (!api) return null
    setGitLoadingIds((prev) => new Set(prev).add(root.id))
    try {
      const summary = await api({ rootId: root.id })
      setGitByRootId((prev) => {
        return { ...prev, [root.id]: summary }
      })
      setGitRefreshedAtByRootId((prev) => {
        return { ...prev, [root.id]: Date.now() }
      })
      if (!summary.ok && summary.code === 'git_unavailable' && !gitUnavailableToastShownRef.current) {
        gitUnavailableToastShownRef.current = true
        toast.error('Git is not available', {
          description: 'Install Git or make sure it is on PATH to enable workspace status badges.',
        })
      }
      return summary
    } finally {
      setGitLoadingIds((prev) => {
        const next = new Set(prev)
        next.delete(root.id)
        return next
      })
    }
  }, [])

  const refreshGitStatuses = useCallback(async () => {
    await Promise.all(project.roots.map((root) => refreshGitStatusForRoot(root)))
  }, [project.roots, refreshGitStatusForRoot])

  const refreshGitStatusesForPaths = useCallback(
    async (paths: string[]) => {
      if (!paths.length) {
        await refreshGitStatuses()
        return
      }
      const roots = project.roots.filter((root) => paths.some((path) => isPathUnder(path, root.path)))
      await Promise.all(roots.map((root) => refreshGitStatusForRoot(root)))
    },
    [project.roots, refreshGitStatusForRoot, refreshGitStatuses],
  )

  const openGitDiffForRoot = useCallback(async (root: Root) => {
    const api = window.electron?.gitDiffSession
    if (!api || !onOpenDiffSession) {
      toast.error('Git diff requires the GrokForge desktop app.')
      return
    }
    const res = await api({ rootId: root.id })
    if (!res.ok) {
      toast.error(res.message ?? 'Could not load git changes')
      return
    }
    if (res.session.files.length === 0 && !res.session.warnings?.length) {
      toast.message('No git changes to review')
      return
    }
    onOpenDiffSession(res.session)
  }, [onOpenDiffSession])

  useEffect(() => {
    setExpandedRoots((prev) => {
      const next: Record<string, boolean> = {}
      let changed = false
      for (const root of project.roots) {
        if (!(root.id in prev)) changed = true
        next[root.id] = prev[root.id] ?? true
      }
      if (Object.keys(prev).length !== project.roots.length) changed = true
      return changed ? next : prev
    })
  }, [rootsGitKey, project.roots])

  useEffect(() => {
    void refreshGitStatuses()
  }, [rootsGitKey, refreshGitStatuses])

  useEffect(() => {
    if (!workspaceFsChange?.nonce) return
    void refreshGitStatusesForPaths(workspaceFsChange.paths)
  }, [workspaceFsChange, refreshGitStatusesForPaths])

  const toggleRoot = (rootId: string) => {
    setExpandedRoots(prev => ({
      ...prev,
      [rootId]: !prev[rootId]
    }))
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col border-r border-zinc-800 bg-zinc-950">
      {/* Story 022: same height as ProjectHeader — window-drag strip under traffic lights (sidebar has no header row otherwise). */}
      <div className="gf-drag-region h-14 shrink-0 border-b border-zinc-800 bg-zinc-950" aria-hidden />

      {collapsed ? (
        <div className="gf-no-drag flex min-h-0 flex-1 flex-col items-center gap-2 py-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-xl text-zinc-400 hover:bg-zinc-800/80 hover:text-white"
            aria-label="Expand sidebar"
            aria-expanded={false}
            onClick={onToggleSidebar}
          >
            <PanelLeft className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      ) : (
        <>
          {/* Story 023: flex-1 min-h-0 so the tree column scrolls; tooling row stays above scroll */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="gf-no-drag shrink-0 px-3 pb-2 pt-3">
          <div className="flex items-center justify-between gap-1 px-2">
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 rounded-lg text-zinc-400 hover:bg-zinc-800/80 hover:text-white"
                aria-label="Collapse sidebar"
                aria-expanded={true}
                onClick={onToggleSidebar}
              >
                <PanelLeftClose className="h-4 w-4" aria-hidden />
              </Button>
              <div className="min-w-0 truncate text-xs font-medium uppercase tracking-[1px] text-zinc-500">
                WORKSPACE ROOTS
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={onAddRoot}
                    className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800/80 hover:text-white"
                    aria-label="Add workspace root"
                  >
                    <Plus size={16} aria-hidden />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Add another folder as a workspace root
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-0 custom-scrollbar">
          {project.roots.map((root) => {
            const gitState = gitByRootId[root.id]
            const refreshedAt = gitRefreshedAtByRootId[root.id]
            const hasDirtyBadge = Boolean(
              gitState?.ok && !gitState.isClean && gitState.dirtyCount > 0,
            )
            const hasGitSignal = Boolean(gitState?.ok || root.git || gitLoadingIds.has(root.id))
            return (
              <div key={root.id} className="mb-1">
                <button
                  onClick={() => {
                    onRootChange(root)
                    toggleRoot(root.id)
                  }}
                  className={`group flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-all ${
                    activeRoot?.id === root.id
                      ? 'bg-zinc-800 text-white'
                      : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                  }`}
                >
                  <RootTypeDot type={root.type} size="md" />
                  <span className="flex-1 text-left truncate">{root.label}</span>
                  {hasGitSignal && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          className="flex items-center gap-1 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {gitLoadingIds.has(root.id) ? (
                            <Loader2 size={14} className="text-zinc-500 animate-spin" aria-hidden />
                          ) : (
                            <>
                              <GitBranch
                                size={14}
                                className={cn(
                                  'transition-colors',
                                  hasDirtyBadge ? 'text-amber-400/90' : 'text-zinc-500',
                                )}
                                aria-hidden
                              />
                              {hasDirtyBadge && gitState?.ok && (
                                <span className="min-w-[1.125rem] h-[1.125rem] px-1 flex items-center justify-center rounded-full bg-zinc-800 text-[10px] font-mono text-amber-400/95 leading-none">
                                  {gitState.dirtyCount > 99 ? '99+' : gitState.dirtyCount}
                                </span>
                              )}
                              {gitState?.ok && gitState.repoCount > 1 && !hasDirtyBadge && (
                                <span className="min-w-[1.125rem] h-[1.125rem] px-1 flex items-center justify-center rounded-full bg-zinc-800 text-[10px] font-mono text-zinc-400 leading-none">
                                  {gitState.repoCount}
                                </span>
                              )}
                              {hasDirtyBadge && (
                                <span
                                  role="button"
                                  tabIndex={0}
                                  className="ml-0.5 rounded-md p-0.5 text-zinc-500 opacity-0 transition-opacity hover:bg-zinc-800 hover:text-zinc-200 focus:opacity-100 group-hover:opacity-100"
                                  aria-label={`View git changes for ${root.label}`}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    void openGitDiffForRoot(root)
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key !== 'Enter' && e.key !== ' ') return
                                    e.preventDefault()
                                    e.stopPropagation()
                                    void openGitDiffForRoot(root)
                                  }}
                                >
                                  <FileDiff size={12} aria-hidden />
                                </span>
                              )}
                              <span
                                role="button"
                                tabIndex={0}
                                className="ml-0.5 rounded-md p-0.5 text-zinc-500 opacity-0 transition-opacity hover:bg-zinc-800 hover:text-zinc-200 focus:opacity-100 group-hover:opacity-100"
                                aria-label={`Refresh git status for ${root.label}`}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  void refreshGitStatusForRoot(root)
                                }}
                                onKeyDown={(e) => {
                                  if (e.key !== 'Enter' && e.key !== ' ') return
                                  e.preventDefault()
                                  e.stopPropagation()
                                  void refreshGitStatusForRoot(root)
                                }}
                              >
                                <RefreshCw size={12} aria-hidden />
                              </span>
                            </>
                          )}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-sm whitespace-pre-line font-mono text-[11px]">
                        {gitStatusTooltip(gitState, refreshedAt)}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </button>

                {expandedRoots[root.id] && (
                  <div className="ml-6 mt-1 border-l border-zinc-800 pl-3">
                    <FileTree
                      rootPath={root.path}
                      onFileOpen={onFileOpen}
                      activeFile={activeFile}
                      openFiles={openFiles}
                      dirtyFiles={dirtyFiles}
                      workspaceFsEpoch={workspaceFsEpoch}
                      onWorkspaceFsMutation={onWorkspaceFsMutation}
                      onAddPathToChat={(payload) =>
                        onAddPathToChat?.({
                          type: payload.isDirectory ? 'folder' : 'file',
                          path: payload.path,
                          source: 'workspace',
                        })
                      }
                      isPathPinnedForAgent={isPathPinnedForAgent}
                      onTogglePinForAgent={onTogglePinForAgent}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

          {/* Bottom actions — explicit no-drag so a future parent drag wrapper cannot swallow clicks */}
          <div className="gf-no-drag shrink-0 border-t border-zinc-800 p-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onReturnToDashboard}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-zinc-900 py-2.5 text-sm transition-colors hover:bg-zinc-800"
              >
                <FolderOpen size={16} aria-hidden /> Switch Project
              </button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="rounded-xl bg-zinc-900 p-2.5 text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
                    aria-label="Settings"
                  >
                    <Settings size={16} aria-hidden />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  Settings
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
