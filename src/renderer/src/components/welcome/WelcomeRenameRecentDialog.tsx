import { RECENT_PROJECT_DISPLAY_NAME_MAX_LEN } from '@/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

const WELCOME_RENAME_DESC_ID = 'welcome-rename-description'

export function WelcomeRenameRecentDialog({
  open,
  folderLabel,
  draft,
  saving,
  onDraftChange,
  onOpenChange,
  onSave,
  onCancel,
  onDraftKeyDown,
}: {
  open: boolean
  folderLabel: string | null
  draft: string
  saving: boolean
  onDraftChange: (value: string) => void
  onOpenChange: (open: boolean) => void
  onSave: () => void
  onCancel: () => void
  onDraftKeyDown: (ev: React.KeyboardEvent<HTMLInputElement>) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-zinc-800 bg-zinc-950 text-white sm:rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Rename on welcome screen</DialogTitle>
          <DialogDescription id={WELCOME_RENAME_DESC_ID} className="text-zinc-400">
            {folderLabel ? (
              <>
                Roots: <span className="text-zinc-500">{folderLabel}</span>. Updates the name in GrokForge app storage
                and on this welcome screen.
              </>
            ) : (
              'Choose a display name for this project on the welcome screen.'
            )}
          </DialogDescription>
        </DialogHeader>
        <Input
          value={draft}
          onChange={(ev) => onDraftChange(ev.target.value)}
          maxLength={RECENT_PROJECT_DISPLAY_NAME_MAX_LEN}
          disabled={saving}
          placeholder="Display name"
          className="border-zinc-700 bg-zinc-900/80 text-white placeholder:text-zinc-600 focus-visible:ring-primary"
          aria-describedby={WELCOME_RENAME_DESC_ID}
          onKeyDown={onDraftKeyDown}
        />
        <DialogFooter className="gap-2 sm:space-x-0">
          <Button
            type="button"
            variant="outline"
            className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-900"
            disabled={saving}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button type="button" disabled={!draft.trim() || saving} onClick={onSave} aria-label="Save display name">
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
