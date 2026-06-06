import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { DirectoryEntry } from '@/types'
import type { WorkspaceFsMutateRequest } from '../../../../shared/workspace/fs-mutation-contract'
import { basenamePath, dirnamePath, joinPathDirAndName, relativePathFromWorkspaceRoot } from '@/lib/workspace-paths'
import { isSameOrDescendantPath } from '@/lib/workspace-fs-mutation-state'
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu'
import { FileTreeContextMenu } from './FileTreeContextMenu'
import { FileTreeDeleteDialog } from './FileTreeDeleteDialog'
import { FileTreeNameDialog } from './FileTreeNameDialog'
import { FileTreeRow } from './FileTreeRow'
import type { DeleteTarget, FileTreeProps, MenuTarget, NameModalState } from './file-tree-types'
import { useFileTreeState } from './useFileTreeState'

export type { FileTreeAddPathToChatPayload } from './file-tree-types'

function resolveMenuTarget(target: EventTarget | null, rootPath: string): MenuTarget {
  // Temporary bridge while row-owned context menus remain backlog work; kept localized instead of spread across rows.
  const el = target as HTMLElement | null
  if (!el?.closest) return { path: rootPath, isDirectory: true }
  const row = el.closest('[data-file-tree-row]')
  if (row) {
    const path = row.getAttribute('data-path')
    const isDirectory = row.getAttribute('data-dir') === '1'
    if (path) return { path, isDirectory }
  }
  const empty = el.closest('[data-file-tree-folder-empty]')
  const emptyPath = empty?.getAttribute('data-path')
  if (emptyPath) return { path: emptyPath, isDirectory: true }
  return { path: rootPath, isDirectory: true }
}

