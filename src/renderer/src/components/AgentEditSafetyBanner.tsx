import { AlertTriangle } from 'lucide-react'
import type { AgentEditSafetyResult } from '../../../harness-support/policy/edit/safety-warnings'
import { mergeAgentEditSafetyResults } from '../../../harness-support/policy/edit/safety-warnings'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type AgentEditSafetyBannerProps = {
  assessments: AgentEditSafetyResult[]
  className?: string
  onNormalizeLiteralNewlines?: () => void
}

export function AgentEditSafetyBanner({
  assessments,
  className,
  onNormalizeLiteralNewlines,
}: AgentEditSafetyBannerProps) {
  const merged = mergeAgentEditSafetyResults(assessments)
  if (
    merged.severity === 'ok' &&
    !merged.hasLiteralEscapedNewlines &&
    !merged.hasCollapsedSingleLineSource &&
    !merged.hasMessySourceLayout
  ) {
    return null
  }

  const isSevere = merged.severity === 'severe'

  return (
    <div
      role="alert"
      className={cn(
        'shrink-0 rounded-xl border px-3 py-2.5 text-xs leading-relaxed',
        isSevere
          ? 'border-red-900/60 bg-red-950/30 text-red-100/95'
          : 'border-amber-900/50 bg-amber-950/20 text-amber-200/90',
        className,
      )}
    >
      <div className="mb-1.5 flex items-start gap-2">
        <AlertTriangle
          className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', isSevere ? 'text-red-300' : 'text-amber-300')}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className={cn('font-semibold', isSevere ? 'text-red-100' : 'text-amber-100')}>
            {isSevere ? 'This proposal may break the file' : 'Review this proposal carefully'}
          </div>
          {merged.statsLine ? (
            <div className={cn('mt-0.5 font-mono text-[10px]', isSevere ? 'text-red-200/80' : 'text-amber-200/70')}>
              {merged.statsLine}
            </div>
          ) : null}
        </div>
      </div>
      {merged.issues.length > 0 ? (
        <ul className="mb-0 space-y-1 pl-5">
          {merged.issues.slice(0, 6).map((issue) => (
            <li key={`${issue.code}:${issue.message}`} className="text-[11px] leading-snug">
              {issue.message}
            </li>
          ))}
        </ul>
      ) : null}
      {(merged.hasLiteralEscapedNewlines ||
        merged.hasCollapsedSingleLineSource ||
        merged.hasMessySourceLayout) &&
      onNormalizeLiteralNewlines ? (
        <div className="mt-2 pl-5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              'h-7 rounded-lg text-[11px]',
              isSevere
                ? 'border-red-800/80 bg-red-950/40 hover:bg-red-950/60'
                : 'border-amber-800/80 bg-amber-950/40 hover:bg-amber-950/60',
            )}
            onClick={onNormalizeLiteralNewlines}
          >
            Normalize line breaks
          </Button>
        </div>
      ) : null}
    </div>
  )
}
