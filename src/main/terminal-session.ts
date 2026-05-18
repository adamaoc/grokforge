import { randomUUID } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import type { BrowserWindow } from 'electron'
import * as pty from 'node-pty'
import type { GrokProjectManifest } from './manifest'
import {
  TERMINAL_SESSION_DEFAULT_COLS,
  TERMINAL_SESSION_DEFAULT_ROWS,
  TERMINAL_SESSION_MAX_COLS,
  TERMINAL_SESSION_MAX_INPUT_CHARS,
  TERMINAL_SESSION_MAX_ROWS,
  TERMINAL_SESSION_MAX_SHELL_CHARS,
  TERMINAL_SESSION_MIN_COLS,
  TERMINAL_SESSION_MIN_ROWS,
  type TerminalSessionData,
  type TerminalSessionError,
  type TerminalSessionExit,
  type TerminalSessionInputRequest,
  type TerminalSessionKillRequest,
  type TerminalSessionMutationResult,
  type TerminalSessionResizeRequest,
  type TerminalSessionStartRequest,
  type TerminalSessionStartResult,
} from '../shared/terminal-session-contract'

type PtyProcessLike = {
  pid: number
  process: string
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(signal?: string): void
  onData(handler: (data: string) => void): { dispose(): void }
  onExit(handler: (event: { exitCode: number; signal?: number | string }) => void): { dispose(): void }
}

type PtyFactory = {
  spawn(
    file: string,
    args: string[],
    options: {
      name: string
      cols: number
      rows: number
      cwd: string
      env: NodeJS.ProcessEnv
    },
  ): PtyProcessLike
}

type TerminalSessionRecord = {
  id: string
  rootId: string
  cwd: string
  shell: string
  pty: PtyProcessLike
  disposables: Array<{ dispose(): void }>
}

const sessions = new Map<string, TerminalSessionRecord>()
let targetWindow: BrowserWindow | null = null
let ptyFactory: PtyFactory = pty

export function setTerminalSessionTargetWindow(win: BrowserWindow | null): void {
  targetWindow = win
}

export function setTerminalSessionPtyFactoryForTests(factory: PtyFactory): void {
  ptyFactory = factory
}

export function resetTerminalSessionPtyFactoryForTests(): void {
  ptyFactory = pty
}

function emitData(payload: TerminalSessionData): void {
  targetWindow?.webContents.send('terminal-session-data', payload)
}

function emitExit(payload: TerminalSessionExit): void {
  targetWindow?.webContents.send('terminal-session-exit', payload)
}

function emitError(payload: TerminalSessionError): void {
  targetWindow?.webContents.send('terminal-session-error', payload)
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback
  return Math.min(max, Math.max(min, n))
}

export function parseTerminalSessionStartRequest(raw: unknown): TerminalSessionStartRequest | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  if (typeof p.rootId !== 'string' || !p.rootId.trim()) return null
  const shell = typeof p.shell === 'string' && p.shell.trim()
    ? p.shell.trim().slice(0, TERMINAL_SESSION_MAX_SHELL_CHARS)
    : undefined
  return {
    rootId: p.rootId.trim(),
    cols: clampInt(p.cols, TERMINAL_SESSION_MIN_COLS, TERMINAL_SESSION_MAX_COLS, TERMINAL_SESSION_DEFAULT_COLS),
    rows: clampInt(p.rows, TERMINAL_SESSION_MIN_ROWS, TERMINAL_SESSION_MAX_ROWS, TERMINAL_SESSION_DEFAULT_ROWS),
    shell,
  }
}

export function parseTerminalSessionInputRequest(raw: unknown): TerminalSessionInputRequest | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  if (typeof p.sessionId !== 'string' || !p.sessionId.trim()) return null
  if (typeof p.data !== 'string') return null
  return { sessionId: p.sessionId.trim(), data: p.data.slice(0, TERMINAL_SESSION_MAX_INPUT_CHARS) }
}

export function parseTerminalSessionResizeRequest(raw: unknown): TerminalSessionResizeRequest | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  if (typeof p.sessionId !== 'string' || !p.sessionId.trim()) return null
  return {
    sessionId: p.sessionId.trim(),
    cols: clampInt(p.cols, TERMINAL_SESSION_MIN_COLS, TERMINAL_SESSION_MAX_COLS, TERMINAL_SESSION_DEFAULT_COLS),
    rows: clampInt(p.rows, TERMINAL_SESSION_MIN_ROWS, TERMINAL_SESSION_MAX_ROWS, TERMINAL_SESSION_DEFAULT_ROWS),
  }
}

export function parseTerminalSessionKillRequest(raw: unknown): TerminalSessionKillRequest | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  if (typeof p.sessionId !== 'string' || !p.sessionId.trim()) return null
  return { sessionId: p.sessionId.trim() }
}

