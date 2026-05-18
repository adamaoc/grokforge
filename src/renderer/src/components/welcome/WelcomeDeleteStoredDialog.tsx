import type { RecentProjectEntry } from '@/types'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export function WelcomeDeleteStoredDialog({
  open,
  saving,
  pendingEntry,
  onOpenChange,
  onConfirm,
  onCancel,
}: {
  open: boolean
  saving: boolean
  pendingEntry: RecentProjectEntry | undefined
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="border-zinc-800 bg-zinc-950 sm:rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">Delete GrokForge project data?</AlertDialogTitle>
          <AlertDialogDescription className="text-zinc-400">
            {pendingEntry ? (
              <>
                <span className="font-medium text-zinc-300">{pendingEntry.displayName}</span> will be removed from
                GrokForge. Workspace configuration and chat history stored by the app will be deleted. Folders you added
                as workspace roots are not deleted from disk.
              </>
            ) : (
              'Workspace configuration and chat history stored by the app will be deleted. Workspace folders on disk are not deleted.'
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:space-x-0">
          <AlertDialogCancel asChild>
            <Button
              type="button"
              variant="outline"
              className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-900"
              disabled={saving}
              onClick={onCancel}
            >
              Cancel
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              type="button"
              variant="destructive"
              disabled={saving}
              aria-label="Confirm delete GrokForge project data (cannot be undone from this screen)"
              onClick={(e) => {
                e.preventDefault()
                void onConfirm()
              }}
            >
              {saving ? 'Deleting…' : 'Delete project data'}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
