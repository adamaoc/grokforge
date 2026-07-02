import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Ban, Copy, Loader2, Plus, RotateCcw, Square, Terminal, Trash2, X } from 'lucide-react'
import type { GrokProjectManifest, Root } from '@/types'
import {
  TERMINAL_SESSION_DEFAULT_COLS,
  TERMINAL_SESSION_DEFAULT_ROWS,
} from '@/types'
import { Button } from '@/components/ui/button'
import { TerminalEmulator, type TerminalEmulatorHandle } from '@/components/terminal/TerminalEmulator'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface TerminalPanelProps {
  project: GrokProjectManifest
  open: boolean
  onClose: () => void
  onOpenFileLink?: (path: string, line: number) => void
  /** Count of tabs with a live or starting PTY (for workspace chrome). */
  onRunningSessionsChange?: (count: number) => void
}

type TerminalState = 'starting' | 'running' | 'exited' | 'error'

type TerminalTab = {
  id: string
  rootId: string
  rootLabel: string
  sessionId: string | null
  cwd: string
  shell: string
  state: TerminalState
  status: string
  buffer: string
}

const MAX_TERMINAL_BUFFER_CHARS = 500_000
const TERMINAL_TRUST_NOTICE_KEY = 'grokforge.terminalTrustNoticeDismissed'

function fallbackRoot(project: GrokProjectManifest): Root | null {
  return project.roots[0] ?? null
}

function shellBasename(shell: string): string {
  return shell.split(/[\\/]/).filter(Boolean).pop() || shell || 'shell'
}

