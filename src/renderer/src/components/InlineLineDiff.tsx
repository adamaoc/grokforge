import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { computeLineDiff } from '../../../shared/diff/line-diff'

type Props = {
  before: string | null
  after: string | null
  /** Added to every line number (when `before` / `after` are snippets of a larger file). */
  lineOffset?: number
  className?: string
}

/** Compact unified diff with collapsed context, for chat cards. */
export function InlineLineDiff({ before, after, lineOffset = 0, className }: Props) {
  const rows = useMemo(() => computeLineDiff(before, after ?? ''), [before, after])
  return (
    <div className={cn('custom-scrollbar max-h-72 overflow-auto py-1 font-mono text-[11px] leading-[1.45]', className)}>
      {rows.length === 0 ? (
        <div className="px-2.5 py-1 text-[11px] text-zinc-500">No textual changes.</div>
      ) : (
        rows.map((row, idx) =>
          row.type === 'gap' ? (
            <div key={idx} className="px-2.5 py-0.5 text-[10px] text-zinc-600">
              ⋯ {row.hidden} unchanged line{row.hidden === 1 ? '' : 's'}
            </div>
          ) : (
            <div
              key={idx}
              className={cn(
                'flex whitespace-pre',
                row.type === 'add' && 'bg-emerald-950/50 text-emerald-100',
                row.type === 'del' && 'bg-red-950/40 text-red-200/90',
                row.type === 'context' && 'text-zinc-400',
              )}
            >
              <span className="w-10 shrink-0 select-none pr-2 text-right text-zinc-600">
                {(row.type === 'del' ? row.oldLine ?? 0 : row.newLine ?? 0) + lineOffset}
              </span>
              <span className="w-3 shrink-0 select-none text-zinc-500">
                {row.type === 'add' ? '+' : row.type === 'del' ? '−' : ' '}
              </span>
              <span className="pr-3">{row.text || ' '}</span>
            </div>
          ),
        )
      )}
    </div>
  )
}

