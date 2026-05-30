import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ListChecks, XCircle } from 'lucide-react'
import type { GfPlanV1 } from '../../../shared/gf-plan-contract'
import {
  derivePlanUiPhase,
  getPlanInteraction,
  patchPlanInteraction,
  planUiPhaseLabel,
  type PlanInteractionState,
  type PlanUiPhase,
} from '@/lib/plan-interaction-storage'
import { PlanPhaseStepper } from '@/components/PlanPhaseStepper'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { AgentChatTurnRouting } from '@/types'
import type { HarnessTemperament } from '@/lib/harness-temperament'

type Props = {
  projectId: string | null | undefined
  messageId: string
  plan: GfPlanV1
  /** Raw assistant content — used for optional JSON disclosure. */
  assistantContent?: string
  uiPhase?: PlanUiPhase
  busy?: boolean
  isExecuting?: boolean
  anotherPlanExecuting?: boolean
  liveRouting?: AgentChatTurnRouting | null
  refreshEpoch?: number
  harnessTemperament?: HarnessTemperament
  onApproveAndRun?: (messageId: string) => void
  /** One-line partial execute summary when some paths were rejected (story 125). */
  executeOutcomeSummary?: string
}

function extractPlanJsonForDisplay(content: string | undefined): string | null {
  if (!content?.trim()) return null
  const m = content.match(/```\s*gf-plan\s*\n([\s\S]*?)```/im)
  if (!m?.[1]) return null
  try {
    return JSON.stringify(JSON.parse(m[1].trim()), null, 2)
  } catch {
    return m[1].trim()
  }
}

