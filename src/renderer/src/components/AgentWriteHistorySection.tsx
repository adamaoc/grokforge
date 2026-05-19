import { useCallback, useEffect, useState } from 'react'
import { History, Loader2, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import type { AgentWriteHistoryListEntry } from '@/types'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

function formatRelativeTime(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return iso
  const diffMs = Date.now() - t
  const sec = Math.round(diffMs / 1000)
  if (sec < 60) return sec <= 1 ? 'just now' : `${sec}s ago`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 48) return `${hr}h ago`
  return new Date(t).toLocaleString()
}

function pathChipLabel(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  if (parts.length <= 2) return parts.at(-1) ?? path
  return `${parts.at(-2)}/${parts.at(-1)}`
}

type AgentWriteHistorySectionProps = {
  projectId: string
  onReverted?: (paths: string[]) => void
}

export function AgentWriteHistorySection({ projectId, onReverted }: AgentWriteHistorySectionProps) {
  const [entries, setEntries] = useState<AgentWriteHistoryListEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [revertTarget, setRevertTarget] = useState<AgentWriteHistoryListEntry | null>(null)
  const [reverting, setReverting] = useState(false)

  const loadHistory = useCallback(async () => {
    const api = window.electron?.getAgentWriteHistory
    if (!api) {
      setEntries([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const res = await api({ projectId })
      if (res.ok) setEntries(res.entries)
      else toast.error(res.error)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  const confirmRevert = useCallback(async () => {
    if (!revertTarget) return
    const api = window.electron?.revertAgentWriteBatch
    if (!api) {
      toast.error('Revert requires the GrokForge desktop app.')
      return
    }
    setReverting(true)
    try {
      const res = await api({ projectId, batchId: revertTarget.batchId })
      setRevertTarget(null)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      if (res.restoredPaths.length > 0) {
        onReverted?.(res.restoredPaths)
        toast.message('Agent batch reverted', {
          description:
            res.removedBatchIds.length > 1
              ? `Restored ${res.restoredPaths.length} file(s). Removed ${res.removedBatchIds.length} history entries (including newer applies).`
              : `Restored ${res.restoredPaths.length} file(s) from disk snapshots.`,
        })
      } else {
        toast.message('History updated', {
          description: 'No files were restored from snapshots.',
        })
      }
      await loadHistory()
    } finally {
      setReverting(false)
    }
  }, [revertTarget, projectId, onReverted, loadHistory])

  return (
    <>
      <section
        className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-sm"
        aria-labelledby="gf-settings-agent-history-heading"
      >
        <div className="flex items-start gap-3">
          <History size={18} className="mt-0.5 shrink-0 text-gf-accent" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 id="gf-settings-agent-history-heading" className="text-base font-semibold text-white">
              Recent agent writes
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              GrokForge-local undo from snapshots saved when you applied agent batches. This is{' '}
              <strong className="font-medium text-zinc-300">not</strong> <code className="text-xs">git revert</code> —
              use git for version control. Reverting an older batch also removes newer history entries that may have
              touched the same files.
            </p>
          </div>
        </div>

        <div className="mt-5">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Loader2 size={16} className="animate-spin" aria-hidden />
              Loading history…
            </div>
          ) : entries.length === 0 ? (
            <p className="text-sm text-zinc-500">No applied agent batches recorded for this project yet.</p>
          ) : (
            <ul className="space-y-3">
              {entries.map((entry) => (
                <li
                  key={entry.batchId}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-200">
                        {entry.applied.length} file{entry.applied.length === 1 ? '' : 's'} ·{' '}
                        <span className="text-zinc-400">{formatRelativeTime(entry.appliedAt)}</span>
                      </p>
                      <p className="mt-1 font-mono text-[10px] text-zinc-600" title={entry.appliedAt}>
                        {entry.appliedAt}
                      </p>
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={!entry.canRevert}
                            className={cn(
                              'h-8 gap-1.5 rounded-lg border-zinc-700 bg-zinc-900 text-xs',
                              entry.canRevert && 'hover:border-zinc-600 hover:bg-zinc-800',
                            )}
                            onClick={() => setRevertTarget(entry)}
                          >
                            <RotateCcw size={14} aria-hidden />
                            Revert
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {!entry.canRevert ? (
                        <TooltipContent side="left" className="max-w-xs text-xs">
                          Snapshots were too large or unavailable — cannot restore this batch.
                        </TooltipContent>
                      ) : null}
                    </Tooltip>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {entry.snapshots.slice(0, 8).map((snap) => (
                      <span
                        key={snap.path}
                        className={cn(
                          'rounded-full border px-2 py-0.5 font-mono text-[10px]',
                          snap.snapshotAvailable
                            ? 'border-zinc-700 bg-zinc-950 text-zinc-400'
                            : 'border-zinc-800 text-zinc-600',
                        )}
                        title={snap.path}
                      >
                        {pathChipLabel(snap.path)}
                        {!snap.snapshotAvailable ? ' (no snapshot)' : ''}
                      </span>
                    ))}
                    {entry.snapshots.length > 8 ? (
                      <span className="text-[10px] text-zinc-600">+{entry.snapshots.length - 8} more</span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <AlertDialog
        open={revertTarget !== null}
        onOpenChange={(open) => {
          if (!open && !reverting) setRevertTarget(null)
        }}
      >
        <AlertDialogContent className="border-zinc-800 bg-zinc-950 text-white sm:rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Revert agent batch?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Files in this batch will be restored to their contents before the apply.{' '}
              {revertTarget && entries[0]?.batchId === revertTarget.batchId
                ? 'This is the most recent batch.'
                : 'Newer applied batches will be removed from history because their snapshots may no longer match disk.'}{' '}
              This does not run git commands.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={reverting}
              className="rounded-xl border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
            >
              Cancel
            </AlertDialogCancel>
            <Button
              type="button"
              disabled={reverting}
              className="rounded-xl bg-gf-accent text-black hover:bg-gf-accent-hover"
              onClick={() => void confirmRevert()}
            >
              {reverting ? (
                <>
                  <Loader2 size={14} className="animate-spin" aria-hidden />
                  Reverting…
                </>
              ) : (
                'Revert batch'
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
