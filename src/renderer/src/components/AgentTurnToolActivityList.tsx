import { useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Compass,
  Database,
  FileDiff,
  FileText,
  FolderOpen,
  Loader2,
  Search,
  Terminal,
  Wrench,
} from 'lucide-react'
import type { AgentChatActivityPayload, ChatTurnContextV1 } from '@/types'
import { cn } from '@/lib/utils'
import {
  agentActivitySectionTitle,
  agentActivityToolLabel,
  collapseCompletedMiddleRows,
  compactAgentTurnActivities,
  isAgentActivityErrorRow,
  sanitizeAgentActivityDetail,
  summarizeAgentActivityErrors,
} from '../../../shared/agent-activity-display'

type Props = {
  activities: AgentChatActivityPayload[]
  turnContext?: ChatTurnContextV1 | null
  defaultExpanded?: boolean
  isLive?: boolean
  forceExpanded?: boolean
  /** Best-effort execute progress vs approved plan steps (story 098). */
  planStepCount?: number
  completedEditActivities?: number
}

function compactFileLabel(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  if (parts.length <= 2) return path
  return `${parts.at(-2)}/${parts.at(-1)}`
}

function ToolIcon({ tool }: { tool?: AgentChatActivityPayload['tool'] }) {
  const className = 'h-3.5 w-3.5 shrink-0 text-zinc-500'
  switch (tool) {
    case 'read_file':
      return <FileText className={className} aria-hidden />
    case 'search_workspace':
      return <Search className={className} aria-hidden />
    case 'list_directory':
      return <FolderOpen className={className} aria-hidden />
    case 'workspace_index':
      return <Database className={className} aria-hidden />
    case 'propose_file_edits':
    case 'search_replace':
      return <FileDiff className={className} aria-hidden />
    case 'run_command':
      return <Terminal className={className} aria-hidden />
    case 'spawn_subagent':
      return <Compass className={className} aria-hidden />
    case 'retrieval':
      return <Search className={className} aria-hidden />
    default:
      return <Wrench className={className} aria-hidden />
  }
}

function effectiveActivityStatus(
  status: AgentChatActivityPayload['status'],
  isLive: boolean,
): AgentChatActivityPayload['status'] {
  if (!isLive && status === 'running') return 'done'
  return status
}

function StatusDot({
  status,
  headerShowsSpinner,
}: {
  status: AgentChatActivityPayload['status']
  headerShowsSpinner: boolean
}) {
  if (status === 'running' && headerShowsSpinner) {
    return (
      <span
        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gf-accent/70"
        aria-hidden
      />
    )
  }
  if (status === 'running' || status === 'awaiting_approval') {
    return <Loader2 className="h-3 w-3 shrink-0 animate-spin text-gf-accent" aria-hidden />
  }
  return (
    <span
      className={cn(
        'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
        status === 'error' || status === 'rejected'
          ? 'bg-red-400'
          : status === 'timeout' || status === 'interrupted'
            ? 'bg-amber-400'
            : 'bg-zinc-500',
      )}
      aria-hidden
    />
  )
}