export function PlanModeCard({
  projectId,
  messageId,
  plan,
  assistantContent,
  uiPhase: uiPhaseProp,
  busy = false,
  isExecuting = false,
  anotherPlanExecuting = false,
  liveRouting = null,
  refreshEpoch = 0,
  harnessTemperament = 'trust',
  onApproveAndRun,
  executeOutcomeSummary,
}: Props) {
  const stepCount = plan.steps.length
  const [local, setLocal] = useState<PlanInteractionState>(() =>
    getPlanInteraction(projectId, messageId, stepCount),
  )

  useEffect(() => {
    setLocal(getPlanInteraction(projectId, messageId, stepCount))
  }, [projectId, messageId, stepCount, refreshEpoch])

  // Hydrate planId from backend if we have the plan content but no planId in local interaction yet.
  // This fixes cases where the plan card doesn't appear until project re-open.
  useEffect(() => {
    const hasPlanContent = !!plan
    const needsHydrate = projectId && !local.planId && hasPlanContent && window.electron?.getStoredPlanForMessage
    if (needsHydrate) {
      void (async () => {
        try {
          const res = await window.electron!.getStoredPlanForMessage!({
            projectId: projectId!,
            threadMessageId: messageId,
          })
          if (res?.ok && res.planId) {
            const next = patchPlanInteraction(projectId!, messageId, { planId: res.planId }, stepCount)
            setLocal(next)
          }
        } catch {
          // ignore
        }
      })()
    }
  }, [projectId, messageId, plan, local.planId, stepCount])

  const uiPhase =
    uiPhaseProp ??
    derivePlanUiPhase(local, {
      isExecutingThisPlan: isExecuting,
    })

  const locked = local.status !== 'pending'
  const approveDisabled =
    !projectId || locked || busy || isExecuting || anotherPlanExecuting || local.runPhase === 'executing'

  const planJson = useMemo(() => extractPlanJsonForDisplay(assistantContent), [assistantContent])

  const approve = () => {
    if (approveDisabled) return
    const next = patchPlanInteraction(projectId, messageId, { status: 'approved' }, stepCount)
    setLocal(next)
    onApproveAndRun?.(messageId)
  }

  const cancel = () => {
    if (!projectId || locked) return
    const next = patchPlanInteraction(projectId, messageId, { status: 'cancelled' }, stepCount)
    setLocal(next)
  }

  const headerTone =
    uiPhase === 'executing' || uiPhase === 'done'
      ? 'border-primary/40 bg-primary/10'
      : uiPhase === 'needs_review'
        ? 'border-amber-900/50 bg-amber-950/20'
        : uiPhase === 'failed'
        ? 'border-red-900/50 bg-red-950/20'
        : uiPhase === 'cancelled' || uiPhase === 'superseded'
          ? 'border-zinc-700 bg-zinc-900/40'
          : 'border-zinc-700 bg-zinc-900/60'

  const approveLabel =
    harnessTemperament === 'velocity' ? 'Build it' : 'Approve and run'

  return (
    <div className={cn('mt-3 max-w-full rounded-2xl border px-3 py-3 text-sm shadow-sm', headerTone)}>
      <PlanPhaseStepper
        phase={uiPhase}
        routing={liveRouting}
        compact
        hideRoutingDetail
        className="mb-3 border-b border-zinc-800/80 pb-3"
      />

      {executeOutcomeSummary ? (
        <p className="mb-3 text-xs leading-relaxed text-amber-200/90">{executeOutcomeSummary}</p>
      ) : null}

      <div className="flex items-start justify-between gap-2">
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
            uiPhase === 'pending' && 'bg-zinc-800 text-zinc-300',
            (uiPhase === 'executing' || uiPhase === 'done' || uiPhase === 'approved_idle') &&
              'bg-primary/15 text-primary',
            uiPhase === 'needs_review' && 'bg-amber-950/50 text-amber-400',
            uiPhase === 'failed' && 'bg-red-950/50 text-red-400',
            (uiPhase === 'cancelled' || uiPhase === 'superseded') && 'bg-zinc-800 text-zinc-500',
          )}
        >
          {planUiPhaseLabel(uiPhase)}
        </span>
      </div>

      <div className="mt-3">
        <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Steps</div>
        <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-sm text-zinc-300">
          {plan.steps.map((s) => (
            <li key={s.id} className="pl-1 leading-snug">
              {s.title}
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-2">
        <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Files likely touched</div>
        {plan.filesLikelyTouched.length > 0 ? (
          <ul className="mt-1 max-h-24 list-inside list-disc overflow-y-auto custom-scrollbar text-xs text-zinc-400">
            {plan.filesLikelyTouched.slice(0, 24).map((f) => (
              <li key={f} className="truncate font-mono">
                {f}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs italic text-zinc-500">Unknown until execute</p>
        )}
      </div>

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

      <div className="mt-2">
        <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Verification</div>
        <p className="mt-1 text-xs leading-relaxed text-zinc-400">{plan.verification}</p>
      </div>

      {planJson ? (
        <details className="mt-3 rounded-xl border border-zinc-800/80 bg-zinc-950/60">
          <summary className="flex cursor-pointer list-none items-center gap-1 px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500 [&::-webkit-details-marker]:hidden">
            <ChevronDown size={14} className="shrink-0" aria-hidden />
            Plan JSON
          </summary>
          <pre className="max-h-48 overflow-auto custom-scrollbar border-t border-zinc-800/80 px-3 py-2 font-mono text-[10px] leading-relaxed text-zinc-400">
            {planJson}
          </pre>
        </details>
      ) : null}

      {local.status === 'pending' ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-800/80 pt-3">
          <Button type="button" size="sm" className="rounded-xl" onClick={approve} disabled={approveDisabled}>
            {approveLabel}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-xl border-zinc-700"
            onClick={cancel}
            disabled={!projectId || busy}
          >
            <XCircle size={14} className="mr-1 inline" aria-hidden />
            Cancel
          </Button>
          <p className="w-full text-[11px] leading-snug text-zinc-500">
            To revise, send your next message with changes — newest direction wins. Command and file-edit approvals
            still apply during execute.
          </p>
        </div>
      ) : uiPhase === 'done' ? (
        <p className="mt-3 border-t border-zinc-800/80 pt-3 text-[11px] text-zinc-500">
          {harnessTemperament === 'trust'
            ? 'Files were written after you applied the proposal. Review tool activity and applied edits above.'
            : 'Execution finished. Review tool activity and applied edits above.'}
        </p>
      ) : uiPhase === 'needs_review' ? (
        <p className="mt-3 border-t border-zinc-800/80 pt-3 text-[11px] text-amber-400/90">
          {harnessTemperament === 'velocity'
            ? 'Auto-apply did not finish all file changes. Review the proposal card above — Apply remaining paths or Undo the batch.'
            : 'Agent finished; files are not on disk until you Apply on the proposal card above.'}
        </p>
      ) : uiPhase === 'failed' ? (
        <p className="mt-3 border-t border-zinc-800/80 pt-3 text-[11px] text-red-400/90">
          Execution finished without applying file changes. Check failed propose edits in the activity log, then
          approve and run again or send a follow-up in Work mode.
        </p>
      ) : null}

      {local.planId ? (
        <p className="mt-2 font-mono text-[10px] text-zinc-600">Plan id: {local.planId}</p>
      ) : null}
    </div>
  )
}
