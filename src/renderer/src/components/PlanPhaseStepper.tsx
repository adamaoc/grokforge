import { Check, Circle } from 'lucide-react'
import type { AgentChatTurnRouting } from '@/types'
import type { PlanUiPhase } from '@/lib/plan-interaction-storage'
import { formatAgentTurnRoutingLine } from '@/lib/agent-turn-routing-display'
import { cn } from '@/lib/utils'

const STEPS = [
  { id: 'plan', label: 'Plan' },
  { id: 'review', label: 'Review' },
  { id: 'execute', label: 'Execute' },
  { id: 'done', label: 'Done' },
] as const

type StepId = (typeof STEPS)[number]['id']

function stepIndex(phase: PlanUiPhase): number {
  switch (phase) {
    case 'awaiting_plan':
    case 'planning':
      return 0
    case 'pending':
      return 1
    case 'approved_idle':
      return 1
    case 'executing':
      return 2
    case 'done':
      return 3
    case 'failed':
      return 2
    case 'cancelled':
    case 'superseded':
      return 1
    default:
      return 0
  }
}

function isStepComplete(stepId: StepId, activeIdx: number, phase: PlanUiPhase): boolean {
  const idx = STEPS.findIndex((s) => s.id === stepId)
  if (phase === 'done') return idx < 4
  if (phase === 'failed' && stepId === 'execute') return false
  if (phase === 'approved_idle' && (stepId === 'plan' || stepId === 'review')) return true
  return idx < activeIdx
}

function isStepActive(stepId: StepId, activeIdx: number, phase: PlanUiPhase): boolean {
  const idx = STEPS.findIndex((s) => s.id === stepId)
  if (phase === 'failed' && stepId === 'execute') return true
  if (phase === 'done' && stepId === 'done') return true
  return idx === activeIdx
}

type Props = {
  phase: PlanUiPhase
  routing?: AgentChatTurnRouting | null
  compact?: boolean
  className?: string
}

export function PlanPhaseStepper({ phase, routing, compact = false, className }: Props) {
  const activeIdx = stepIndex(phase)
  const failed = phase === 'failed'

  return (
    <div className={cn('w-full', className)} role="list" aria-label="Plan workflow">
      <ol
        className={cn(
          'flex items-start justify-between gap-0',
          compact ? 'text-[10px]' : 'text-xs',
        )}
      >
        {STEPS.map((step, i) => {
          const complete = isStepComplete(step.id, activeIdx, phase)
          const active = isStepActive(step.id, activeIdx, phase)
          return (
            <li key={step.id} className="relative flex min-w-0 flex-1 flex-col items-center gap-1" role="listitem">
              {i > 0 ? (
                <span
                  className={cn(
                    'absolute top-3 h-px -translate-y-1/2 bg-zinc-800',
                    complete || active ? 'bg-primary/30' : 'bg-zinc-800',
                  )}
                  style={{ width: 'calc(100% - 1.5rem)', right: '50%' }}
                  aria-hidden
                />
              ) : null}
              <StepIcon complete={complete} active={active} failed={failed && step.id === 'execute'} />
              <span
                className={cn(
                  'relative z-[1] text-center font-medium tracking-tight',
                  active ? 'text-gf-accent' : complete ? 'text-zinc-400' : 'text-zinc-600',
                  failed && step.id === 'execute' && 'text-red-400',
                  phase === 'done' && step.id === 'done' && 'text-gf-accent',
                )}
              >
                {step.label}
              </span>
            </li>
          )
        })}
      </ol>
      {phase === 'executing' && routing ? (
        <p
          className={cn(
            'mt-2 text-center font-mono text-zinc-500',
            compact ? 'text-[10px]' : 'text-[11px]',
          )}
        >
          {formatAgentTurnRoutingLine(routing)}
        </p>
      ) : null}
    </div>
  )
}

function StepIcon({
  complete,
  active,
  failed,
}: {
  complete: boolean
  active: boolean
  failed?: boolean
}) {
  if (complete && !failed) {
    return (
      <span className="relative z-[1] flex h-6 w-6 items-center justify-center rounded-full border border-primary/50 bg-primary/15 text-primary">
        <Check size={12} strokeWidth={3} aria-hidden />
      </span>
    )
  }
  if (failed) {
    return (
      <span className="relative z-[1] flex h-6 w-6 items-center justify-center rounded-full border border-red-500/50 bg-red-950/40 text-red-400">
        <Circle size={8} fill="currentColor" aria-hidden />
      </span>
    )
  }
  if (active) {
    return (
      <span className="relative z-[1] flex h-6 w-6 items-center justify-center rounded-full border border-primary bg-primary/20 ring-2 ring-primary/30">
        <Circle size={8} className="text-gf-accent" fill="currentColor" aria-hidden />
      </span>
    )
  }
  return (
    <span className="relative z-[1] flex h-6 w-6 items-center justify-center rounded-full border border-zinc-700 bg-zinc-950">
      <Circle size={8} className="text-zinc-600" aria-hidden />
    </span>
  )
}
