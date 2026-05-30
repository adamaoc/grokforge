import { AlertCircle } from 'lucide-react'
import type { AgentChatActivityPayload } from '@/types'
import { cn } from '@/lib/utils'
import {
  isCompactedEditFailureActivity,
  resolveActivityEditFailurePath,
} from '../../../shared/agent-activity-display'

function basenameFromPath(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? path
}

function parseCompactedEditFailureDetail(detail?: string): {
  failureClass?: string
  diskOutcome?: string
} {
  if (!detail?.trim()) return {}
  const parts = detail.split(' · ').map((p) => p.trim()).filter(Boolean)
  if (parts.length >= 2) {
    return { failureClass: parts[0], diskOutcome: parts.slice(1).join(' · ') }
  }
  return { failureClass: detail.trim() }
}

function countFromCompactedTitle(title: string): number | undefined {
  const match = title.match(/×(\d+)\s+on\s/)
  if (!match?.[1]) return undefined
  const n = Number.parseInt(match[1], 10)
  return Number.isFinite(n) ? n : undefined
}

type Props = {
  activity: AgentChatActivityPayload
  displayTitle: string
  technicalTitle?: string
}

export function EditFailureIssueCard({ activity, displayTitle, technicalTitle }: Props) {
  const path = resolveActivityEditFailurePath(activity) ?? activity.subjectPath
  const pathLabel = path ? basenameFromPath(path) : undefined
  const count = countFromCompactedTitle(activity.title)
  const { failureClass, diskOutcome } = parseCompactedEditFailureDetail(activity.detail)

  return (
    <div
      className={cn(
        'min-w-0 rounded-lg border border-amber-900/50 bg-amber-950/25 px-2.5 py-2',
      )}
      data-edit-failure-issue-card=""
      title={technicalTitle ?? activity.title}
    >
      <div className="flex min-w-0 items-start gap-2">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300/90" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="truncate font-medium text-amber-100/95">{displayTitle}</span>
            {count != null && count > 1 ? (
              <span className="shrink-0 rounded-md border border-amber-800/60 bg-amber-950/50 px-1.5 py-0.5 font-mono text-[10px] text-amber-200/80">
                ×{count}
              </span>
            ) : null}
          </div>
          {pathLabel ? (
            <p
              className="mt-0.5 truncate font-mono text-[10px] text-zinc-400"
              title={path ?? pathLabel}
            >
              {pathLabel}
            </p>
          ) : null}
          {failureClass ? (
            <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-amber-200/85">
              {failureClass}
            </p>
          ) : null}
          {diskOutcome ? (
            <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-zinc-400">
              {diskOutcome}
            </p>
          ) : null}
          <p className="mt-1.5 text-[10px] text-zinc-600">
            Full details in Last agent turn trace (header menu).
          </p>
        </div>
      </div>
    </div>
  )
}

export function shouldRenderEditFailureIssueCard(activity: AgentChatActivityPayload): boolean {
  return isCompactedEditFailureActivity(activity)
}
