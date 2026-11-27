import { RECENT_PROJECT_DISPLAY_NAME_MAX_LEN } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export type ProjectNameDialogFlow = 'multi-root' | 'rename'

/** Rename a project, or name it after a second folder is added. */
export function ProjectNameDialog({
  open,
  flow,
  draft,
  saving,
  onDraftChange,
  onCancel,
  onSave,
}: {
  open: boolean
  flow: ProjectNameDialogFlow
  draft: string
  saving: boolean
  onDraftChange: (value: string) => void
  onCancel: () => void
  onSave: () => void
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !saving) onCancel()
      }}
    >
      <DialogContent className="border-zinc-800 bg-zinc-950 text-white sm:max-w-md sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-white">{flow === 'rename' ? 'Rename project' : 'Name this project'}</DialogTitle>
          <DialogDescription className="text-zinc-400">
            {flow === 'rename'
              ? 'Shown in the title bar and on the welcome screen. Stored in GrokForge, not in your project folders.'
              : 'This project now spans more than one folder. Give the whole project a name.'}
          </DialogDescription>
        </DialogHeader>
        <Input
          value={draft}
          onChange={(ev) => onDraftChange(ev.target.value.slice(0, RECENT_PROJECT_DISPLAY_NAME_MAX_LEN))}
          maxLength={RECENT_PROJECT_DISPLAY_NAME_MAX_LEN}
          disabled={saving}
          placeholder="Project name"
          className="border-zinc-700 bg-zinc-900/80 text-white placeholder:text-zinc-600 focus-visible:ring-primary"
          onKeyDown={(ev) => {
            if (ev.key === 'Enter' && draft.trim() && !saving) {
              ev.preventDefault()
              onSave()
            }
          }}
        />
        <DialogFooter className="gap-2 sm:space-x-0">
          <Button
            type="button"
            variant="outline"
            className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-900"
            disabled={saving}
            onClick={onCancel}
          >
            {flow === 'rename' ? 'Cancel' : 'Skip for now'}
          </Button>
          <Button type="button" disabled={!draft.trim() || saving} onClick={onSave}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
