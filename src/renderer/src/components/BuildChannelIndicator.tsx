import { cn } from '@/lib/utils'

/**
 * Shows **dev** (Vite dev / non-production bundle) vs **alpha** (production bundle) until MVP.
 * macOS: fixed beside inset traffic lights (`trafficLightPosition` in main). Others: top-right.
 */
export function BuildChannelIndicator() {
  if (!window.electron) return null
  const dev = import.meta.env.DEV
  const label = dev ? 'dev' : 'alpha'
  const mac = window.electron.platform === 'darwin'

  return (
    <span
      className={cn(
        'gf-no-drag pointer-events-none select-none rounded-md border px-[11px] py-[2px] font-mono text-[10px] font-semibold uppercase tracking-wide',
        'border-primary/70 bg-zinc-950/90 text-primary',
        mac ? 'fixed left-[calc(72px+1em)] top-3 z-[30]' : 'fixed right-4 top-3 z-[30]',
      )}
      title={dev ? 'Development build (Vite dev server)' : 'Pre-MVP production build'}
    >
      {label}
    </span>
  )
}
