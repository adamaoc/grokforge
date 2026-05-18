import { useEffect, useRef, useState } from 'react'
import {
  WELCOME_META_QUICK_OPEN_MAX,
  isMetaPhysicalKey,
  metaDigitIndexFromCode,
  welcomeKeyboardTargetAllowsGlobalShortcut,
} from './welcome-keyboard-shortcuts'

/**
 * Cmd / Super (Windows/Linux) + 1–9 opens the first visible recent projects in order.
 * While Meta is held, UI can show digit hints (1–9) on the first rows.
 */
export function useWelcomeMetaDigitOpen({
  enabled,
  projectIdsInOpenOrder,
  isLoadingProject,
  onOpenRecent,
}: {
  enabled: boolean
  /** Full MRU order after filter; only the first {@link WELCOME_META_QUICK_OPEN_MAX} are addressable. */
  projectIdsInOpenOrder: string[]
  isLoadingProject: boolean
  onOpenRecent: (projectId: string) => void
}): { metaDigitHintsVisible: boolean } {
  const [metaDigitHintsVisible, setMetaDigitHintsVisible] = useState(false)

  const idsRef = useRef(projectIdsInOpenOrder)
  idsRef.current = projectIdsInOpenOrder

  const loadingRef = useRef(isLoadingProject)
  loadingRef.current = isLoadingProject

  const onOpenRef = useRef(onOpenRecent)
  onOpenRef.current = onOpenRecent

  useEffect(() => {
    if (!enabled) {
      setMetaDigitHintsVisible(false)
      return
    }

    const clearHints = () => setMetaDigitHintsVisible(false)

    const onKeyDown = (e: KeyboardEvent) => {
      if (!welcomeKeyboardTargetAllowsGlobalShortcut(e.target)) return

      if (isMetaPhysicalKey(e)) {
        setMetaDigitHintsVisible(true)
        return
      }

      if (!e.metaKey || e.ctrlKey || e.altKey) return

      const idx = metaDigitIndexFromCode(e.code)
      if (idx === null) return

      const ids = idsRef.current.slice(0, WELCOME_META_QUICK_OPEN_MAX)
      if (idx >= ids.length) return

      e.preventDefault()
      e.stopPropagation()
      if (!loadingRef.current) {
        onOpenRef.current(ids[idx]!)
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (isMetaPhysicalKey(e)) {
        setMetaDigitHintsVisible(false)
      }
    }

    const onWindowBlur = () => clearHints()

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') clearHints()
    }

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    window.addEventListener('blur', onWindowBlur)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
      window.removeEventListener('blur', onWindowBlur)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [enabled])

  return { metaDigitHintsVisible }
}
