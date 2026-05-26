import { cn } from '@/lib/utils'
import {
  harnessTemperamentLabel,
  persistHarnessTemperament,
  type HarnessTemperament,
} from '@/lib/harness-temperament'

type Props = {
  temperament: HarnessTemperament
  onChange: (next: HarnessTemperament) => void
  disabled?: boolean
  className?: string
}

export function HarnessTemperamentChip({
  temperament,
  onChange,
  disabled = false,
  className,
}: Props) {
  const cycle = () => {
    if (disabled) return
    const next: HarnessTemperament = temperament === 'trust' ? 'velocity' : 'trust'
    persistHarnessTemperament(next)
    onChange(next)
  }

  return (
    <button
      type="button"
      disabled={disabled}
      title={`Harness temperament: ${harnessTemperamentLabel(temperament)}. Click to switch.`}
      onClick={cycle}
      className={cn(
        'rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide transition-colors',
        temperament === 'velocity'
          ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/15'
          : 'border-zinc-700 bg-zinc-900/60 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      {harnessTemperamentLabel(temperament)}
    </button>
  )
}
