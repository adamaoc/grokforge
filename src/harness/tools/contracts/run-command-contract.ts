/**
 * Types and limits for the **main-process only** guarded one-shot shell used by the agent **`run_command`** tool
 * (`runCommandInRootForAgent` in `src/main/run-command.ts`). There is **no** renderer IPC for human-driven
 * one-shot commands; humans use **`terminal-session-*`** PTY + xterm.js instead.
 */

export const RUN_COMMAND_MIN_TIMEOUT_MS = 5_000
export const RUN_COMMAND_MAX_TIMEOUT_MS = 300_000
export const RUN_COMMAND_DEFAULT_TIMEOUT_MS = 120_000

/** Total UTF-8 output (stdout+stderr) captured for the agent tool result; then process is killed if exceeded. */
export const RUN_COMMAND_MAX_OUTPUT_CHARS = 256_000

export const RUN_COMMAND_MAX_COMMAND_LEN = 8_000

export type RunCommandRequest = {
  rootId: string
  command: string
  timeoutMs: number
  /** Set `true` after the user approves a model-requested command in chat (agent path). */
  acknowledgedDestructive?: boolean
}

export type RunCommandStartPayload = {
  executionId: string
}

export type RunCommandChunkPayload = {
  executionId: string
  channel: 'stdout' | 'stderr'
  text: string
}

export type RunCommandOkResult = {
  ok: true
  executionId: string
  exitCode: number | null
  signal: string | null
  truncated: boolean
  timedOut?: boolean
}

export type RunCommandErrorResult = {
  ok: false
  error: string
  code?: 'blocked' | 'destructive_confirmation_required' | 'invalid' | 'no_project'
}

export type RunCommandResult = RunCommandOkResult | RunCommandErrorResult
