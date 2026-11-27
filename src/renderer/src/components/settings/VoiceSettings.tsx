import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { GrokProjectManifest, XaiKeyStatusPayload } from '@/types'
import { normalizeTtsVoiceId, TTS_VOICE_PRESETS, XAI_API_KEY_MAX_LEN } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { SettingsSection } from './SettingsSection'

const URL_XAI_CONSOLE = 'https://console.x.ai/'
const URL_XAI_VOICE_DOCS = 'https://docs.x.ai/developers/model-capabilities/audio/voice'
const CUSTOM_VOICE_VALUE = '__custom__'

function voiceSelectionFromId(raw: string | null | undefined): { selected: string; draft: string } {
  const id = normalizeTtsVoiceId(raw ?? '')
  if (!id || id === 'eve') return { selected: 'eve', draft: '' }
  if (TTS_VOICE_PRESETS.some((voice) => voice.id === id)) return { selected: id, draft: id }
  return { selected: CUSTOM_VOICE_VALUE, draft: id }
}

function keyStatusDescription(status: XaiKeyStatusPayload | null): string {
  if (!status) return 'Loading…'
  if (!status.configured) return 'No key yet. Voice and read-aloud need one; coding agents do not.'
  if (status.source === 'stored') return 'Using a key saved in GrokForge on this device.'
  return 'Using XAI_API_KEY or GROKFORGE_XAI_API_KEY from the environment.'
}

const openHttps = (url: string) => void window.electron?.openExternalUrl?.(url)

