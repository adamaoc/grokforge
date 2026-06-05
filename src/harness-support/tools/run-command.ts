import { randomUUID } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { GrokProjectManifest } from '../../main/manifest'
import { evaluateRunCommandPolicy } from '../policy/command/run-command-policy'
import {
  RUN_COMMAND_MAX_COMMAND_LEN,
  RUN_COMMAND_MAX_OUTPUT_CHARS,
  type RunCommandChunkPayload,
  type RunCommandRequest,
  type RunCommandResult,
} from './contracts/run-command-contract'

function buildSanitizedEnv(): NodeJS.ProcessEnv {
  const keys = [
    'PATH',
    'HOME',
    'USER',
    'USERNAME',
    'LOGNAME',
    'SHELL',
    'LANG',
    'LC_ALL',
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
  return env
}

export type AgentRunCommandResult = RunCommandResult & { output: string }

export function runCommandInRootForAgent(
  project: GrokProjectManifest | null,
  raw: RunCommandRequest,
  onChunk?: (payload: RunCommandChunkPayload) => void,
): Promise<AgentRunCommandResult> {
  let output = ''
  return runCommandInternal(project, raw, {
    onChunk: (payload) => {
      const prefix = payload.channel === 'stderr' ? '[stderr] ' : ''
      output += `${prefix}${payload.text}`
      onChunk?.(payload)
    },
  }).then((result) => ({ ...result, output }))
}

function runCommandInternal(
  project: GrokProjectManifest | null,
  raw: RunCommandRequest,
  events: {
    onChunk?: (payload: RunCommandChunkPayload) => void
  },
): Promise<RunCommandResult> {
  if (!project) {
    return Promise.resolve({ ok: false, error: 'No project loaded', code: 'no_project' })
  }

  const command = raw.command.trim()
  if (!command.length) {
    return Promise.resolve({ ok: false, error: 'Command is empty', code: 'invalid' })
  }
  if (command.length > RUN_COMMAND_MAX_COMMAND_LEN) {
    return Promise.resolve({
      ok: false,
      error: `Command exceeds ${RUN_COMMAND_MAX_COMMAND_LEN} characters`,
      code: 'invalid',
    })
  }

  const policy = evaluateRunCommandPolicy(command, Boolean(raw.acknowledgedDestructive))
  if (policy.kind === 'blocked') {
    return Promise.resolve({ ok: false, error: policy.reason, code: 'blocked' })
  }
  if (policy.kind === 'needs_ack') {
    return Promise.resolve({
      ok: false,
      error: policy.reason,
      code: 'destructive_confirmation_required',
    })
  }

  const root = project.roots.find((r) => r.id === raw.rootId)
  if (!root) {
    return Promise.resolve({ ok: false, error: 'Unknown workspace root', code: 'invalid' })
  }
  const cwd = resolve(root.path)
  if (!existsSync(cwd)) {
    return Promise.resolve({ ok: false, error: 'Root path does not exist on disk', code: 'invalid' })
  }

  const executionId = randomUUID()

  const env = buildSanitizedEnv()

  return new Promise((resolvePromise) => {
    let totalOut = 0
    let truncated = false
    let timedOut = false
    let settled = false

    const safeResolve = (r: RunCommandResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolvePromise(r)
    }

    let child: ChildProcess
    try {
      child = spawn(command, {
        shell: true,
        cwd,
        env,
        windowsHide: true,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to start process'
      safeResolve({ ok: false, error: msg, code: 'invalid' })
      return
    }

    const sendChunk = (channel: 'stdout' | 'stderr', text: string) => {
      if (settled || truncated) return
      let piece = text
      const room = RUN_COMMAND_MAX_OUTPUT_CHARS - totalOut
      if (piece.length > room) {
        piece = room > 0 ? piece.slice(0, room) : ''
        truncated = true
      }
      totalOut += piece.length
      if (piece.length > 0) {
        events.onChunk?.({
          executionId,
          channel,
          text: piece,
        })
      }
      if (truncated) {
        events.onChunk?.({
          executionId,
          channel: 'stderr',
          text: '\n[GrokForge] Output cap reached; process was terminated.\n',
        })
        void killChild()
      }
    }

    const killChild = async () => {
      if (child.killed) return
      child.kill('SIGTERM')
      await new Promise((r) => setTimeout(r, 350))
      if (!child.killed) child.kill('SIGKILL')
    }

    const timer = setTimeout(() => {
      if (settled) return
      timedOut = true
      events.onChunk?.({
        executionId,
        channel: 'stderr',
        text: `\n[GrokForge] Timeout after ${raw.timeoutMs} ms; killing process.\n`,
      })
      void killChild()
    }, raw.timeoutMs)

    child.stdout?.on('data', (buf: Buffer) => {
      sendChunk('stdout', buf.toString('utf8'))
    })
    child.stderr?.on('data', (buf: Buffer) => {
      sendChunk('stderr', buf.toString('utf8'))
    })

    child.on('error', (err) => {
      safeResolve({ ok: false, error: err.message, code: 'invalid' })
    })

    child.on('close', (code, signal) => {
      if (settled) return
      safeResolve({
        ok: true,
        executionId,
        exitCode: code,
        signal: signal ?? null,
        truncated,
        timedOut: timedOut || undefined,
      })
    })
  })
}
