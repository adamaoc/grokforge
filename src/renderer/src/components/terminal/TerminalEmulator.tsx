import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { Terminal, type ILink } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { toast } from 'sonner'
import '@xterm/xterm/css/xterm.css'
import { findTerminalFileLinks } from '@/lib/terminal-links'

export type TerminalEmulatorHandle = {
  clear: () => void
  fit: () => { cols: number; rows: number } | null
  focus: () => void
  write: (data: string) => void
}

type TerminalEmulatorProps = {
  onInput: (data: string) => void
  onResize: (size: { cols: number; rows: number }) => void
  cwd: string
  roots: readonly { path: string }[]
  onOpenFileLink?: (path: string, line: number) => void
}

function readCssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

export const TerminalEmulator = forwardRef<TerminalEmulatorHandle, TerminalEmulatorProps>(
  ({ onInput, onResize, cwd, roots, onOpenFileLink }, ref) => {
    const hostRef = useRef<HTMLDivElement>(null)
    const terminalRef = useRef<Terminal | null>(null)
    const fitRef = useRef<FitAddon | null>(null)
    const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null)
    const onInputRef = useRef(onInput)
    const onResizeRef = useRef(onResize)
    const linkContextRef = useRef({ cwd, roots, onOpenFileLink })

    useEffect(() => {
      onInputRef.current = onInput
      onResizeRef.current = onResize
      linkContextRef.current = { cwd, roots, onOpenFileLink }
    }, [cwd, onInput, onOpenFileLink, onResize, roots])

    const fit = () => {
      const terminal = terminalRef.current
      const fitAddon = fitRef.current
      if (!terminal || !fitAddon) return null
      fitAddon.fit()
      const size = { cols: terminal.cols, rows: terminal.rows }
      const last = lastSizeRef.current
      if (!last || last.cols !== size.cols || last.rows !== size.rows) {
        lastSizeRef.current = size
        onResizeRef.current(size)
      }
      return size
    }

    useImperativeHandle(ref, () => ({
      clear: () => terminalRef.current?.clear(),
      fit,
      focus: () => terminalRef.current?.focus(),
      write: (data: string) => terminalRef.current?.write(data),
    }))

    useEffect(() => {
      const host = hostRef.current
      if (!host) return
      const accent = readCssVar('--gf-accent', '#00ff9f')
      const terminal = new Terminal({
        allowProposedApi: false,
        convertEol: true,
        cursorBlink: true,
        cursorStyle: 'block',
        fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 12,
        lineHeight: 1.25,
        scrollback: 8_000,
        theme: {
          background: '#0a0a0a',
          foreground: '#d4d4d8',
          cursor: accent,
          cursorAccent: '#0a0a0a',
          selectionBackground: '#3f3f46',
          black: '#18181b',
          red: '#f87171',
          green: '#4ade80',
          yellow: '#facc15',
          blue: '#60a5fa',
          magenta: '#c084fc',
          cyan: '#22d3ee',
          white: '#e4e4e7',
          brightBlack: '#71717a',
          brightRed: '#fca5a5',
          brightGreen: '#86efac',
          brightYellow: '#fde047',
          brightBlue: '#93c5fd',
          brightMagenta: '#d8b4fe',
          brightCyan: '#67e8f9',
          brightWhite: '#fafafa',
        },
      })
      const fitAddon = new FitAddon()
      terminal.loadAddon(fitAddon)
      terminal.loadAddon(
        new WebLinksAddon((_event, uri) => {
          void (async () => {
            const res = await window.electron?.openExternalUrl?.(uri)
            if (res && !res.ok) toast.error(res.error)
          })()
        }),
      )
      terminal.open(host)
      terminalRef.current = terminal
      fitRef.current = fitAddon
      const dataDisposable = terminal.onData((data) => onInputRef.current(data))
      const fileLinkDisposable = terminal.registerLinkProvider({
        provideLinks: (bufferLineNumber, callback) => {
          const line = terminal.buffer.active.getLine(bufferLineNumber - 1)
          if (!line) {
            callback(undefined)
            return
          }
          const text = line.translateToString(true)
          const ctx = linkContextRef.current
          const links: ILink[] = findTerminalFileLinks(text, { cwd: ctx.cwd, roots: ctx.roots }).map((link) => ({
            text: link.text,
            range: {
              start: { x: link.startIndex + 1, y: bufferLineNumber },
              end: { x: link.endIndex + 1, y: bufferLineNumber },
            },
            activate: () => ctx.onOpenFileLink?.(link.path, link.line),
            decorations: {
              pointerCursor: true,
              underline: true,
            },
          }))
          callback(links.length > 0 ? links : undefined)
        },
      })
      const resizeObserver = new ResizeObserver(() => {
        window.requestAnimationFrame(() => fit())
      })
      resizeObserver.observe(host)
      window.requestAnimationFrame(() => {
        fit()
        terminal.focus()
      })
      return () => {
        dataDisposable.dispose()
        fileLinkDisposable.dispose()
        resizeObserver.disconnect()
        terminal.dispose()
        terminalRef.current = null
        fitRef.current = null
      }
    }, [])

    return (
      <div
        ref={hostRef}
        className="h-full min-h-0 w-full overflow-hidden bg-gf-canvas px-2 py-2 [&_.xterm]:h-full [&_.xterm-viewport]:custom-scrollbar [&_.xterm-viewport]:!bg-gf-canvas"
        onClick={() => terminalRef.current?.focus()}
      />
    )
  },
)

TerminalEmulator.displayName = 'TerminalEmulator'