export function AgentTurnToolActivityList({
  activities,
  turnContext,
  defaultExpanded = false,
  isLive = false,
  forceExpanded = false,
  planStepCount,
  completedEditActivities,
}: Props) {
  const compactedActivities = useMemo(
    () => compactAgentTurnActivities(activities),
    [activities],
  )
  const { displayActivities } = useMemo((): {
    displayActivities: AgentChatActivityPayload[]
  } => {
    if (!isLive || compactedActivities.length <= 4) {
      return { displayActivities: compactedActivities }
    }
    const collapsed = collapseCompletedMiddleRows(compactedActivities, {
      keepLast: 2,
      keepErrors: true,
    })
    return { displayActivities: collapsed.activities }
  }, [compactedActivities, isLive])

  const hasErrors = displayActivities.some(isAgentActivityErrorRow)
  const errorSummary = useMemo(
    () => (hasErrors ? summarizeAgentActivityErrors(displayActivities) : null),
    [displayActivities, hasErrors],
  )

  const shouldStartExpanded =
    defaultExpanded || forceExpanded || (isLive && hasErrors) || (isLive && displayActivities.length >= 3)
  const [expanded, setExpanded] = useState(shouldStartExpanded)

  useEffect(() => {
    if (forceExpanded || (isLive && hasErrors)) {
      setExpanded(true)
    }
  }, [forceExpanded, hasErrors, isLive])

  if (displayActivities.length === 0) return null

  const chatMode = turnContext?.chatMode
  const isPlan = chatMode === 'plan'
  const sectionTitle = agentActivitySectionTitle(chatMode)
  const hasRunning =
    isLive &&
    displayActivities.some(
      (activity) => effectiveActivityStatus(activity.status, isLive) === 'running',
    )

  return (
    <div
      className={cn(
        'mb-1.5 rounded-xl border px-3 py-1.5 text-xs',
        isPlan ? 'border-blue-400/25 bg-blue-950/20' : 'border-zinc-800 bg-zinc-900/60',
      )}
      data-agent-activity-list=""
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left"
        onClick={() => setExpanded((open: boolean) => !open)}
        aria-expanded={expanded}
      >
        <span className="flex min-w-0 items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
          )}
          {hasRunning ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-gf-accent" aria-hidden />
          ) : null}
          <span className="font-medium text-zinc-300">{sectionTitle}</span>
          {isPlan ? (
            <span className="rounded-md border border-blue-400/30 bg-blue-400/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-200/90">
              Plan
            </span>
          ) : null}
          <span className="font-mono text-[10px] text-zinc-500">
            {displayActivities.length} step{displayActivities.length === 1 ? '' : 's'}
          </span>
        </span>
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-zinc-500">
          {expanded ? 'Hide' : 'Show'}
        </span>
      </button>

      {errorSummary && errorSummary.count > 0 ? (
        <p
          className="mt-1 rounded-md border border-amber-900/50 bg-amber-950/30 px-2 py-1 text-[10px] text-amber-200/90"
          data-agent-activity-error-summary=""
        >
          {errorSummary.count === 1 ? '1 issue' : `${errorSummary.count} issues`}
          {errorSummary.labels.length > 0
            ? `: ${errorSummary.labels.slice(0, 3).join(', ')}`
            : ''}
          {errorSummary.topReason ? ` — ${errorSummary.topReason}` : ''}
        </p>
      ) : null}

      {turnContext && expanded ? (
        <div className="mt-1 truncate text-[10px] text-zinc-500">
          <span className="text-zinc-600">Scope · </span>
          {turnContext.roots.map((root) => root.label).join(', ')}
          {turnContext.activeFilePath ? (
            <span className="font-mono" title={turnContext.activeFilePath}>
              {' '}
              · {compactFileLabel(turnContext.activeFilePath)}
            </span>
          ) : null}
        </div>
      ) : null}

      {planStepCount != null &&
      planStepCount > 0 &&
      completedEditActivities != null &&
      isLive &&
      turnContext?.chatMode === 'fast' ? (
        <p className="mt-1 text-[10px] text-zinc-500">
          Execution progress (best-effort): step{' '}
          {Math.min(completedEditActivities, planStepCount)} of {planStepCount}
        </p>
      ) : null}

      {expanded ? (
        <ul className="mt-1.5 space-y-1 border-t border-zinc-800/80 pt-1.5">
          {displayActivities.map((activity) => {
            const toolLabel = agentActivityToolLabel(activity.tool)
            const detail = sanitizeAgentActivityDetail(activity.detail)
            const isCollapsedPlaceholder = activity.id.startsWith('collapsed-')
            const isErrorRow = isAgentActivityErrorRow(activity)
            return (
              <li key={activity.id} className="flex min-w-0 items-start gap-2">
                {isCollapsedPlaceholder ? (
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-600" aria-hidden />
                ) : (
                  <StatusDot
                    status={effectiveActivityStatus(activity.status, isLive)}
                    headerShowsSpinner={hasRunning}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    {!isCollapsedPlaceholder ? <ToolIcon tool={activity.tool} /> : null}
                    {toolLabel && !isCollapsedPlaceholder ? (
                      <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                        {toolLabel}
                      </span>
                    ) : null}
                    <span
                      className={cn(
                        'min-w-0 truncate text-zinc-300',
                        (activity.status === 'error' || activity.status === 'rejected') &&
                          'text-red-300/90',
                        (activity.status === 'interrupted' || activity.status === 'timeout') &&
                          'text-amber-200/90',
                        isCollapsedPlaceholder && 'italic text-zinc-500',
                      )}
                    >
                      {activity.title}
                    </span>
                  </div>
                  {detail && !isCollapsedPlaceholder ? (
                    <div
                      className={cn(
                        'mt-0.5 font-mono text-[10px] text-zinc-500',
                        isErrorRow ? 'line-clamp-4 text-amber-200/80' : 'line-clamp-2',
                      )}
                    >
                      {detail}
                    </div>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
