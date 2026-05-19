import { Pin } from 'lucide-react'
import { ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from '@/components/ui/context-menu'
import type { MenuTarget, NameModalState } from './file-tree-types'

function revealLabel(platform: NodeJS.Platform): string {
  if (platform === 'darwin') return 'Reveal in Finder'
  if (platform === 'win32') return 'Reveal in File Explorer'
  return 'Show in file manager'
}

interface FileTreeContextMenuProps {
  target: MenuTarget
  parentDir: string
  canAddToChat: boolean
  canPinForAgent: boolean
  isPinnedForAgent: boolean
  onAddToChat: (target: MenuTarget) => void
  onTogglePinForAgent: (target: MenuTarget) => void
  onReveal: (target: MenuTarget) => void
  onCopyPath: (target: MenuTarget) => void
  onCopyRelativePath: (target: MenuTarget) => void
  onOpenNameModal: (state: NameModalState) => void
  onDeleteRequest: (target: MenuTarget) => void
}

export function FileTreeContextMenu({
  target,
  parentDir,
  canAddToChat,
  canPinForAgent,
  isPinnedForAgent,
  onAddToChat,
  onTogglePinForAgent,
  onReveal,
  onCopyPath,
  onCopyRelativePath,
  onOpenNameModal,
  onDeleteRequest,
}: FileTreeContextMenuProps) {
  const platform = window.electron?.platform ?? 'linux'

  return (
    <ContextMenuContent className="w-56">
      {canAddToChat ? (
        <>
          <ContextMenuItem onSelect={() => onAddToChat(target)}>Add to chat</ContextMenuItem>
          <ContextMenuSeparator />
        </>
      ) : null}
      {canPinForAgent ? (
        <>
          <ContextMenuItem onSelect={() => onTogglePinForAgent(target)} className="gap-2">
            <Pin size={14} className="text-gf-accent" aria-hidden />
            {isPinnedForAgent ? 'Unpin for agent' : 'Pin for agent'}
          </ContextMenuItem>
          <ContextMenuSeparator />
        </>
      ) : null}
      <ContextMenuItem onSelect={() => onReveal(target)}>{revealLabel(platform)}</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={() => onOpenNameModal({ kind: 'file', parentDir })}>New File</ContextMenuItem>
      <ContextMenuItem onSelect={() => onOpenNameModal({ kind: 'folder', parentDir })}>New Folder</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={() => onCopyPath(target)}>Copy Path</ContextMenuItem>
      <ContextMenuItem onSelect={() => onCopyRelativePath(target)}>Copy Relative Path</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        onSelect={() => onOpenNameModal({
          kind: 'rename',
          path: target.path,
          parentDir,
          isDirectory: target.isDirectory,
        })}
      >
        Rename
      </ContextMenuItem>
      <ContextMenuItem
        className="text-red-400 focus:bg-red-950/50 focus:text-red-200"
        onSelect={() => onDeleteRequest(target)}
      >
        Move to Trash
      </ContextMenuItem>
    </ContextMenuContent>
  )
}
