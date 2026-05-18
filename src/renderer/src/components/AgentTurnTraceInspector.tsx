import { useEffect, useState } from 'react'
import { ClipboardCopy, SearchCode } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AgentTurnTraceInspector({ open, onOpenChange }: Props) {
  const [rawJson, setRawJson] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const api = window.electron?.getLastAgentTurnTrace
    if (!api) {
      toast.error('Agent traces require the GrokForge desktop app.')
      setRawJson('')
      return
    }
    setLoading(true)
    void (async () => {
      try {
        const res = await api()
        if (cancelled) return
        if (!res.ok) {
          toast.error(res.error)
          setRawJson('')
          return
        }
        if (!res.trace) {
          setRawJson('// No trace yet — run an agent turn, then open this again.')
        } else {
          setRawJson(JSON.stringify(res.trace, null, 2))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  const copySanitized = async () => {
    const api = window.electron?.exportSanitizedAgentTurnTrace
    if (!api) {
      toast.error('Export requires the GrokForge desktop app.')
      return
    }
    const res = await api()
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    const w = window.electron?.writeClipboardText
    if (!w) {
      toast.error('Clipboard API unavailable.')
      return
    }
    const clip = await w(res.json)
    if (!clip.ok) {
      toast.error(clip.error)
      return
    }
    toast.message('Sanitized trace copied to clipboard')
  }

  const replayRetrieval = async () => {
    const api = window.electron?.replayAgentRetrievalPreview
    if (!api) {
      toast.error('Replay requires the GrokForge desktop app.')
      return
    }
    const res = await api()
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    const lines = [
      `Files matched: ${res.count}`,
      res.stale ? `Stale index${res.staleReason ? `: ${res.staleReason}` : ''}` : 'Index fresh',
      `Skipped — ignored ${res.skipped.ignored}, generated ${res.skipped.generated}, binary ${res.skipped.binary}, sensitive ${res.skipped.sensitive}, large ${res.skipped.large}`,
      ...res.details.slice(0, 12),
    ]
    toast.message('Retrieval replay (from last trace)', {
      duration: 14_000,
      description: lines.join('\n'),
    })
  }

  if (!open) return null

  return (
    <div
      className="gf-no-drag fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
      role="presentation"
      onClick={() => onOpenChange(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-turn-trace-title"
        className="flex max-h-[85vh] w-full max-w-3xl flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="agent-turn-trace-title" className="text-lg font-semibold text-white">
            Last agent turn trace
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-xl"
              onClick={() => void replayRetrieval()}
            >
              <SearchCode size={14} aria-hidden />
              Replay retrieval
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-xl"
              onClick={() => void copySanitized()}
            >
              <ClipboardCopy size={14} aria-hidden />
              Copy sanitized
            </Button>
            <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
        <p className="text-xs text-zinc-500">
          Local JSON from the most recent agent turn (debug). Copy sanitized redacts home prefixes and obvious secret
          patterns for bug reports. Replay retrieval re-runs lexical search from the saved user text and context.
        </p>
        <ScrollArea className="h-[58vh] rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 custom-scrollbar">
          {loading ? (
            <p className="text-sm text-zinc-400">Loading…</p>
          ) : (
            <pre className="whitespace-pre-wrap break-words font-mono text-xs text-zinc-300">{rawJson}</pre>
          )}
        </ScrollArea>
      </div>
    </div>
  )
}
