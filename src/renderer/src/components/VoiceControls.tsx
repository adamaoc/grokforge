import { useMemo } from 'react'
import { Mic, MicOff, MessageSquareText } from 'lucide-react'
import type { GrokProjectManifest } from '@/types'
import { getModelForIntent, getHarnessProfile, resolveHarnessProfileKey } from '@/types'
import { ModelBadge } from '@/components/grokforge/ModelBadge'
import { motion } from 'framer-motion'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export type VoiceControlsStatus =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'transcribing'
  | 'thinking'
  | 'reading'
  | 'waiting_approval'
  | 'speaking'
  | 'error'

interface VoiceControlsProps {
  isActive: boolean
  status: VoiceControlsStatus
  lastError: string | null
  onToggle: () => void
  /** Hand off the current thread to typed agent chat (tools / files). */
  onContinueInAgentChat?: () => void | Promise<void>
  project: GrokProjectManifest
}

export function VoiceControls({
  isActive,
  status,
  lastError,
  onToggle,
  onContinueInAgentChat,
  project,
}: VoiceControlsProps) {
  const voiceModel = useMemo(() => getModelForIntent(project, 'voice'), [project])
  const voiceHarness = useMemo(() => {
    const key = resolveHarnessProfileKey(voiceModel)
    return { key, displayName: getHarnessProfile(key).displayName }
  }, [voiceModel])
  const voiceDisabled = project.voice.defaultVoiceMode === 'off'

  const getStatusText = () => {
    if (voiceDisabled) return 'Voice is disabled for this project.'
    switch (status) {
      case 'connecting':
        return 'Connecting to Grok Voice…'
      case 'listening':
        return 'Listening — speak naturally'
      case 'transcribing':
        return 'Transcribing your request…'
      case 'thinking':
        return 'Grok is thinking…'
      case 'reading':
        return 'Reading project context…'
      case 'waiting_approval':
        return 'Waiting for your approval…'
      case 'speaking':
        return 'Speaking response'
      case 'error':
        return `${lastError ?? 'Voice error'} — tap to retry`
      default:
        return 'Voice ready — tap to start full-duplex'
    }
  }

  const getStatusColor = () => {
    if (status === 'listening') return 'text-primary'
    if (status === 'error') return 'text-red-400/90'
    if (
      status === 'thinking' ||
      status === 'speaking' ||
      status === 'connecting' ||
      status === 'transcribing' ||
      status === 'reading' ||
      status === 'waiting_approval'
    ) return 'text-amber-400'
    return 'text-zinc-400'
  }

  const showMicOff = isActive && status !== 'error'

  const button = (
    <motion.button
      type="button"
      whileTap={{ scale: 0.92 }}
      onClick={() => void onToggle()}
      disabled={status === 'connecting' || voiceDisabled}
      aria-label={
        voiceDisabled
          ? 'Voice disabled'
          : status === 'error'
            ? 'Retry voice session'
            : showMicOff
              ? 'Stop voice session'
              : 'Start voice session'
      }
      aria-pressed={isActive && status !== 'error'}
      className={`flex h-14 w-14 items-center justify-center rounded-2xl transition-all duration-200 ${
        status === 'connecting' || voiceDisabled
          ? 'cursor-not-allowed border border-zinc-700 bg-zinc-900 text-zinc-500'
          : status === 'error'
            ? 'cursor-pointer border border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/15'
            : showMicOff
              ? 'border border-red-500/30 bg-red-500/10 text-red-400'
              : 'border border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800'
      }`}
    >
      {showMicOff ? <MicOff size={24} aria-hidden /> : <Mic size={24} aria-hidden />}
    </motion.button>
  )

  return (
    <div className="gf-no-drag flex h-20 items-center justify-between border-t border-zinc-800 bg-zinc-950 px-6">
      <div className="flex items-center gap-4">
        {voiceDisabled ? (
          <Tooltip>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent side="top" className="max-w-[260px] text-xs">
              Voice disabled in project settings (defaultVoiceMode: off).
            </TooltipContent>
          </Tooltip>
        ) : (
          button
        )}

        <div>
          <div className="flex items-center gap-2">
            <div
              className={`font-semibold ${isActive || status === 'connecting' ? 'text-white' : 'text-zinc-400'}`}
            >
              {voiceDisabled
                ? 'Voice off'
                : status === 'error'
                  ? 'Voice issue'
                  : isActive || status === 'connecting'
                    ? 'Voice Session Active'
                    : 'Voice Mode'}
            </div>
            <ModelBadge variant="voice" title={voiceModel}>
              {voiceModel}
            </ModelBadge>
            <ModelBadge variant="capsule" title={`Harness profile: ${voiceHarness.key}`}>
              {voiceHarness.displayName}
            </ModelBadge>
          </div>
          <div className={`text-sm ${getStatusColor()} transition-colors`}>{getStatusText()}</div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {onContinueInAgentChat && !voiceDisabled ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => void onContinueInAgentChat()}
                className="shrink-0 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-200 transition-colors hover:border-zinc-600 hover:bg-zinc-800 hover:text-white"
              >
                <span className="inline-flex items-center gap-1.5">
                  <MessageSquareText size={14} className="shrink-0 opacity-90" aria-hidden />
                  Continue in agent chat
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[280px] text-xs">
              Stops voice (if active) and starts a typed agent turn with recent thread context so tools can read and
              edit files.
            </TooltipContent>
          </Tooltip>
        ) : null}

        <div className="flex items-center gap-8 text-sm">
          <div className="flex items-center gap-2 text-zinc-400">
            <div className="h-4 w-px bg-zinc-800" />
            Full-duplex • Real-time
          </div>

          <ModelBadge variant="capsule" title={project.voice.defaultVoiceMode}>
            {project.voice.defaultVoiceMode}
          </ModelBadge>
        </div>
      </div>
    </div>
  )
}
