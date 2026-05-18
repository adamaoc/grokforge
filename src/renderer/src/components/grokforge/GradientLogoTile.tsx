import { cn } from '@/lib/utils'

const sizes = {
  sm: 'h-8 w-8 rounded-lg text-sm font-bold',
  lg: 'h-20 w-20 rounded-2xl text-4xl font-bold',
} as const

interface GradientLogoTileProps {
  /** One or two characters, e.g. `G` or `GF`. */
  label: string
  size?: keyof typeof sizes
  className?: string
}

export function GradientLogoTile({ label, size = 'sm', className }: GradientLogoTileProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-center bg-gradient-to-br from-gf-accent to-gf-accent-hover text-black',
        sizes[size],
        className
      )}
    >
      <span>{label}</span>
    </div>
  )
}
