import type { ReactNode } from 'react'
import { Bot, FileDiff, FolderTree, Mic, Sparkles, Undo2, Zap } from 'lucide-react'
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
    rootCount === 1 ? 'one folder' : `${rootCount} folders`

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
          <PrimerRow icon={<Bot size={16} />} title="Your coding agent does the work">
            Chat runs on <strong className="font-medium text-zinc-300">Grok Build</strong> or{' '}
            <strong className="font-medium text-zinc-300">Claude Code</strong>, signed in with your own subscription.
            Switch agents from the chip above the message box.
          </PrimerRow>
          <PrimerRow icon={<FileDiff size={16} />} title="You approve edits">
            With <strong className="font-medium text-zinc-300">Review edits</strong>, every file change shows a diff
            and waits for you. <strong className="font-medium text-zinc-300">Auto-accept</strong> lets the agent edit
            freely; commands still ask.
          </PrimerRow>
          <PrimerRow icon={<Undo2 size={16} />} title="Every turn can be undone">
            After each reply, a changes card lists the files the agent touched. Inspect any diff, revert one file, or
            undo the whole turn.
          </PrimerRow>
          <PrimerRow icon={<Zap size={16} />} title="Work or Plan">
            <strong className="font-medium text-zinc-300">Plan</strong> asks the agent to explore and propose steps
            without changing files. Switch back to <strong className="font-medium text-zinc-300">Work</strong> to build it.
          </PrimerRow>
          <PrimerRow icon={<FolderTree size={16} />} title="Project folders">
            This project has {rootsLabel}. The agent starts in the first one and can reach the others.
          </PrimerRow>
          <PrimerRow icon={<Mic size={16} />} title="Talk it through">
            Voice is for thinking out loud. When you're ready for changes, use{' '}
            <strong className="font-medium text-zinc-300">Continue in agent chat</strong> to hand the conversation
            to the agent.
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