function VoicePicker({
  project,
  onProjectSaved,
}: {
  project: GrokProjectManifest | null | undefined
  onProjectSaved?: (manifest: GrokProjectManifest) => void
}) {
  const initial = voiceSelectionFromId(project?.voice.customVoiceId)
  const [selected, setSelected] = useState(initial.selected)
  const [draft, setDraft] = useState(initial.draft)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const next = voiceSelectionFromId(project?.voice.customVoiceId)
    setSelected(next.selected)
    setDraft(next.draft)
  }, [project?.voice.customVoiceId])

  const save = async () => {
    const saveManifest = window.electron?.saveManifest
    const verify = window.electron?.verifyTtsVoice
    if (!project || !saveManifest || !verify) return
    const voiceId = selected === CUSTOM_VOICE_VALUE ? normalizeTtsVoiceId(draft) : selected
    if (!voiceId) {
      toast.error('Enter a custom voice id.')
      return
    }
    setSaving(true)
    try {
      const check = await verify(voiceId)
      if (!check.ok) {
        toast.error(check.error)
        return
      }
      const next: GrokProjectManifest = {
        ...project,
        voice: { ...project.voice, customVoiceId: voiceId === 'eve' ? null : voiceId },
      }
      if (!(await saveManifest(next))) {
        toast.error('Could not save voice setting.')
        return
      }
      onProjectSaved?.(next)
      toast.success(`Voice set to ${check.voice.name ?? voiceId}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsSection
      id="gf-settings-voice"
      title="Voice"
      description={
        <>
          Used for read-aloud and the voice companion in this project. Built-in voices follow the{' '}
          <button
            type="button"
            className="text-zinc-300 underline decoration-zinc-600 underline-offset-2 hover:text-white"
            onClick={() => openHttps(URL_XAI_VOICE_DOCS)}
          >
            xAI voice docs
          </button>
          .
        </>
      }
    >
      {!project ? (
        <p className="text-sm text-zinc-500">Open a project to choose its voice.</p>
      ) : (
        <div className="space-y-3">
          <Select
            value={selected}
            onValueChange={(next) => {
              setSelected(next)
              setDraft(next === CUSTOM_VOICE_VALUE || next === 'eve' ? '' : next)
            }}
            disabled={saving}
          >
            <SelectTrigger aria-label="Voice">
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
          {selected === CUSTOM_VOICE_VALUE ? (
            <Input
              type="text"
              autoComplete="off"
              spellCheck={false}
              maxLength={256}
              placeholder="Enter custom voice id"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={saving}
              className="h-11 rounded-xl border-zinc-800 bg-zinc-900 font-mono text-sm text-zinc-100 placeholder:text-zinc-600"
            />
          ) : null}
          <Button type="button" className="rounded-xl" disabled={saving} onClick={() => void save()}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
            {saving ? 'Saving…' : 'Save voice'}
          </Button>
        </div>
      )}
    </SettingsSection>
  )
}

function XaiKeySection() {
  const [status, setStatus] = useState<XaiKeyStatusPayload | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)

  const refresh = useCallback(async () => {
    const get = window.electron?.getXaiKeyStatus
    setStatus(get ? await get() : { configured: false, source: 'none', canPersistKey: false })
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const save = async () => {
    const setKey = window.electron?.setXaiApiKey
    if (!setKey || !keyInput.trim()) return
    setSaving(true)
    try {
      const res = await setKey(keyInput.trim())
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setKeyInput('')
      toast.success('API key saved')
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  const clear = async () => {
    const res = await window.electron?.clearXaiApiKey?.()
    setClearOpen(false)
    if (res && !res.ok) {
      toast.error(res.error)
      return
    }
    toast.message('Saved API key removed')
    await refresh()
  }

  return (
    <SettingsSection id="gf-settings-xai-key" title="xAI API key (voice)" description={keyStatusDescription(status)}>
      {status?.maskedHint && status.source === 'stored' ? (
        <p className="mb-3 font-mono text-xs text-zinc-500">
          Saved key: <span className="text-zinc-300">{status.maskedHint}</span>
        </p>
      ) : null}
      {status !== null && !status.canPersistKey ? (
        <p className="mb-3 rounded-xl border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-200/90">
          Secure storage is unavailable on this machine, so keys can't be saved in the app. Set{' '}
          <span className="font-mono text-xs">XAI_API_KEY</span> in your environment instead.
        </p>
      ) : null}
      <div className="space-y-3">
        <Input
          type="password"
          autoComplete="off"
          spellCheck={false}
          maxLength={XAI_API_KEY_MAX_LEN}
          aria-label="xAI API key"
          placeholder={status?.configured ? 'Paste to replace the saved key…' : 'Paste your xAI API key…'}
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          disabled={saving || !status?.canPersistKey}
          className="h-11 rounded-xl border-zinc-800 bg-zinc-900 font-mono text-sm text-zinc-100 placeholder:text-zinc-600"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="rounded-xl"
            disabled={saving || !status?.canPersistKey || !keyInput.trim()}
            onClick={() => void save()}
          >
            {saving ? 'Saving…' : 'Save key'}
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
          <Button
            type="button"
            variant="ghost"
            className="gap-1.5 rounded-xl text-zinc-400 hover:text-white"
            onClick={() => openHttps(URL_XAI_CONSOLE)}
          >
            Get a key <ExternalLink size={14} aria-hidden />
          </Button>
        </div>
        <p className="text-xs text-zinc-600">
          Saved keys are encrypted by the OS and never sent back to the app window.
        </p>
      </div>

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent className="border-zinc-800 bg-zinc-950 sm:rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Remove saved API key?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Voice will stop working unless XAI_API_KEY is set in your environment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:space-x-0">
            <AlertDialogCancel className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-900">
              Cancel
            </AlertDialogCancel>
            <Button type="button" variant="destructive" className="rounded-xl" onClick={() => void clear()}>
              Remove
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  )
}

export function VoiceSettings({
  project,
  onProjectSaved,
}: {
  project: GrokProjectManifest | null | undefined
  onProjectSaved?: (manifest: GrokProjectManifest) => void
}) {
  return (
    <>
      <VoicePicker project={project} onProjectSaved={onProjectSaved} />
      <XaiKeySection />
    </>
  )
}
