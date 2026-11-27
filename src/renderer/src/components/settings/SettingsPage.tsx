import { useState } from 'react'
import { ArrowLeft, Bot, Mic, Palette } from 'lucide-react'
import type { GrokProjectManifest } from '@/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { AgentSettings } from './AgentSettings'
import { AppearanceSettings } from './AppearanceSettings'
import { VoiceSettings } from './VoiceSettings'

export type SettingsTab = 'agent' | 'appearance' | 'voice'

const TABS: Array<{ id: SettingsTab; label: string; icon: typeof Bot }> = [
  { id: 'agent', label: 'Coding agent', icon: Bot },
  { id: 'voice', label: 'Voice', icon: Mic },
  { id: 'appearance', label: 'Appearance', icon: Palette },
]

export interface SettingsPageProps {
  onBack: () => void
  macTitleBarInset?: boolean
  project?: GrokProjectManifest | null
  onProjectSaved?: (manifest: GrokProjectManifest) => void
  initialTab?: SettingsTab
}

export function SettingsPage({
  onBack,
  macTitleBarInset,
  project,
  onProjectSaved,
  initialTab = 'agent',
}: SettingsPageProps) {
  const [tab, setTab] = useState<SettingsTab>(initialTab)

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-gf-canvas text-white">
      {macTitleBarInset ? <div className="gf-drag-region h-10 shrink-0 bg-gf-canvas" aria-hidden /> : null}

      <header className="gf-no-drag shrink-0 border-b border-zinc-800 bg-zinc-950 px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-2 rounded-xl text-zinc-300 hover:bg-zinc-900 hover:text-white"
            onClick={onBack}
          >
            <ArrowLeft size={18} aria-hidden />
            Back
          </Button>
          <h1 className="text-lg font-semibold text-white">Settings</h1>
        </div>
      </header>

      <div className="gf-no-drag flex-1 overflow-y-auto custom-scrollbar px-4 py-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 sm:flex-row">
          <nav className="flex shrink-0 gap-1 sm:w-44 sm:flex-col" role="tablist" aria-label="Settings sections">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cn(
                  'flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors',
                  tab === id ? 'bg-zinc-900 text-white' : 'text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-200',
                )}
              >
                <Icon size={15} className={tab === id ? 'text-gf-accent' : 'text-zinc-500'} aria-hidden />
                {label}
              </button>
            ))}
          </nav>
          <div className="min-w-0 flex-1 space-y-6" role="tabpanel">
            {tab === 'agent' ? <AgentSettings /> : null}
            {tab === 'voice' ? <VoiceSettings project={project} onProjectSaved={onProjectSaved} /> : null}
            {tab === 'appearance' ? <AppearanceSettings /> : null}
          </div>
        </div>
      </div>
    </div>
  )
}
