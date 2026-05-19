import type { ReactNode } from 'react'
import {
  FileDiff,
  FolderTree,
  MessageSquare,
  Mic,
  Sparkles,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type AgentOnboardingDialogProps = {
  open: boolean
  projectName: string
  rootCount: number
  onOpenChange: (open: boolean) => void
  onGotIt: () => void
  onDontShowAgain: () => void
}

function PrimerRow({
  icon,
  title,
  children,
}: {
  icon: ReactNode
  title: string
  children: ReactNode
}) {
  return (
    <li className="flex gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2.5">
      <span className="mt-0.5 shrink-0 text-gf-accent" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium text-zinc-100">{title}</p>
        <p className="text-xs leading-relaxed text-zinc-400">{children}</p>
      </div>
    </li>
  )
}

export function AgentOnboardingDialog({
  open,
  projectName,
  rootCount,
  onOpenChange,
  onGotIt,
  onDontShowAgain,
}: AgentOnboardingDialogProps) {
  const rootsLabel =
    rootCount === 1 ? '1 workspace root' : `${rootCount} workspace roots`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,40rem)] gap-0 overflow-hidden border-zinc-800 bg-zinc-950 p-0 text-white sm:max-w-lg sm:rounded-2xl">
        <DialogHeader className="space-y-2 border-b border-zinc-800 px-5 pb-4 pt-5 text-left">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Sparkles size={18} className="shrink-0 text-gf-accent" aria-hidden />
            How GrokForge works
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-zinc-400">
            Quick primer for <span className="font-medium text-zinc-200">{projectName}</span> — you can
            dismiss this anytime.
          </DialogDescription>
        </DialogHeader>

        <ul className="custom-scrollbar max-h-[min(50vh,22rem)] space-y-2 overflow-y-auto px-5 py-4">
          <PrimerRow
            icon={<FolderTree size={16} />}
            title="Workspace roots"
          >
            This project has {rootsLabel}. Each root is a folder GrokForge can read and search — handy when
            code, docs, and apps live in different places on disk.
          </PrimerRow>
          <PrimerRow icon={<FileDiff size={16} />} title="Proposals, not silent writes">
            The agent <strong className="font-medium text-zinc-300">proposes</strong> file changes. You review
            the diff in the editor column and choose <strong className="font-medium text-zinc-300">Apply</strong>{' '}
            when ready — nothing hits disk until you approve.
          </PrimerRow>
          <PrimerRow icon={<Zap size={16} />} title="Fast vs Plan mode">
            <strong className="font-medium text-zinc-300">Fast</strong> is the default chat loop.{' '}
            <strong className="font-medium text-zinc-300">Plan</strong> asks for a structured plan (steps and
            risks) before heavier edits — use the mode control above the composer.
          </PrimerRow>
          <PrimerRow icon={<Mic size={16} />} title="Voice → agent chat">
            Voice is great for thinking out loud. When you need file changes, use{' '}
            <strong className="font-medium text-zinc-300">Continue in agent chat</strong> so proposals and diff
            review stay in the normal workflow.
          </PrimerRow>
          <PrimerRow icon={<MessageSquare size={16} />} title="Plain-language requests">
            Try describing what you want in everyday language — e.g. “add a loading state to the settings
            page” — and let the agent search the workspace before it edits.
          </PrimerRow>
        </ul>

        <DialogFooter className="flex-col gap-2 border-t border-zinc-800 bg-zinc-950/90 px-5 py-4 sm:flex-col sm:space-x-0">
          <Button
            type="button"
            className="h-10 w-full rounded-xl bg-gf-accent font-medium text-black hover:bg-gf-accent-hover"
            onClick={onGotIt}
          >
            Got it
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-9 w-full rounded-xl text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
            onClick={onDontShowAgain}
          >
            Don&apos;t show again
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