function buildTerminalEnv(): NodeJS.ProcessEnv {
  const keys = [
    'PATH',
    'HOME',
    'USER',
    'USERNAME',
    'LOGNAME',
    'SHELL',
    'LANG',
    'LC_ALL',
    'LC_CTYPE',
    'TZ',
    'TMPDIR',
    'TEMP',
    'TMP',
    'APPDATA',
    'LOCALAPPDATA',
    'USERPROFILE',
    'SystemRoot',
    'WINDIR',
    'PATHEXT',
    'OS',
  ]
  const env: NodeJS.ProcessEnv = {}
  for (const k of keys) {
    if (process.env[k] !== undefined) env[k] = process.env[k]
  }
  env.TERM = env.TERM || 'xterm-256color'
  env.GROKFORGE_TERMINAL = '1'
  return env
}

function defaultShell(): string {
  if (process.platform === 'win32') return process.env.COMSPEC || 'cmd.exe'
  return process.env.SHELL || '/bin/zsh'
}

function normalizeSignal(signal: string | number | undefined): string | null {
  if (signal === undefined || signal === 0) return null
  return String(signal)
}

export function startTerminalSession(
  project: GrokProjectManifest | null,
  raw: TerminalSessionStartRequest,
): TerminalSessionStartResult {
  if (!project) return { ok: false, error: 'No project loaded', code: 'no_project' }
  const root = project.roots.find((r) => r.id === raw.rootId)
  if (!root) return { ok: false, error: 'Unknown workspace root', code: 'unknown_root' }
  const cwd = resolve(root.path)
  if (!existsSync(cwd)) return { ok: false, error: 'Root path does not exist on disk', code: 'missing_root' }
  try {
    if (!statSync(cwd).isDirectory()) {
      return { ok: false, error: 'Root path is not a directory', code: 'missing_root' }
    }
  } catch {
    return { ok: false, error: 'Root path could not be inspected', code: 'missing_root' }
  }

  const shell = raw.shell || defaultShell()
  const sessionId = randomUUID()
  let proc: PtyProcessLike
  try {
    proc = ptyFactory.spawn(shell, [], {
      name: 'xterm-256color',
      cols: raw.cols,
      rows: raw.rows,
      cwd,
      env: buildTerminalEnv(),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to start terminal session'
    return { ok: false, error: msg, code: 'start_failed' }
  }

  const record: TerminalSessionRecord = {
    id: sessionId,
    rootId: root.id,
    cwd,
    shell,
    pty: proc,
    disposables: [],
  }
  record.disposables.push(proc.onData((data) => emitData({ sessionId, data })))
  record.disposables.push(proc.onExit((event) => {
    sessions.delete(sessionId)
    for (const d of record.disposables) d.dispose()
    emitExit({ sessionId, exitCode: event.exitCode, signal: normalizeSignal(event.signal) })
  }))
  sessions.set(sessionId, record)

  return { ok: true, session: { sessionId, rootId: root.id, cwd, shell } }
}

export function writeTerminalSessionInput(raw: TerminalSessionInputRequest): TerminalSessionMutationResult {
  const session = sessions.get(raw.sessionId)
  if (!session) return { ok: false, error: 'Unknown terminal session', code: 'unknown_session' }
  try {
    session.pty.write(raw.data)
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to write terminal input'
    emitError({ sessionId: raw.sessionId, error: msg })
    return { ok: false, error: msg, code: 'invalid' }
  }
}

export function resizeTerminalSession(raw: TerminalSessionResizeRequest): TerminalSessionMutationResult {
  const session = sessions.get(raw.sessionId)
  if (!session) return { ok: false, error: 'Unknown terminal session', code: 'unknown_session' }
  try {
    session.pty.resize(raw.cols, raw.rows)
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to resize terminal session'
    emitError({ sessionId: raw.sessionId, error: msg })
    return { ok: false, error: msg, code: 'invalid' }
  }
}

export function killTerminalSession(raw: TerminalSessionKillRequest): TerminalSessionMutationResult {
  const session = sessions.get(raw.sessionId)
  if (!session) return { ok: false, error: 'Unknown terminal session', code: 'unknown_session' }
  try {
    session.pty.kill()
    sessions.delete(raw.sessionId)
    for (const d of session.disposables) d.dispose()
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to kill terminal session'
    emitError({ sessionId: raw.sessionId, error: msg })
    return { ok: false, error: msg, code: 'invalid' }
  }
}

export function killAllTerminalSessions(): void {
  for (const id of [...sessions.keys()]) {
    killTerminalSession({ sessionId: id })
  }
}

export function terminalSessionCountForTests(): number {
  return sessions.size
}
