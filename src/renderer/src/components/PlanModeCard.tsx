import { useEffect, useState } from 'react'
import { Check, ListChecks, XCircle } from 'lucide-react'
import type { GfPlanV1 } from '../../../shared/gf-plan-contract'
import type { PlanInteractionState, PlanInteractionStatus } from '@/lib/plan-interaction-storage'
import { getPlanInteraction, patchPlanInteraction } from '@/lib/plan-interaction-storage'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Props = {
  projectId: string | null | undefined
  messageId: string
  plan: GfPlanV1
  /** After approve persists; starts one execution turn from the parent (e.g. ChatThread). */
  onApproveAndRun?: () => void
}

function statusLabel(status: PlanInteractionStatus): string {
  switch (status) {
    case 'approved':
      return 'Approved'
    case 'cancelled':
      return 'Cancelled'
    case 'superseded':
      return 'Superseded'
    default:
      return 'Pending review'
  }
}

export function PlanModeCard({ projectId, messageId, plan, onApproveAndRun }: Props) {
  const stepCount = plan.steps.length
  const [local, setLocal] = useState<PlanInteractionState>(() =>
    getPlanInteraction(projectId, messageId, stepCount),
  )

  useEffect(() => {
    setLocal(getPlanInteraction(projectId, messageId, stepCount))
  }, [projectId, messageId, stepCount])

  const locked = local.status !== 'pending'

  const approve = () => {
    if (!projectId || locked) return
    const next = patchPlanInteraction(projectId, messageId, { status: 'approved' }, stepCount)
    setLocal(next)
    onApproveAndRun?.()
  }

  const cancel = () => {
    if (!projectId || locked) return
    const next = patchPlanInteraction(projectId, messageId, { status: 'cancelled' }, stepCount)
    setLocal(next)
  }

  const toggleStep = (index: number) => {
    if (!projectId || local.status !== 'approved') return
    const stepDone = [...local.stepDone]
    stepDone[index] = !stepDone[index]
    const next = patchPlanInteraction(projectId, messageId, { stepDone }, stepCount)
    setLocal(next)
  }

  const headerTone =
    local.status === 'approved'
      ? 'border-primary/40 bg-primary/10'
      : local.status === 'cancelled' || local.status === 'superseded'
        ? 'border-zinc-700 bg-zinc-900/40'
        : 'border-zinc-700 bg-zinc-900/60'

  return (
    <div className={cn('mt-3 max-w-full rounded-2xl border px-3 py-3 text-sm shadow-sm', headerTone)}>
      <div className="flex items-start justify-between gap-2 border-b border-zinc-800/80 pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <ListChecks size={16} className="shrink-0 text-gf-accent" aria-hidden />
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Plan</div>
            <div className="truncate text-sm font-medium text-white">
              {plan.summary.slice(0, 120)}
              {plan.summary.length > 120 ? '…' : ''}
            </div>
          </div>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
            local.status === 'pending' && 'bg-zinc-800 text-zinc-300',
            local.status === 'approved' && 'bg-primary/15 text-primary',
            (local.status === 'cancelled' || local.status === 'superseded') && 'bg-zinc-800 text-zinc-500',
          )}
        >
          {statusLabel(local.status)}
        </span>
      </div>

      {plan.filesLikelyTouched.length > 0 ? (
        <div className="mt-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Files likely touched</div>
          <ul className="mt-1 max-h-24 list-inside list-disc overflow-y-auto custom-scrollbar text-xs text-zinc-400">
            {plan.filesLikelyTouched.slice(0, 24).map((f) => (
              <li key={f} className="truncate font-mono">
                {f}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {plan.risksUnknowns.length > 0 ? (
        <div className="mt-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Risks / unknowns</div>
          <ul className="mt-1 space-y-1 text-xs text-zinc-400">
            {plan.risksUnknowns.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {local.status === 'approved' ? (
        <div className="mt-3">
          <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Steps</div>
          <ul className="mt-2 space-y-2">
            {plan.steps.map((s, i) => (
              <li key={s.id} className="flex items-start gap-2">
                <button
                  type="button"
                  disabled={!projectId}
                  onClick={() => toggleStep(i)}
                  className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[10px] transition-colors',
                    local.stepDone[i]
                      ? 'border-primary/60 bg-primary/10 text-primary'
                      : 'border-zinc-600 bg-zinc-950 text-zinc-500 hover:border-zinc-500',
                  )}
                  aria-label={local.stepDone[i] ? `Mark step ${i + 1} not done` : `Mark step ${i + 1} done`}
                >
                  {local.stepDone[i] ? <Check size={12} strokeWidth={3} aria-hidden /> : null}
                </button>
                <span
                  className={cn(
                    'text-sm leading-snug',
                    local.stepDone[i] ? 'text-zinc-500 line-through' : 'text-zinc-200',
                  )}
                >
                  {s.title}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ol className="mt-3 list-decimal space-y-1.5 pl-4 text-sm text-zinc-300">
          {plan.steps.map((s) => (
            <li key={s.id} className="pl-1">
              {s.title}
            </li>
          ))}
        </ol>
      )}

      <div className="mt-2">
        <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Verification</div>
        <p className="mt-1 text-xs leading-relaxed text-zinc-400">{plan.verification}</p>
      </div>

      {local.status === 'pending' ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-800/80 pt-3">
          <Button type="button" size="sm" className="rounded-xl" onClick={approve} disabled={!projectId}>
            Approve and run
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-xl border-zinc-700"
            onClick={cancel}
            disabled={!projectId}
          >
            <XCircle size={14} className="mr-1 inline" aria-hidden />
            Cancel
          </Button>
          <p className="w-full text-[11px] leading-snug text-zinc-500">
            To revise, send your next message with changes — newest direction wins.
          </p>
        </div>
      ) : null}
    </div>
  )
}
