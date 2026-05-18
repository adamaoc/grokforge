/**
 * PTY-backed terminal session IPC contract.
 *
 * Human terminal sessions are trusted developer tooling. They start in a workspace
 * root cwd, but they are not sandboxed or jailed. Model/tool command execution
 * must continue to use the agent **`run_command`** tool (main-process guarded spawn after user approval), not PTY input.
 */

export const TERMINAL_SESSION_MIN_COLS = 20
export const TERMINAL_SESSION_MAX_COLS = 300
export const TERMINAL_SESSION_DEFAULT_COLS = 80
export const TERMINAL_SESSION_MIN_ROWS = 5
export const TERMINAL_SESSION_MAX_ROWS = 100
export const TERMINAL_SESSION_DEFAULT_ROWS = 24
export const TERMINAL_SESSION_MAX_INPUT_CHARS = 64_000
export const TERMINAL_SESSION_MAX_SHELL_CHARS = 512

export type TerminalSessionStartRequest = {
  rootId: string
  cols: number
  rows: number
  shell?: string
}

export type TerminalSessionStarted = {
  sessionId: string
  rootId: string
  cwd: string
  shell: string
}

export type TerminalSessionStartResult =
  | { ok: true; session: TerminalSessionStarted }
  | { ok: false; error: string; code?: 'invalid' | 'no_project' | 'unknown_root' | 'missing_root' | 'start_failed' }

export type TerminalSessionInputRequest = {
  sessionId: string
  /** Renderer/user keystrokes only. Model command tools must use guarded `run_command`, not PTY input. */
  data: string
}

export type TerminalSessionResizeRequest = {
  sessionId: string
  cols: number
  rows: number
}

export type TerminalSessionKillRequest = {
  sessionId: string
}

export type TerminalSessionMutationResult =
  | { ok: true }
  | { ok: false; error: string; code?: 'invalid' | 'unknown_session' }

export type TerminalSessionData = {
  sessionId: string
  data: string
}

export type TerminalSessionExit = {
  sessionId: string
  exitCode: number | null
  signal?: string | null
}

export type TerminalSessionError = {
  sessionId?: string
  error: string
}