export function FileTree({
  rootPath,
  onFileOpen,
  activeFile = null,
  openFiles = [],
  dirtyFiles = {},
  workspaceFsEpoch = 0,
  onWorkspaceFsMutation,
  onAddPathToChat,
  isPathPinnedForAgent,
  onTogglePinForAgent,
}: FileTreeProps) {
  const treeContainerRef = useRef<HTMLDivElement | null>(null)
  const [menuTarget, setMenuTarget] = useState<MenuTarget>({ path: rootPath, isDirectory: true })
  const [nameModal, setNameModal] = useState<NameModalState | null>(null)
  const [nameDraft, setNameDraft] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const openFileSet = useMemo(() => new Set(openFiles), [openFiles])
  const {
    expanded,
    childrenByPath,
    loading,
    errors,
    refreshDirectories,
    toggleDir,
    expandDir,
  } = useFileTreeState(rootPath, workspaceFsEpoch)

  useEffect(() => {
    if (!nameModal) {
      setNameDraft('')
      return
    }
    setNameDraft(nameModal.kind === 'rename' ? basenamePath(nameModal.path) : '')
  }, [nameModal])

  const notifyFsChange = useCallback((event: Parameters<NonNullable<FileTreeProps['onWorkspaceFsMutation']>>[0], paths: string[]) => {
    if (paths.length) onWorkspaceFsMutation?.(event, paths)
  }, [onWorkspaceFsMutation])

  const mutate = useCallback(async (payload: WorkspaceFsMutateRequest) => {
    const api = window.electron?.workspaceFsMutate
    if (!api) {
      toast.error('File operations require the GrokForge desktop app.')
      return false
    }
    const res = await api(payload)
    if (res.ok) return true
    toast.error(res.error)
    return false
  }, [])

  const parentDirForCreate = (target: MenuTarget) =>
    target.isDirectory ? target.path : dirnamePath(target.path)

  const handleCopyPath = async (target: MenuTarget) => {
    const api = window.electron?.writeClipboardText
    if (!api) {
      toast.error('Clipboard requires the GrokForge desktop app.')
      return
    }
    const res = await api(target.path)
    if (res.ok) {
      toast.success('Path copied')
    } else {
      toast.error(res.error || 'Could not copy to clipboard')
    }
  }

  const handleCopyRelativePath = async (target: MenuTarget) => {
    const api = window.electron?.writeClipboardText
    if (!api) {
      toast.error('Clipboard requires the GrokForge desktop app.')
      return
    }
    const res = await api(relativePathFromWorkspaceRoot(rootPath, target.path))
    if (res.ok) {
      toast.success('Relative path copied')
    } else {
      toast.error(res.error || 'Could not copy to clipboard')
    }
  }

  const submitNameModal = async () => {
    if (!nameModal) return
    const name = nameDraft.trim()
    if (!name) {
      toast.error('Enter a name')
      return
    }
    if (nameModal.kind === 'rename') {
      const ok = await mutate({ op: 'rename', path: nameModal.path, newName: name })
      if (!ok) return
      const newPath = joinPathDirAndName(nameModal.parentDir, name)
      setNameModal(null)
      notifyFsChange(
        { op: 'rename', oldPath: nameModal.path, newPath, isDirectory: nameModal.isDirectory },
        [nameModal.path, newPath, nameModal.parentDir],
      )
      if (nameModal.isDirectory && expanded[nameModal.path]) expandDir(newPath)
      await refreshDirectories([nameModal.path, newPath, nameModal.parentDir])
      return
    }

    const parentDir = nameModal.parentDir
    const op = nameModal.kind === 'folder' ? 'mkdir' : 'touch'
    const ok = await mutate({ op, parentDir, name })
    if (!ok) return
    const created = joinPathDirAndName(parentDir, name)
    setNameModal(null)
    notifyFsChange({ op: 'create', path: created, isDirectory: nameModal.kind === 'folder', parentDir }, [created, parentDir])
    expandDir(parentDir)
    await refreshDirectories([created, parentDir])
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    const ok = await mutate({ op: 'remove', path: deleteTarget.path })
    if (!ok) return
    setDeleteTarget(null)
    notifyFsChange(
      { op: 'delete', path: deleteTarget.path, isDirectory: deleteTarget.isDirectory },
      [deleteTarget.path, dirnamePath(deleteTarget.path)],
    )
    await refreshDirectories([deleteTarget.path, dirnamePath(deleteTarget.path)])
  }

  const focusTreeItem = (path: string) => {
    const buttons = treeContainerRef.current?.querySelectorAll<HTMLButtonElement>('button[data-treeitem="1"]')
    const target = buttons ? Array.from(buttons).find((button) => button.dataset.path === path) : null
    target?.focus()
  }

  const moveTreeFocus = (current: HTMLButtonElement, delta: -1 | 1) => {
    const buttons = treeContainerRef.current?.querySelectorAll<HTMLButtonElement>('button[data-treeitem="1"]')
    if (!buttons) return
    const items = Array.from(buttons)
    items[items.indexOf(current) + delta]?.focus()
  }

  const handleTreeKeyDown = (event: KeyboardEvent<HTMLButtonElement>, entry: DirectoryEntry, isOpen: boolean) => {
    const button = event.currentTarget
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        moveTreeFocus(button, 1)
        break
      case 'ArrowUp':
        event.preventDefault()
        moveTreeFocus(button, -1)
        break
      case 'ArrowRight':
        if (entry.isDirectory && !isOpen) {
          event.preventDefault()
          toggleDir(entry.path)
        }
        break
      case 'ArrowLeft':
        event.preventDefault()
        if (entry.isDirectory && isOpen) toggleDir(entry.path)
        else focusTreeItem(dirnamePath(entry.path))
        break
      case 'Enter':
        event.preventDefault()
        if (entry.isDirectory) toggleDir(entry.path)
        else onFileOpen(entry.path)
        break
      case 'Escape':
        button.blur()
        break
    }
  }

  const requestDelete = (target: MenuTarget) => {
    const dirtyOpenCount = openFiles.filter(
      (path) =>
        dirtyFiles[path] &&
        (target.isDirectory ? isSameOrDescendantPath(path, target.path) : path === target.path),
    ).length
    setDeleteTarget({
      path: target.path,
      label: basenamePath(target.path),
      isDirectory: target.isDirectory,
      dirtyOpenCount,
    })
  }

  const rootLoading = loading[rootPath]
  const rootErr = errors[rootPath]
  const rootKids = childrenByPath[rootPath]

  if (!window.electron?.readDirectory) {
    return <div className="px-3 py-2 text-xs text-zinc-500">Directory listing requires the GrokForge desktop app.</div>
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            ref={treeContainerRef}
            role="tree"
            aria-label="Workspace file tree"
            className="min-w-0 py-1 text-sm text-zinc-300"
            onContextMenu={(event) => setMenuTarget(resolveMenuTarget(event.target, rootPath))}
          >
            {rootLoading && !rootKids && (
              <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-zinc-500">
                <Loader2 size={14} className="animate-spin" />
                Loading files...
              </div>
            )}
            {rootErr && !rootKids && <div className="rounded-lg px-3 py-2 text-xs text-red-400/90">{rootErr}</div>}
            {rootKids && rootKids.length === 0 && !rootLoading && (
              <div className="rounded-lg px-3 py-2 text-xs text-zinc-500" data-file-tree-folder-empty data-path={rootPath}>
                Empty folder
              </div>
            )}
            {rootKids?.map((entry) => (
              <FileTreeRow
                key={entry.path}
                entry={entry}
                depth={0}
                expanded={expanded}
                childrenByPath={childrenByPath}
                loading={loading}
                errors={errors}
                activeFile={activeFile}
                openFileSet={openFileSet}
                onFileOpen={onFileOpen}
                onToggleDir={toggleDir}
                onKeyDown={handleTreeKeyDown}
              />
            ))}
          </div>
        </ContextMenuTrigger>
        <FileTreeContextMenu
          target={menuTarget}
          parentDir={parentDirForCreate(menuTarget)}
          canAddToChat={Boolean(onAddPathToChat)}
          canPinForAgent={Boolean(onTogglePinForAgent)}
          isPinnedForAgent={Boolean(isPathPinnedForAgent?.(menuTarget.path))}
          onAddToChat={(target) => onAddPathToChat?.({ path: target.path, isDirectory: target.isDirectory, rootPath })}
          onTogglePinForAgent={(target) => onTogglePinForAgent?.(target.path, target.isDirectory)}
          onReveal={(target) => void mutate({ op: 'reveal', path: target.path })}
          onCopyPath={(target) => void handleCopyPath(target)}
          onCopyRelativePath={(target) => void handleCopyRelativePath(target)}
          onOpenNameModal={setNameModal}
          onDeleteRequest={requestDelete}
        />
      </ContextMenu>

      <FileTreeNameDialog
        modal={nameModal}
        draft={nameDraft}
        onDraftChange={setNameDraft}
        onClose={() => setNameModal(null)}
        onSubmit={() => void submitNameModal()}
      />
      <FileTreeDeleteDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </>
  )
}
