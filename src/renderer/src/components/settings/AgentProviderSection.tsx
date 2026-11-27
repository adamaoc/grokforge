import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, CircleDashed, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type {
  AgentProviderId,
  AgentProviderStatus,
  AgentProvidersResult,
} from '../../../../shared/agent/provider-contract'

function StatusPill({ provider }: { provider: AgentProviderStatus }) {
  if (provider.available) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-800/60 bg-emerald-950/40 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
        <CheckCircle2 size={11} aria-hidden />
        Detected
      </span>
    )
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
      <CircleDashed size={11} aria-hidden />
      Not found
    </span>
  )
}

/** Settings → Coding agent: choose which agent runs chat turns. */
export function AgentProviderSection() {
  const [state, setState] = useState<AgentProvidersResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState<AgentProviderId | null>(null)

  const load = useCallback(async (refresh: boolean) => {
    const api = window.electron?.listAgentProviders
    if (!api) return
    setLoading(true)
    try {
      setState(await api({ refresh }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not detect coding agents')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(false)
  }, [load])

  const select = async (id: AgentProviderId) => {
    const api = window.electron?.setAgentProvider
    if (!api || state?.selected === id) return
    setSaving(id)
    try {
      const res = await api(id)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setState((prev) => (prev ? { ...prev, selected: res.selected } : prev))
      const label = state?.providers.find((p) => p.id === id)?.label ?? id
      toast.success(`Chat now uses ${label}`)
    } finally {
      setSaving(null)
    }
  }

  return (
    <section
      className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-sm"
      aria-labelledby="gf-settings-coding-agent-heading"
      data-testid="settings-coding-agent"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="gf-settings-coding-agent-heading" className="text-base font-semibold text-white">
            Coding agent
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            GrokForge drives a coding agent you already have installed and signed in to, so turns run on your
            existing subscription instead of a per-token API bill. Edits still come back here for review.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 gap-1.5 rounded-xl border-zinc-700 text-zinc-300"
          onClick={() => void load(true)}
          disabled={loading}
        >
          {loading ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <RefreshCw size={13} aria-hidden />}
          Re-detect
        </Button>
      </div>

      <div className="mt-5 space-y-3" role="radiogroup" aria-labelledby="gf-settings-coding-agent-heading">
        {!state ? (
          <p className="text-sm text-zinc-500">Looking for installed agents…</p>
        ) : (
          state.providers.map((provider) => {
            const selected = state.selected === provider.id
            return (
              <button
                key={provider.id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={provider.label}
                onClick={() => void select(provider.id)}
                className={cn(
                  'flex w-full flex-col items-stretch gap-1.5 rounded-2xl border p-4 text-left transition-colors',
                  selected
                    ? 'border-primary bg-zinc-900/80 ring-1 ring-primary/40'
                    : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/60',
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={cn(
                        'h-3.5 w-3.5 shrink-0 rounded-full border',
                        selected ? 'border-primary bg-primary' : 'border-zinc-600',
                      )}
                      aria-hidden
                    />
                    <span className="text-sm font-semibold text-white">{provider.label}</span>
                    {saving === provider.id ? (
                      <Loader2 size={12} className="animate-spin text-zinc-400" aria-hidden />
                    ) : null}
                  </div>
                  <StatusPill provider={provider} />
                </div>
                <p className="pl-[1.375rem] text-xs text-zinc-400">{provider.tagline}</p>
                {provider.detail ? (
                  <p className="truncate pl-[1.375rem] font-mono text-[11px] text-zinc-500" title={provider.detail}>
                    {provider.detail}
                  </p>
                ) : null}
                {provider.hint ? (
                  <p className="pl-[1.375rem] text-xs text-amber-200/80">{provider.hint}</p>
                ) : null}
              </button>
            )
          })
        )}
      </div>
    </section>
  )
}
