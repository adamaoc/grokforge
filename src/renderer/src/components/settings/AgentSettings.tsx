import { useState } from 'react'
import { ShieldCheck, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AgentProviderSection } from './AgentProviderSection'
import { persistReviewMode, readStoredReviewMode, REVIEW_MODE_COPY, type ReviewMode } from '@/lib/review-mode'
import { SettingsSection } from './SettingsSection'

function ReviewModeSection() {
  const [mode, setMode] = useState<ReviewMode>(() => readStoredReviewMode())
  const select = (next: ReviewMode) => {
    persistReviewMode(next)
    setMode(next)
  }
  return (
    <SettingsSection
      id="gf-settings-review-mode"
      title="File edits"
      description="How the agent's file changes are approved. Commands always ask first, and every turn lists its changes with an undo."
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="File edits">
        {(['trust', 'velocity'] as const).map((value) => {
          const Icon = value === 'trust' ? ShieldCheck : Zap
          const selected = mode === value
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => select(value)}
              className={cn(
                'flex flex-col items-stretch gap-2 rounded-2xl border p-4 text-left transition-colors',
                selected
                  ? 'border-primary bg-zinc-900/80 ring-1 ring-primary/40'
                  : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/60',
              )}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-white">
                <Icon size={15} className={value === 'trust' ? 'text-gf-accent' : 'text-amber-300'} aria-hidden />
                {REVIEW_MODE_COPY[value].label}
              </span>
              <span className="text-xs leading-relaxed text-zinc-500">{REVIEW_MODE_COPY[value].description}</span>
            </button>
          )
        })}
      </div>
    </SettingsSection>
  )
}

export function AgentSettings() {
  return (
    <>
      <AgentProviderSection />
      <ReviewModeSection />
    </>
  )
}
