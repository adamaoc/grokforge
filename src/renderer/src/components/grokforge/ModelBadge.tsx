import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const variants = {
  /** Full mono chip: thread header, editor chrome. */
  pill: 'rounded-full border border-zinc-800 bg-zinc-900/60 px-2 py-0.5 text-[10px] tracking-tight',
  /** Slightly larger, no lower opacity bg — chat header right. */
  chip: 'rounded-md bg-zinc-900 px-2 py-0.5 text-xs text-zinc-400',
  /** Voice bar model strip. */
  voice: 'rounded border border-zinc-800 bg-zinc-900 px-2 py-px text-[10px] tracking-widest text-zinc-500',
  /** Voice mode capsule (rounded-full, room for longer enum). */
  capsule: 'rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs font-mono text-zinc-500',
} as const

interface ModelBadgeProps {
  children: ReactNode
  title?: string
  variant?: keyof typeof variants
  className?: string
}

/** Mono label for model names, modes, and project ids (styleguide table). */
export function ModelBadge({ children, title, variant = 'pill', className }: ModelBadgeProps) {
  return (
    <span title={title} className={cn('inline-flex min-w-0 max-w-full shrink font-mono', variants[variant], className)}>
      <span className="min-w-0 truncate">{children}</span>
    </span>
  )
}
