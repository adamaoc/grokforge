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

export function WelcomeRemoveFromListDialog({
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
          <AlertDialogTitle className="text-white">Remove from recent projects?</AlertDialogTitle>
          <AlertDialogDescription className="text-zinc-400">
            {pendingEntry ? (
              <>
                <span className="font-medium text-zinc-300">{pendingEntry.displayName}</span> will disappear from this
                welcome screen. GrokForge app data for this project (chat, settings stored by the app) is{' '}
                <span className="text-zinc-300">not</span> deleted. Your workspace folders on disk are unchanged. You
                can add the project again later with Open Project.
              </>
            ) : (
              'This row will be removed from the welcome list only. App-side project data is kept.'
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
              disabled={saving}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              aria-label="Confirm remove from recent projects list"
              onClick={(e) => {
                e.preventDefault()
                void onConfirm()
              }}
            >
              {saving ? 'Removing…' : 'Remove from list'}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
