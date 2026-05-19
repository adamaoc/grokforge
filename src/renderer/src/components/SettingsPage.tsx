import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, ChevronDown, ExternalLink, Loader2 } from 'lucide-react'
import type { GrokProjectManifest, XaiKeyStatusPayload } from '@/types'
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
  persistAgentWritesMode,
  readStoredAgentWritesMode,
  type AgentWritesMode,
} from '@/lib/agent-writes-mode'
import { AgentWriteHistorySection } from '@/components/AgentWriteHistorySection'

const URL_XAI_CONSOLE = 'https://console.x.ai/'
const URL_XAI_CHAT_DOCS = 'https://docs.x.ai/docs/guides/chat'
const CUSTOM_VOICE_VALUE = '__custom__'

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
  const [selectedVoiceValue, setSelectedVoiceValue] = useState(initialVoice.selected)
  const [voiceDraft, setVoiceDraft] = useState(initialVoice.draft)
  const [clearOpen, setClearOpen] = useState(false)
  const [accent, setAccent] = useState<AccentId>(() => readStoredAccent())
  const [moreThemesOpen, setMoreThemesOpen] = useState(() => isAccentInMoreSection(readStoredAccent()))
  const [agentWritesMode, setAgentWritesMode] = useState<AgentWritesMode>(() => readStoredAgentWritesMode())

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

  const selectAgentWritesMode = (mode: AgentWritesMode) => {
    persistAgentWritesMode(mode)
    setAgentWritesMode(mode)
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
            aria-labelledby="gf-settings-agent-writes-heading"
          >
            <h2 id="gf-settings-agent-writes-heading" className="text-base font-semibold text-white">
              Agent file writes
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              When the assistant proposes disk changes (via GrokForge&apos;s structured block), choose whether you
              confirm once per reply or files are written automatically. Only paths under your workspace roots can be
              written. Stored in <span className="font-mono text-xs text-zinc-500">localStorage</span>.
            </p>
            <div
              className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2"
              role="radiogroup"
              aria-labelledby="gf-settings-agent-writes-heading"
            >
              <button
                type="button"
                role="radio"
                aria-checked={agentWritesMode === 'batch_confirm'}
                onClick={() => selectAgentWritesMode('batch_confirm')}
                className={cn(
                  'flex flex-col items-stretch gap-2 rounded-2xl border p-4 text-left transition-colors',
                  agentWritesMode === 'batch_confirm'
                    ? 'border-primary bg-zinc-900/80 ring-1 ring-primary/40'
                    : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/60',
                )}
              >
                <p className="text-sm font-semibold text-white">Batch confirm</p>
                <p className="text-xs text-zinc-500">
                  Show pending changes after each reply; apply all when you are ready (recommended).
                </p>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={agentWritesMode === 'auto_apply'}
                onClick={() => selectAgentWritesMode('auto_apply')}
                className={cn(
                  'flex flex-col items-stretch gap-2 rounded-2xl border p-4 text-left transition-colors',
                  agentWritesMode === 'auto_apply'
                    ? 'border-primary bg-zinc-900/80 ring-1 ring-primary/40'
                    : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/60',
                )}
              >
                <p className="text-sm font-semibold text-white">Auto apply</p>
                <p className="text-xs text-zinc-500">
                  Writes run as soon as the reply validates. Use Undo right after if something looks wrong.
                </p>
              </button>
            </div>
          </section>

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
              Voice used for chat read-aloud and the Voice Agent. Custom ids are checked with xAI before saving.
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
