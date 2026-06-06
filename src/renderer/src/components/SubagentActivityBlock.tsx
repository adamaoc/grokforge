import { useState } from 'react'
import { ChevronDown, ChevronRight, Compass, Loader2 } from 'lucide-react'
import type { AgentSubagentEventPayload } from '@/types'
import { cn } from '@/lib/utils'
import { sanitizeAgentActivityDetail } from '../../../shared/agent/activity-display'
import { mapActivityTitleForDisplay } from '@/lib/harness-activity-display-map'

type Props = {
  subagent: AgentSubagentEventPayload
  defaultExpanded?: boolean
  isLive?: boolean
}

function StatusDot({
  status,
  isLive = false,
}: {
  status: AgentSubagentEventPayload['status'] | AgentSubagentEventPayload['activities'][number]['status']
  isLive?: boolean
}) {
  if (status === 'running' && isLive) {
    return <Loader2 className="h-3 w-3 shrink-0 animate-spin text-gf-accent" aria-hidden />
  }
  if (status === 'running') {
    return (
      <span
        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500"
        aria-hidden
      />
    )
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
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div className="mb-1.5 rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-3 py-1 text-xs">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 text-left text-zinc-300"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
        )}
        <Compass className="h-3.5 w-3.5 shrink-0 text-gf-accent" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-medium">{subagent.title}</span>
        <StatusDot status={subagent.status} isLive={isLive} />
      </button>
      {expanded ? (
        <div className="mt-1 border-t border-zinc-800/80 pt-1.5">
          {subagent.activities.length > 0 ? (
            <ul className="custom-scrollbar max-h-[min(40vh,280px)] space-y-1.5 overflow-y-auto text-xs text-zinc-400">
              {subagent.activities.map((activity) => {
                const detail = sanitizeAgentActivityDetail(activity.detail)
                const { displayTitle, technicalTitle } = mapActivityTitleForDisplay(
                  activity.title,
                )
                return (
                  <li key={activity.id} className="flex min-w-0 items-start gap-2">
                    <StatusDot status={activity.status} isLive={isLive} />
                    <span className="min-w-0">
                      <span
                        className={cn(
                          activity.status === 'error' && 'text-red-300/90',
                          activity.status === 'interrupted' && 'text-amber-200/90',
                        )}
                        title={technicalTitle}
                      >
                        {displayTitle}
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