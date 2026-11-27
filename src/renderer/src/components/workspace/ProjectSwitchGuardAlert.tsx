import type { MutableRefObject } from 'react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface ProjectSwitchGuardAlertProps {
  open: boolean
  closingViaConfirmRef: MutableRefObject<boolean>
  onStay: () => void
  onContinueWithoutSaving: () => void
}

/** Confirms leaving a project while editor tabs have unsaved changes. */
export function ProjectSwitchGuardAlert({
  open,
  closingViaConfirmRef,
  onStay,
  onContinueWithoutSaving,
}: ProjectSwitchGuardAlertProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (o) return
        if (closingViaConfirmRef.current) {
          closingViaConfirmRef.current = false
          return
        }
        onStay()
      }}
    >
      <AlertDialogContent className="border-zinc-800 bg-zinc-950 sm:rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">Discard unsaved changes?</AlertDialogTitle>
          <AlertDialogDescription className="text-zinc-400">
            You have unsaved edits in the editor. Switching projects will close open tabs. Continue without saving?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:space-x-0">
          <Button type="button" variant="outline" onClick={onStay}>
            Stay
          </Button>
          <Button type="button" variant="destructive" onClick={onContinueWithoutSaving}>
            Continue without saving
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
