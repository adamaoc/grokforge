import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, ChevronDown, ExternalLink, Loader2 } from 'lucide-react'
import type { GrokProjectManifest, XaiKeyStatusPayload } from '@/types'
import { getModelForIntent, DUAL_MODEL_FALLBACKS } from '@/types'
import { normalizeTtsVoiceId, TTS_VOICE_PRESETS, XAI_API_KEY_MAX_LEN } from '@/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import type { AccentId } from '@/lib/accent-theme'
import {
  ACCENT_META,
  ACCENT_MORE_ORDER,
  ACCENT_PRIMARY_ORDER,
  isAccentInMoreSection,
  persistAndApplyAccent,
  readStoredAccent,
} from '@/lib/accent-theme'
import {
  persistHarnessTemperament,
  readStoredHarnessTemperament,
  type HarnessTemperament,
} from '@/lib/harness-temperament'
import { AgentWriteHistorySection } from '@/components/AgentWriteHistorySection'

const URL_XAI_CONSOLE = 'https://console.x.ai/'
const URL_XAI_CHAT_DOCS = 'https://docs.x.ai/docs/guides/chat'
const URL_XAI_MODELS = 'https://docs.x.ai/developers/models'
const URL_XAI_VOICE_DOCS = 'https://docs.x.ai/developers/model-capabilities/audio/voice'
const CUSTOM_VOICE_VALUE = '__custom__'

const AGENT_MODEL_SLOT_HELP: Record<
  'chat_default' | 'planning' | 'execution' | 'reasoning' | 'voice',
  string
> = {
  chat_default: 'Grok Build 0.1 · 256k context · fast agentic coding',
  planning: 'Grok 4.3 · 1M context · planning and read-only tools',
  execution: 'Grok Build 0.1 · approve-and-run executor slot',
  reasoning: 'Deep reasoning · subagent explorer slot',
  voice: 'Realtime voice agent WebSocket model',
}

export interface SettingsPageProps {
  onBack: () => void
  macTitleBarInset?: boolean
  project?: GrokProjectManifest | null
  workspaceProjectId?: string | null
  onProjectSaved?: (manifest: GrokProjectManifest) => void
  onAgentDiskFilesChanged?: (paths: string[]) => void
}

function statusDescription(status: XaiKeyStatusPayload | null): string {
  if (!status) return 'Loading…'
  if (!status.configured) {
    return 'No API key is configured. Paste a key below or use environment variables for development.'
  }
  if (status.source === 'stored') {
    return 'Using a key saved in GrokForge on this device (overrides environment variables).'
  }
  return 'Using XAI_API_KEY or GROKFORGE_XAI_API_KEY from the environment (no in-app key saved).'
}

function voiceSelectionFromId(raw: string | null | undefined): { selected: string; draft: string } {
  const id = normalizeTtsVoiceId(raw ?? '')
  if (!id || id === 'eve') return { selected: 'eve', draft: '' }
  if (TTS_VOICE_PRESETS.some((voice) => voice.id === id)) return { selected: id, draft: id }
  return { selected: CUSTOM_VOICE_VALUE, draft: id }
}

