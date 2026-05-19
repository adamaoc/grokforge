import { useState } from 'react'
import { ChevronDown, ChevronRight, Compass, Loader2 } from 'lucide-react'
import type { AgentSubagentEventPayload } from '@/types'
import { cn } from '@/lib/utils'
import { sanitizeAgentActivityDetail } from '../../../shared/agent-activity-display'

type Props = {
  subagent: AgentSubagentEventPayload
  defaultExpanded?: boolean
  isLive?: boolean
}

function StatusDot({
  status,
}: {
  status: AgentSubagentEventPayload['status'] | AgentSubagentEventPayload['activities'][number]['status']
}) {
  if (status === 'running') {
    return <Loader2 className="h-3 w-3 shrink-0 animate-spin text-gf-accent" aria-hidden />
  }
  return (
    <span
      className={cn(
        'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
        status === 'error' ? 'bg-red-400' : status === 'interrupted' ? 'bg-amber-400' : 'bg-zinc-500',
      )}
      aria-hidden
    />
  )
}

export function SubagentActivityBlock({ subagent, defaultExpanded = false, isLive = false }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded || isLive || subagent.status === 'running')

  return (
    <div className="mb-2 rounded-lg border border-zinc-800/90 bg-zinc-900/50">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-zinc-300 hover:bg-zinc-800/40"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
        )}
        <Compass className="h-3.5 w-3.5 shrink-0 text-gf-accent" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-medium">{subagent.title}</span>
        <StatusDot status={subagent.status} />
      </button>
      {expanded ? (
        <div className="border-t border-zinc-800/80 px-3 py-2">
          {subagent.activities.length > 0 ? (
            <ul className="space-y-1.5 text-xs text-zinc-400">
              {subagent.activities.map((activity) => {
                const detail = sanitizeAgentActivityDetail(activity.detail)
                return (
                  <li key={activity.id} className="flex min-w-0 items-start gap-2">
                    <StatusDot status={activity.status} />
                    <span className="min-w-0">
                      <span
                        className={cn(
                          activity.status === 'error' && 'text-red-300/90',
                          activity.status === 'interrupted' && 'text-amber-200/90',
                        )}
                      >
                        {activity.title}
                      </span>
                      {detail ? <span className="ml-1 text-zinc-500">· {detail}</span> : null}
                    </span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-xs text-zinc-500">Waiting for explorer tools…</p>
          )}
          {subagent.result?.summary ? (
            <p className="mt-2 text-xs leading-relaxed text-zinc-300">{subagent.result.summary}</p>
          ) : null}
          {subagent.error ? (
            <p className="mt-2 text-xs text-red-300/90">{subagent.error}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}