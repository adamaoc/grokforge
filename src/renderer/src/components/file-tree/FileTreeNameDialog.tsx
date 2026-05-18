import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { NameModalState } from './file-tree-types'

interface FileTreeNameDialogProps {
  modal: NameModalState | null
  draft: string
  onDraftChange: (value: string) => void
  onClose: () => void
  onSubmit: () => void
}

export function FileTreeNameDialog({
  modal,
  draft,
  onDraftChange,
  onClose,
  onSubmit,
}: FileTreeNameDialogProps) {
  const title =
    modal?.kind === 'file'
      ? 'New file'
      : modal?.kind === 'folder'
        ? 'New folder'
        : modal
          ? 'Rename'
          : ''

  return (
    <Dialog open={modal !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="border-zinc-800 bg-zinc-950 text-white sm:max-w-md sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-white">{title}</DialogTitle>
          <DialogDescription className="text-zinc-400">
            {modal?.kind === 'rename'
              ? 'Enter a new name for this item.'
              : 'Enter a file or folder name (single segment, no slashes).'}
          </DialogDescription>
        </DialogHeader>
        <Input
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            onSubmit()
          }}
          placeholder="name"
          className="rounded-xl border-zinc-700 bg-zinc-900"
          autoFocus
        />
        <DialogFooter className="gap-2 sm:space-x-0">
          <Button type="button" variant="outline" className="rounded-xl border-zinc-700" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" className="rounded-xl" onClick={onSubmit}>
            {modal?.kind === 'rename' ? 'Rename' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