export function SettingsPage({
  onBack,
  macTitleBarInset,
  project,
  workspaceProjectId = null,
  onProjectSaved,
  onAgentDiskFilesChanged,
}: SettingsPageProps) {
  const initialVoice = voiceSelectionFromId(project?.voice.customVoiceId)
  const [status, setStatus] = useState<XaiKeyStatusPayload | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [savingVoice, setSavingVoice] = useState(false)
  const [restoringModelDefaults, setRestoringModelDefaults] = useState(false)
  const [selectedVoiceValue, setSelectedVoiceValue] = useState(initialVoice.selected)
  const [voiceDraft, setVoiceDraft] = useState(initialVoice.draft)
  const [clearOpen, setClearOpen] = useState(false)
  const [accent, setAccent] = useState<AccentId>(() => readStoredAccent())
  const [moreThemesOpen, setMoreThemesOpen] = useState(() => isAccentInMoreSection(readStoredAccent()))
  const [harnessTemperament, setHarnessTemperament] = useState<HarnessTemperament>(() =>
    readStoredHarnessTemperament(),
  )

  const refreshStatus = useCallback(async () => {
    const el = window.electron?.getXaiKeyStatus
    if (!el) {
      setStatus({
        configured: false,
        source: 'none',
        canPersistKey: false,
      })
      return
    }
    try {
      const next = await el()
      setStatus(next)
    } catch {
      toast.error('Could not load API key status')
    }
  }, [])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  useEffect(() => {
    const next = voiceSelectionFromId(project?.voice.customVoiceId)
    setSelectedVoiceValue(next.selected)
    setVoiceDraft(next.draft)
  }, [project?.voice.customVoiceId])

  const openHttps = (url: string) => {
    void window.electron?.openExternalUrl?.(url)
  }

  const handleSave = async () => {
    const trimmed = apiKeyInput.trim()
    if (!trimmed) {
      toast.error('Paste an API key first')
      return
    }
    const setKey = window.electron?.setXaiApiKey
    if (!setKey) {
      toast.error('Saving requires the GrokForge desktop app.')
      return
    }
    setSaving(true)
    try {
      const res = await setKey(trimmed)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setApiKeyInput('')
      toast.success('API key saved')
      await refreshStatus()
    } finally {
      setSaving(false)
    }
  }

  const handleClear = async () => {
    const clear = window.electron?.clearXaiApiKey
    if (!clear) {
      toast.error('Clear requires the GrokForge desktop app.')
      return
    }
    const res = await clear()
    setClearOpen(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.message('Saved API key removed')
    await refreshStatus()
  }

  const selectAccent = (id: AccentId) => {
    persistAndApplyAccent(id)
    setAccent(id)
    if (isAccentInMoreSection(id)) setMoreThemesOpen(true)
  }

  const selectHarnessTemperament = (temperament: HarnessTemperament) => {
    persistHarnessTemperament(temperament)
    setHarnessTemperament(temperament)
  }

  const handleSaveVoice = async () => {
    if (!project) {
      toast.error('Open a project to change its voice.')
      return
    }
    const save = window.electron?.saveManifest
    if (!save) {
      toast.error('Saving requires the GrokForge desktop app.')
      return
    }
    const selectedVoiceId =
      selectedVoiceValue === CUSTOM_VOICE_VALUE
        ? normalizeTtsVoiceId(voiceDraft)
        : selectedVoiceValue
    if (!selectedVoiceId) {
      toast.error('Enter a custom voice id.')
      return
    }
    const verifyVoice = window.electron?.verifyTtsVoice
    if (!verifyVoice) {
      toast.error('Voice verification requires the GrokForge desktop app.')
      return
    }
    const next: GrokProjectManifest = {
      ...project,
      voice: {
        ...project.voice,
        customVoiceId: selectedVoiceId === 'eve' ? null : selectedVoiceId,
      },
    }
    setSavingVoice(true)
    try {
      const verify = await verifyVoice(selectedVoiceId)
      if (!verify.ok) {
        toast.error(verify.error)
        return
      }
      const ok = await save(next)
      if (!ok) {
        toast.error('Could not save voice setting.')
        return
      }
      onProjectSaved?.(next)
      toast.success(`Voice set to ${verify.voice.name ?? selectedVoiceId}`)
    } finally {
      setSavingVoice(false)
    }
  }

  const handleRestoreModelDefaults = async () => {
    if (!project) {
      toast.error('Open a project to restore model defaults.')
      return
    }
    const save = window.electron?.saveManifest
    if (!save) {
      toast.error('Saving requires the GrokForge desktop app.')
      return
    }
    const next: GrokProjectManifest = {
      ...project,
      models: {
        default: DUAL_MODEL_FALLBACKS.chat_default,
        planning: DUAL_MODEL_FALLBACKS.planning,
        execution: DUAL_MODEL_FALLBACKS.execution,
        reasoning: DUAL_MODEL_FALLBACKS.reasoning,
        voice: DUAL_MODEL_FALLBACKS.voice,
      },
    }
    setRestoringModelDefaults(true)
    try {
      const ok = await save(next)
      if (!ok) {
        toast.error('Could not restore recommended model defaults.')
        return
      }
      onProjectSaved?.(next)
      toast.success('Restored recommended xAI model defaults for this project.')
    } finally {
      setRestoringModelDefaults(false)
    }
  }

  const isCustomVoice = selectedVoiceValue === CUSTOM_VOICE_VALUE

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-gf-canvas text-white">
      {macTitleBarInset ? (
        <div className="gf-drag-region h-10 shrink-0 bg-gf-canvas" aria-hidden />
      ) : null}

      <header className="gf-no-drag shrink-0 border-b border-zinc-800 bg-zinc-950 px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
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

      <div className="gf-no-drag flex-1 overflow-y-auto custom-scrollbar px-4 py-8">
        <div className="mx-auto max-w-2xl space-y-8">
          <section
            className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-sm"
            aria-labelledby="gf-settings-appearance-heading"
          >
            <h2 id="gf-settings-appearance-heading" className="text-base font-semibold text-white">
              Appearance
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              Highlight color for buttons, links, and focus rings (dark mode only). Stored on this device in{' '}
              <span className="font-mono text-xs text-zinc-500">localStorage</span>.
            </p>
            <div
              className="mt-5 space-y-4"
              role="radiogroup"
              aria-labelledby="gf-settings-appearance-heading"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {ACCENT_PRIMARY_ORDER.map((id) => {
                  const meta = ACCENT_META[id]
                  const selected = accent === id
                  return (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => selectAccent(id)}
                      className={cn(
                        'flex flex-col items-stretch gap-3 rounded-2xl border p-4 text-left transition-colors',
                        selected
                          ? 'border-primary bg-zinc-900/80 ring-1 ring-primary/40'
                          : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/60',
                      )}
                    >
                      <div
                        className="h-10 w-full rounded-xl shadow-inner"
                        style={{
                          background: `linear-gradient(135deg, ${meta.swatchFrom}, ${meta.swatchTo})`,
                        }}
                        aria-hidden
                      />
                      <div>
                        <p className="text-sm font-semibold text-white">{meta.title}</p>
                        <p className="text-xs text-zinc-500">{meta.hint}</p>
                      </div>
                    </button>
                  )
                })}
              </div>

              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full gap-2 rounded-xl border-zinc-700 bg-zinc-900/50 text-zinc-300 hover:bg-zinc-900 sm:w-auto"
                  aria-expanded={moreThemesOpen}
                  aria-controls="gf-accent-more-themes"
                  onClick={() => setMoreThemesOpen((o) => !o)}
                >
                  More themes
                  <ChevronDown
                    size={16}
                    aria-hidden
                    className={cn('transition-transform', moreThemesOpen && 'rotate-180')}
                  />
                </Button>
              </div>

              {moreThemesOpen ? (
                <div
                  id="gf-accent-more-themes"
                  className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
                >
                  {ACCENT_MORE_ORDER.map((id) => {
                    const meta = ACCENT_META[id]
                    const selected = accent === id
                    return (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => selectAccent(id)}
                        className={cn(
                          'flex flex-col items-stretch gap-3 rounded-2xl border p-4 text-left transition-colors',
                          selected
                            ? 'border-primary bg-zinc-900/80 ring-1 ring-primary/40'
                            : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/60',
                        )}
                      >
                        <div
                          className="h-10 w-full rounded-xl shadow-inner"
                          style={{
                            background: `linear-gradient(135deg, ${meta.swatchFrom}, ${meta.swatchTo})`,
                          }}
                          aria-hidden
                        />
                        <div>
                          <p className="text-sm font-semibold text-white">{meta.title}</p>
                          <p className="text-xs text-zinc-500">{meta.hint}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </div>
          </section>

          <section
            className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-sm"
            aria-labelledby="gf-settings-harness-temperament-heading"
          >
            <h2 id="gf-settings-harness-temperament-heading" className="text-base font-semibold text-white">
              Harness temperament
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              Choose how aggressively GrokForge applies agent file edits. Stored in{' '}
              <span className="font-mono text-xs text-zinc-500">grokforge.harnessTemperament.v1</span>.
            </p>
            <div
              className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2"
              role="radiogroup"
              aria-labelledby="gf-settings-harness-temperament-heading"
            >
              <button
                type="button"
                role="radio"
                aria-checked={harnessTemperament === 'trust'}
                onClick={() => selectHarnessTemperament('trust')}
                className={cn(
                  'flex flex-col items-stretch gap-2 rounded-2xl border p-4 text-left transition-colors',
                  harnessTemperament === 'trust'
                    ? 'border-primary bg-zinc-900/80 ring-1 ring-primary/40'
                    : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/60',
                )}
              >
                <p className="text-sm font-semibold text-white">Trust</p>
                <p className="text-xs text-zinc-500">
                  Review the diff and apply when ready. Nothing hits disk until you approve (recommended for
                  unfamiliar code).
                </p>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={harnessTemperament === 'velocity'}
                onClick={() => selectHarnessTemperament('velocity')}
                className={cn(
                  'flex flex-col items-stretch gap-2 rounded-2xl border p-4 text-left transition-colors',
                  harnessTemperament === 'velocity'
                    ? 'border-primary bg-zinc-900/80 ring-1 ring-primary/40'
                    : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/60',
                )}
              >
                <p className="text-sm font-semibold text-white">Velocity</p>
                <p className="text-xs text-zinc-500">
                  Valid proposals auto-apply when a turn completes — no need to open the diff first. Undo reverts
                  the last batch; you can still review applied edits afterward.
                </p>
              </button>
            </div>
          </section>

          <section
            className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-sm"
            aria-labelledby="gf-settings-command-approval-heading"
          >
            <h2 id="gf-settings-command-approval-heading" className="text-base font-semibold text-white">
              Command approval
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              When the agent calls <span className="font-mono text-xs text-zinc-500">run_command</span>, GrokForge
              always asks before running a one-shot shell command from a workspace root. This is separate from the
              human PTY terminal — the agent cannot type into your interactive terminal sessions.
            </p>
            <ul className="mt-4 space-y-2 text-sm leading-relaxed text-zinc-400">
              <li>
                <strong className="font-medium text-zinc-300">Diagnostics:</strong> read-only commands such as{' '}
                <span className="font-mono text-xs">cat</span>, <span className="font-mono text-xs">ls</span>,{' '}
                <span className="font-mono text-xs">git status</span>, or{' '}
                <span className="font-mono text-xs">npm run typecheck</span> run automatically.
              </li>
              <li>
                <strong className="font-medium text-zinc-300">Install / scaffold:</strong> commands like{' '}
                <span className="font-mono text-xs">npm install</span> or{' '}
                <span className="font-mono text-xs">npm create</span> still require approval.
              </li>

              <li>
                <strong className="font-medium text-zinc-300">Velocity temperament</strong> auto-applies valid file
                proposals only — it never auto-runs shell commands.
              </li>
              <li>
                Use <strong className="font-medium text-zinc-300">Copy</strong> on the approval card to paste a
                command into your own terminal if you prefer to run it manually.
              </li>
            </ul>
            <p className="mt-4 text-xs leading-relaxed text-zinc-500">
              Trusted-developer tooling: commands run with guardrails (policy blocks, cwd scoped to a root) but are
              not sandboxed against a determined local attacker or malicious model output.
            </p>
          </section>

          {project ? (
            <section
              className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-sm"
              aria-labelledby="gf-settings-agent-models-heading"
            >
              <h2 id="gf-settings-agent-models-heading" className="text-base font-semibold text-white">
                Agent models
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                GrokForge resolves which xAI model runs each chat turn from this project manifest.
                The composer <strong className="font-medium text-zinc-300">Fast</strong> chip maps to{' '}
                <span className="font-mono text-xs text-zinc-500">models.default</span>; the planning
                model chip maps to{' '}
                <span className="font-mono text-xs text-zinc-500">models.planning</span>.{' '}
                <strong className="font-medium text-zinc-300">Plan</strong> mode uses the planner
                profile (read-only tools); <strong className="font-medium text-zinc-300">Approve and run</strong>{' '}
                uses <span className="font-mono text-xs text-zinc-500">models.execution</span>. Main
                process is the source of truth for the API model id (renderer sends a hint only).
              </p>
              <dl className="mt-4 divide-y divide-zinc-800/80 rounded-xl border border-zinc-800/80 text-sm">
                {(
                  [
                    ['Default (Fast chat)', 'chat_default'],
                    ['Planning', 'planning'],
                    ['Execution (approve and run)', 'execution'],
                    ['Reasoning', 'reasoning'],
                    ['Voice', 'voice'],
                  ] as const
                ).map(([label, intent]) => (
                  <AgentModelSlotRow
                    key={intent}
                    label={label}
                    modelId={getModelForIntent(project, intent)}
                    helper={AGENT_MODEL_SLOT_HELP[intent]}
                  />
                ))}
              </dl>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl border-zinc-700 text-zinc-300 hover:bg-zinc-900"
                  disabled={!project || restoringModelDefaults}
                  onClick={() => void handleRestoreModelDefaults()}
                >
                  {restoringModelDefaults ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                      Restoring…
                    </>
                  ) : (
                    'Restore recommended defaults'
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 rounded-xl text-zinc-400 hover:text-white"
                  onClick={() => openHttps(URL_XAI_MODELS)}
                >
                  xAI models hub <ExternalLink size={14} aria-hidden />
                </Button>
              </div>
              <p className="mt-4 text-xs text-zinc-500">
                Catalog notes and redirect matrix:{' '}
                <span className="font-mono">docs/harness-102-xai-investigation.md</span> (last reviewed 2026-05-26).
              </p>
            </section>
          ) : null}

          {workspaceProjectId ? (
            <AgentWriteHistorySection
              projectId={workspaceProjectId}
              onReverted={onAgentDiskFilesChanged}
            />
          ) : null}

          <section
            className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-sm"
            aria-labelledby="gf-settings-voice-heading"
          >
            <h2 id="gf-settings-voice-heading" className="text-base font-semibold text-white">
              Voice
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              Voice used for chat read-aloud and the Voice Agent. Built-in voices follow the{' '}
              <button
                type="button"
                className="text-zinc-300 underline decoration-zinc-600 underline-offset-2 hover:text-white"
                onClick={() => openHttps(URL_XAI_VOICE_DOCS)}
              >
                xAI voice docs
              </button>
              . Custom ids are checked with xAI before saving.
            </p>
            <div className="mt-5 space-y-3">
              <label htmlFor="gf-voice-id" className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Voice
              </label>
              <Select
                value={selectedVoiceValue}
                onValueChange={(next) => {
                  setSelectedVoiceValue(next)
                  if (next === CUSTOM_VOICE_VALUE) {
                    setVoiceDraft('')
                  } else {
                    setVoiceDraft(next === 'eve' ? '' : next)
                  }
                }}
                disabled={savingVoice}
              >
                <SelectTrigger id="gf-voice-id">
                  <SelectValue placeholder="Choose a voice" />
                </SelectTrigger>
                <SelectContent>
                  {TTS_VOICE_PRESETS.map((voice) => (
                    <SelectItem key={voice.id} value={voice.id}>
                      {voice.label} · {voice.detail}
                    </SelectItem>
                  ))}
                  <SelectItem value={CUSTOM_VOICE_VALUE}>Custom voice id…</SelectItem>
                </SelectContent>
              </Select>
              {isCustomVoice ? (
                <Input
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={256}
                  placeholder="Enter custom voice id"
                  value={voiceDraft}
                  onChange={(e) => setVoiceDraft(e.target.value)}
                  disabled={savingVoice}
                  className="h-11 rounded-xl border-zinc-800 bg-zinc-900 font-mono text-sm text-zinc-100 placeholder:text-zinc-600"
                />
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="rounded-xl"
                  disabled={!project || savingVoice}
                  onClick={() => void handleSaveVoice()}
                >
                  {savingVoice ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                      Saving…
                    </>
                  ) : (
                    'Save voice'
                  )}
                </Button>
                {voiceDraft.trim() ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl border-zinc-700 text-zinc-300 hover:bg-zinc-900"
                    disabled={!project || savingVoice}
                    onClick={() => {
                      setSelectedVoiceValue('eve')
                      setVoiceDraft('')
                    }}
                  >
                    Use default
                  </Button>
                ) : null}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-sm">
            <h2 className="text-base font-semibold text-white">xAI API key</h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">{statusDescription(status)}</p>

            {status?.maskedHint && status.source === 'stored' ? (
              <p className="mt-2 font-mono text-xs text-zinc-500">
                Saved key (masked): <span className="text-zinc-300">{status.maskedHint}</span>
              </p>
            ) : null}

            {status !== null && !status.canPersistKey ? (
              <p className="mt-3 rounded-xl border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-200/90">
                OS secure storage is unavailable. Keys cannot be saved in-app on this machine; use{' '}
                <span className="font-mono text-xs">XAI_API_KEY</span> or{' '}
                <span className="font-mono text-xs">GROKFORGE_XAI_API_KEY</span> instead.
              </p>
            ) : null}

            <div className="mt-5 space-y-3">
              <label htmlFor="gf-xai-api-key" className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                New API key
              </label>
              <Input
                id="gf-xai-api-key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                maxLength={XAI_API_KEY_MAX_LEN}
                placeholder={status?.configured ? 'Paste to replace saved key…' : 'Paste your xAI API key…'}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                disabled={saving || !status?.canPersistKey}
                className="h-11 rounded-xl border-zinc-800 bg-zinc-900 font-mono text-sm text-zinc-100 placeholder:text-zinc-600"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="rounded-xl"
                  disabled={saving || !status?.canPersistKey || !apiKeyInput.trim()}
                  onClick={() => void handleSave()}
                >
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                      Saving…
                    </>
                  ) : (
                    'Save key'
                  )}
                </Button>
                {status?.source === 'stored' ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl border-zinc-700 text-zinc-300 hover:bg-zinc-900"
                    disabled={saving}
                    onClick={() => setClearOpen(true)}
                  >
                    Remove saved key
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="mt-6 border-t border-zinc-800 pt-5">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Get a key</p>
              <p className="mt-2 text-sm text-zinc-400">
                Create or manage keys in your xAI account, then paste here.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="gap-1.5 rounded-xl bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
                  onClick={() => openHttps(URL_XAI_CONSOLE)}
                >
                  xAI console <ExternalLink size={14} aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 rounded-xl text-zinc-400 hover:text-white"
                  onClick={() => openHttps(URL_XAI_CHAT_DOCS)}
                >
                  Chat API docs <ExternalLink size={14} aria-hidden />
                </Button>
              </div>
            </div>
          </section>

          <p className={cn('text-center text-xs text-zinc-600')}>
            Keys are encrypted with the OS and never sent to the renderer after save. Anyone with access to this user
            account could extract them, like other desktop secrets.
          </p>
        </div>
      </div>

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent className="border-zinc-800 bg-zinc-950 sm:rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Remove saved API key?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              GrokForge will stop using the in-app key. If environment variables are set, those will be used instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:space-x-0">
            <AlertDialogCancel className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-900">
              Cancel
            </AlertDialogCancel>
            <Button type="button" variant="destructive" className="rounded-xl" onClick={() => void handleClear()}>
              Remove
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function AgentModelSlotRow({
  label,
  modelId,
  helper,
}: {
  label: string
  modelId: string
  helper?: string
}) {
  return (
    <div className="px-4 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <dt className="text-zinc-400">{label}</dt>
        <dd className="font-mono text-xs text-zinc-200">{modelId}</dd>
      </div>
      {helper ? <p className="mt-1 text-xs text-zinc-500">{helper}</p> : null}
    </div>
  )
}