export function TerminalPanel({
  project,
  open,
  onClose,
  onOpenFileLink,
  onRunningSessionsChange,
}: TerminalPanelProps) {
  const firstRoot = fallbackRoot(project)
  const [tabs, setTabs] = useState<TerminalTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [newRootId, setNewRootId] = useState(firstRoot?.id ?? '')
  const [showTrustNotice, setShowTrustNotice] = useState(
    () => window.localStorage.getItem(TERMINAL_TRUST_NOTICE_KEY) !== '1',
  )
  const terminalRef = useRef<TerminalEmulatorHandle>(null)
  const hasOpenedRef = useRef(false)
  const activeTabIdRef = useRef<string | null>(null)
  const tabsRef = useRef<TerminalTab[]>([])
  const latestSizeRef = useRef({
    cols: TERMINAL_SESSION_DEFAULT_COLS,
    rows: TERMINAL_SESSION_DEFAULT_ROWS,
  })

  useEffect(() => {
    tabsRef.current = tabs
  }, [tabs])

  useEffect(() => {
    if (!onRunningSessionsChange) return
    const n = tabs.filter((t) => t.state === 'running' || t.state === 'starting').length
    onRunningSessionsChange(n)
  }, [onRunningSessionsChange, tabs])

  useEffect(() => {
    activeTabIdRef.current = activeTabId
  }, [activeTabId])

  const rootById = useMemo(() => {
    return new Map(project.roots.map((root) => [root.id, root]))
  }, [project.roots])

  const updateTab = useCallback((tabId: string, patch: Partial<TerminalTab>) => {
    setTabs((prev) => prev.map((tab) => (tab.id === tabId ? { ...tab, ...patch } : tab)))
  }, [])

  const appendTabBuffer = useCallback((sessionId: string, data: string) => {
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.sessionId !== sessionId) return tab
        const next = tab.buffer + data
        return {
          ...tab,
          buffer: next.length > MAX_TERMINAL_BUFFER_CHARS ? next.slice(-MAX_TERMINAL_BUFFER_CHARS) : next,
        }
      }),
    )
  }, [])

  const killSession = useCallback(async (sessionId: string | null) => {
    if (!sessionId) return
    const res = await window.electron?.terminalSessionKill?.({ sessionId })
    if (res && !res.ok && res.code !== 'unknown_session') toast.error(res.error)
  }, [])

  const startTabSession = useCallback(
    async (tabId: string, rootId: string) => {
      const api = window.electron?.terminalSessionStart
      if (!api) {
        updateTab(tabId, { state: 'error', status: 'Terminal bridge unavailable' })
        toast.error('PTY terminal requires the GrokForge desktop app.')
        return
      }
      updateTab(tabId, { sessionId: null, state: 'starting', status: 'Starting...', buffer: '' })
      const res = await api({ rootId, ...latestSizeRef.current })
      if (!res.ok) {
        updateTab(tabId, { state: 'error', status: res.error })
        toast.error(res.error)
        return
      }
      const root = rootById.get(rootId)
      updateTab(tabId, {
        sessionId: res.session.sessionId,
        cwd: res.session.cwd,
        shell: res.session.shell,
        rootLabel: root?.label ?? res.session.rootId,
        state: 'running',
        status: 'Running',
      })
      if (activeTabIdRef.current === tabId) {
        window.requestAnimationFrame(() => terminalRef.current?.focus())
      }
    },
    [rootById, updateTab],
  )

  const createTab = useCallback(
    (rootId: string) => {
      const root = rootById.get(rootId) ?? fallbackRoot(project)
      if (!root) {
        toast.error('No workspace root available for terminal.')
        return
      }
      const tab: TerminalTab = {
        id: crypto.randomUUID(),
        rootId: root.id,
        rootLabel: root.label,
        sessionId: null,
        cwd: root.path,
        shell: '',
        state: 'starting',
        status: 'Starting...',
        buffer: '',
      }
      setTabs((prev) => [...prev, tab])
      setActiveTabId(tab.id)
      void startTabSession(tab.id, root.id)
    },
    [project, rootById, startTabSession],
  )

  useEffect(() => {
    if (!open || hasOpenedRef.current || tabs.length > 0 || !firstRoot) return
    hasOpenedRef.current = true
    createTab(firstRoot.id)
  }, [createTab, firstRoot, open, tabs.length])

  useEffect(() => {
    const unsubData = window.electron?.onTerminalSessionData?.((payload) => {
      appendTabBuffer(payload.sessionId, payload.data)
      const active = tabsRef.current.find((tab) => tab.id === activeTabIdRef.current)
      if (open && active?.sessionId === payload.sessionId) terminalRef.current?.write(payload.data)
    })
    const unsubExit = window.electron?.onTerminalSessionExit?.((payload) => {
      setTabs((prev) =>
        prev.map((tab) => {
          if (tab.sessionId !== payload.sessionId) return tab
          const bits = [`exit ${payload.exitCode ?? '?'}`]
          if (payload.signal) bits.push(`signal ${payload.signal}`)
          return { ...tab, sessionId: null, state: 'exited', status: bits.join(' · ') }
        }),
      )
    })
    const unsubError = window.electron?.onTerminalSessionError?.((payload) => {
      if (payload.sessionId) {
        setTabs((prev) =>
          prev.map((tab) =>
            tab.sessionId === payload.sessionId
              ? { ...tab, state: 'error', status: payload.error, sessionId: null }
              : tab,
          ),
        )
      }
      toast.error(payload.error)
    })
    return () => {
      unsubData?.()
      unsubExit?.()
      unsubError?.()
    }
  }, [appendTabBuffer, open])

  useEffect(() => {
    return () => {
      for (const tab of tabsRef.current) void killSession(tab.sessionId)
    }
  }, [killSession])

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? null

  const dismissTrustNotice = () => {
    window.localStorage.setItem(TERMINAL_TRUST_NOTICE_KEY, '1')
    setShowTrustNotice(false)
  }

  useEffect(() => {
    if (!open || !activeTabId) return
    const tab = tabsRef.current.find((item) => item.id === activeTabId)
    if (!tab) return
    terminalRef.current?.clear()
    terminalRef.current?.write(tab.buffer)
    window.requestAnimationFrame(() => {
      const size = terminalRef.current?.fit()
      if (size) latestSizeRef.current = size
      terminalRef.current?.focus()
    })
  }, [activeTabId, open])

  const sendInput = useCallback(async (data: string) => {
    const active = tabsRef.current.find((tab) => tab.id === activeTabIdRef.current)
    if (!active?.sessionId) return
    const res = await window.electron?.terminalSessionInput?.({ sessionId: active.sessionId, data })
    if (res && !res.ok) toast.error(res.error)
  }, [])

  const handleResize = useCallback((size: { cols: number; rows: number }) => {
    latestSizeRef.current = size
    const active = tabsRef.current.find((tab) => tab.id === activeTabIdRef.current)
    if (!active?.sessionId) return
    void window.electron?.terminalSessionResize?.({ sessionId: active.sessionId, ...size })
  }, [])

  const closeTab = async (tabId: string) => {
    const tab = tabsRef.current.find((item) => item.id === tabId)
    if (!tab) return
    if (tab.sessionId && !window.confirm(`Close running terminal "${tab.rootLabel}"? This will kill the shell.`)) return
    await killSession(tab.sessionId)
    setTabs((prev) => {
      const next = prev.filter((item) => item.id !== tabId)
      if (activeTabIdRef.current === tabId) {
        setActiveTabId(next.at(-1)?.id ?? null)
      }
      return next
    })
  }

  const killActive = async () => {
    if (!activeTab) return
    await killSession(activeTab.sessionId)
    updateTab(activeTab.id, { sessionId: null, state: 'exited', status: 'Killed' })
  }

  const restartActive = async () => {
    if (!activeTab) return
    await killSession(activeTab.sessionId)
    void startTabSession(activeTab.id, activeTab.rootId)
  }

  const copyActiveBuffer = async () => {
    if (!activeTab?.buffer) return
    const res = await window.electron?.writeClipboardText?.(activeTab.buffer)
    if (res?.ok) toast.success('Terminal output copied')
    else toast.error(res?.error || 'Could not copy terminal output')
  }

  if (!open) return null

  const stateTone =
    activeTab?.state === 'running'
      ? 'text-gf-accent'
      : activeTab?.state === 'starting'
        ? 'text-zinc-300'
        : activeTab?.state === 'error'
          ? 'text-red-300'
          : 'text-zinc-500'

  return (
    <div className="flex h-full min-h-0 flex-col border-t border-zinc-800 bg-zinc-950">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-800 px-2 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <Terminal size={15} className="mx-1 shrink-0 text-zinc-500" aria-hidden />
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto custom-scrollbar">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={cn(
                  'group flex max-w-56 shrink-0 items-center gap-2 rounded-lg border px-2 py-1 text-xs transition-colors',
                  tab.id === activeTab?.id
                    ? 'border-zinc-700 bg-zinc-900 text-white'
                    : 'border-transparent text-zinc-400 hover:bg-zinc-900/80 hover:text-zinc-200',
                )}
                onClick={() => setActiveTabId(tab.id)}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 shrink-0 rounded-full',
                    tab.state === 'running'
                      ? 'bg-gf-accent'
                      : tab.state === 'starting'
                        ? 'bg-zinc-400'
                        : tab.state === 'error'
                          ? 'bg-red-400'
                          : 'bg-zinc-600',
                  )}
                />
                <span className="truncate font-mono text-[11px]">
                  {tab.rootLabel}:{shellBasename(tab.shell)}
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  className="rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-white"
                  aria-label={`Close terminal ${tab.rootLabel}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    void closeTab(tab.id)
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return
                    e.preventDefault()
                    e.stopPropagation()
                    void closeTab(tab.id)
                  }}
                >
                  <X size={12} />
                </span>
              </button>
            ))}
          </div>
          <select
            value={newRootId}
            onChange={(e) => setNewRootId(e.target.value)}
            className="h-8 max-w-36 shrink-0 rounded-lg border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-200"
            aria-label="New terminal root"
          >
            {project.roots.map((root) => (
              <option key={root.id} value={root.id}>
                {root.label}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg text-zinc-400 hover:text-white"
            title="New terminal"
            aria-label="New terminal"
            onClick={() => createTab(newRootId)}
          >
            <Plus size={15} />
          </Button>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className={cn('hidden max-w-80 truncate font-mono text-[10px] md:block', stateTone)} title={activeTab?.cwd}>
            {activeTab ? `${activeTab.status} · ${activeTab.cwd}` : 'No terminal'}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg text-zinc-400 hover:text-white"
            title="Send Ctrl+C"
            aria-label="Send Ctrl+C"
            disabled={!activeTab?.sessionId}
            onClick={() => void sendInput('\x03')}
          >
            <Ban size={14} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg text-zinc-400 hover:text-white"
            title="Kill terminal session"
            aria-label="Kill terminal session"
            disabled={!activeTab?.sessionId}
            onClick={() => void killActive()}
          >
            <Square size={14} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg text-zinc-400 hover:text-white"
            title="Restart terminal session"
            aria-label="Restart terminal session"
            disabled={!activeTab}
            onClick={() => void restartActive()}
          >
            {activeTab?.state === 'starting' ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg text-zinc-400 hover:text-white"
            title="Copy terminal output"
            aria-label="Copy terminal output"
            disabled={!activeTab?.buffer}
            onClick={() => void copyActiveBuffer()}
          >
            <Copy size={14} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg text-zinc-400 hover:text-white"
            title="Clear scrollback"
            aria-label="Clear terminal scrollback"
            disabled={!activeTab}
            onClick={() => {
              if (!activeTab) return
              terminalRef.current?.clear()
              updateTab(activeTab.id, { buffer: '' })
            }}
          >
            <Trash2 size={14} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg text-zinc-400 hover:text-white"
            title="Hide terminal panel"
            aria-label="Hide terminal panel"
            onClick={onClose}
          >
            <X size={16} />
          </Button>
        </div>
      </div>

      {showTrustNotice ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-xs text-zinc-400">
          <AlertTriangle size={14} className="shrink-0 text-amber-300" aria-hidden />
          <span className="min-w-0 flex-1">
            Terminal sessions start in the root selected in this panel. It is trusted developer tooling, not a sandbox or an agent command surface.
          </span>
          <button
            type="button"
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-white"
            aria-label="Dismiss terminal safety note"
            onClick={dismissTrustNotice}
          >
            <X size={13} aria-hidden />
          </button>
        </div>
      ) : null}

      {activeTab ? (
        <TerminalEmulator
          ref={terminalRef}
          onInput={(data) => void sendInput(data)}
          onResize={handleResize}
          cwd={activeTab.cwd}
          roots={project.roots}
          onOpenFileLink={onOpenFileLink}
        />
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-zinc-500">
          No terminal sessions. Create one with the + button.
        </div>
      )}
    </div>
  )
}
