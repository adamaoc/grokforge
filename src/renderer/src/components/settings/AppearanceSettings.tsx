import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { AccentId } from '@/lib/accent-theme'
import {
  ACCENT_META,
  ACCENT_MORE_ORDER,
  ACCENT_PRIMARY_ORDER,
  isAccentInMoreSection,
  persistAndApplyAccent,
  readStoredAccent,
} from '@/lib/accent-theme'
import { SettingsSection } from './SettingsSection'

function AccentCard({ id, selected, onSelect }: { id: AccentId; selected: boolean; onSelect: (id: AccentId) => void }) {
  const meta = ACCENT_META[id]
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => onSelect(id)}
      className={cn(
        'flex flex-col items-stretch gap-3 rounded-2xl border p-4 text-left transition-colors',
        selected
          ? 'border-primary bg-zinc-900/80 ring-1 ring-primary/40'
          : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/60',
      )}
    >
      <div
        className="h-10 w-full rounded-xl shadow-inner"
        style={{ background: `linear-gradient(135deg, ${meta.swatchFrom}, ${meta.swatchTo})` }}
        aria-hidden
      />
      <div>
        <p className="text-sm font-semibold text-white">{meta.title}</p>
        <p className="text-xs text-zinc-500">{meta.hint}</p>
      </div>
    </button>
  )
}

export function AppearanceSettings() {
  const [accent, setAccent] = useState<AccentId>(() => readStoredAccent())
  const [moreOpen, setMoreOpen] = useState(() => isAccentInMoreSection(readStoredAccent()))

  const select = (id: AccentId) => {
    persistAndApplyAccent(id)
    setAccent(id)
    if (isAccentInMoreSection(id)) setMoreOpen(true)
  }

  return (
    <SettingsSection
      id="gf-settings-appearance"
      title="Accent color"
      description="Used for buttons, links, and focus rings. Saved on this device."
    >
      <div className="space-y-4" role="radiogroup" aria-label="Accent color">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {ACCENT_PRIMARY_ORDER.map((id) => (
            <AccentCard key={id} id={id} selected={accent === id} onSelect={select} />
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full gap-2 rounded-xl border-zinc-700 bg-zinc-900/50 text-zinc-300 hover:bg-zinc-900 sm:w-auto"
          aria-expanded={moreOpen}
          aria-controls="gf-accent-more-themes"
          onClick={() => setMoreOpen((o) => !o)}
        >
          More colors
          <ChevronDown size={16} aria-hidden className={cn('transition-transform', moreOpen && 'rotate-180')} />
        </Button>
        {moreOpen ? (
          <div id="gf-accent-more-themes" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ACCENT_MORE_ORDER.map((id) => (
              <AccentCard key={id} id={id} selected={accent === id} onSelect={select} />
            ))}
          </div>
        ) : null}
      </div>
    </SettingsSection>
  )
}
