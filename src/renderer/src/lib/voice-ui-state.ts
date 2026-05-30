import type { VoiceControlsStatus } from '@/components/VoiceControls'

export type VoiceHeaderIndicator = {
  showActiveDot: boolean
  pillTint: boolean
  tooltip: string
}

/** Auto-expand when a session is starting, live, or needs error attention. */
export function shouldAutoOpenVoicePanel(status: VoiceControlsStatus, isActive: boolean): boolean {
  if (status === 'error') return true
  if (status === 'connecting') return true
  if (isActive) return true
  return false
}

/** Auto-collapse when the session returns to idle after stop or handoff. */
export function shouldAutoCloseVoicePanel(status: VoiceControlsStatus, isActive: boolean): boolean {
  return status === 'idle' && !isActive
}

/** Only collapse after a live session ends — not during toggle()'s internal stop() (connecting → idle). */
export function shouldAutoCollapseVoicePanelOnSessionEnd(
  status: VoiceControlsStatus,
  isActive: boolean,
  prevIsActive: boolean,
): boolean {
  return shouldAutoCloseVoicePanel(status, isActive) && prevIsActive
}

export function voiceHeaderIndicator(
  status: VoiceControlsStatus,
  isActive: boolean,
  panelOpen: boolean,
  voiceDisabled: boolean,
): VoiceHeaderIndicator {
  if (voiceDisabled) {
    return {
      showActiveDot: false,
      pillTint: false,
      tooltip: 'Voice disabled in project settings (defaultVoiceMode: off).',
    }
  }

  const sessionLive = isActive || status === 'connecting'
  const showActiveDot = (sessionLive || status === 'error') && !panelOpen

  if (panelOpen) {
    return {
      showActiveDot: false,
      pillTint: sessionLive || status === 'error',
      tooltip: 'Close voice controls',
    }
  }

  if (status === 'error') {
    return {
      showActiveDot,
      pillTint: true,
      tooltip: 'Voice issue — open voice controls',
    }
  }

  if (sessionLive) {
    return {
      showActiveDot,
      pillTint: true,
      tooltip: 'Show voice controls',
    }
  }

  return {
    showActiveDot: false,
    pillTint: false,
    tooltip: 'Open voice controls',
  }
}
