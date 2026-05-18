import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import type { DeleteTarget } from './file-tree-types'

interface FileTreeDeleteDialogProps {
  target: DeleteTarget | null
  onClose: () => void
  onConfirm: () => void
}

export function FileTreeDeleteDialog({ target, onClose, onConfirm }: FileTreeDeleteDialogProps) {
  return (
    <AlertDialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="border-zinc-800 bg-zinc-950 sm:rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">Move {target?.label ?? 'item'} to Trash?</AlertDialogTitle>
          <AlertDialogDescription className="text-zinc-400">
            {target?.dirtyOpenCount ? (
              <>
                {target.dirtyOpenCount} open {target.dirtyOpenCount === 1 ? 'file has' : 'files have'} unsaved
                changes and will be closed if you continue. The file-system item will be moved to Trash.
              </>
            ) : (
              <>The item will be moved to your operating system Trash or Recycle Bin. Folders move with their contents.</>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:space-x-0">
          <AlertDialogCancel className="rounded-xl border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-900">
            Cancel
          </AlertDialogCancel>
          <Button type="button" variant="destructive" className="rounded-xl" onClick={onConfirm}>
            Move to Trash
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
