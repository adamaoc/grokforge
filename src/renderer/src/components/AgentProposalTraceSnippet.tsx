import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { AgentTurnTraceV1 } from '../../../shared/agent-turn-trace-contract'
import { cn } from '@/lib/utils'

const MAX_STEPS = 6

export function AgentProposalTraceSnippet() {
  const [open, setOpen] = useState(false)
  const [trace, setTrace] = useState<AgentTurnTraceV1 | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    const api = window.electron?.getLastAgentTurnTrace
    if (!api) return
    setLoading(true)
    void (async () => {
      try {
        const res = await api()
        if (cancelled) return
        if (res.ok && res.trace) setTrace(res.trace)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const steps = trace?.toolSteps.slice(-MAX_STEPS) ?? []
  if (!loading && steps.length === 0) return null

  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 px-3 py-2">
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left text-xs text-zinc-400 hover:text-zinc-200"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
        <span className="font-medium text-zinc-300">Last agent turn</span>
        {loading ? <span className="text-zinc-600">Loading…</span> : null}
        {!loading && trace ? (
          <span className="ml-auto font-mono text-[10px] text-zinc-500">{trace.model}</span>
        ) : null}
      </button>
      {open && steps.length > 0 ? (
        <ul className="mt-2 space-y-1 border-t border-zinc-800/80 pt-2">
          {steps.map((step) => (
            <li
              key={`${step.toolCallId}-${step.iteration}`}
              className="flex items-start gap-2 font-mono text-[10px] leading-snug"
            >
              <span
                className={cn(
                  'shrink-0 uppercase',
                  step.ok ? 'text-gf-accent' : 'text-red-400',
                )}
              >
                {step.ok ? 'ok' : 'fail'}
              </span>
              <span className="min-w-0 text-zinc-400">
                {step.displayTitle ?? step.name}
                {step.errorSnippet ? (
                  <span className="mt-0.5 block text-red-300/90">{step.errorSnippet}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
