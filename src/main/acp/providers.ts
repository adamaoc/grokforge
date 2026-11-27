import { execFile } from 'node:child_process'
import { accessSync, constants as fsConstants, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import {
  AGENT_PROVIDER_LABELS,
  type AgentProviderId,
  type AgentProviderStatus,
} from '../../shared/agent/provider-contract'
import type { AcpLaunchSpec } from './connection'

/**
 * Detects coding-agent CLIs the user already has installed (and signed in to with
 * their own subscription) and builds ACP launch specs for them.
 *
 * - Grok Build: `grok agent stdio` speaks ACP natively.
 * - Claude Code: `@agentclientprotocol/claude-agent-acp` (bundled npm dependency) adapts
 *   the user's own `claude` CLI, passed via `CLAUDE_CODE_EXECUTABLE`, so sign-in and
 *   billing stay inside Anthropic's official CLI.
 */

export type AcpProviderId = AgentProviderId

export type AcpProviderDetection = {
  status: AgentProviderStatus
  launch: AcpLaunchSpec | null
  /** Shown when the agent reports it needs authentication. */
  loginHint: string
}

/**
 * Test/E2E override: path to a Node script that speaks ACP over stdio. Used for both ACP
 * providers so UI tests and screenshots run without real CLIs or accounts.
 */
const ENV_ACP_AGENT_OVERRIDE = 'GROKFORGE_ACP_AGENT_OVERRIDE'
const ENV_GROK_PATH = 'GROKFORGE_GROK_PATH'
const ENV_CLAUDE_PATH = 'GROKFORGE_CLAUDE_PATH'

const GROK_LOGIN_HINT =
  'Grok Build needs you to sign in with your SuperGrok / X Premium+ account. Run `grok login` in a terminal (the Terminal panel works), then send your message again.'
const CLAUDE_LOGIN_HINT =
  'Claude Code needs you to sign in. Run `claude` in a terminal and complete `/login` with your Claude subscription, then send your message again.'

/** GUI-launched apps on macOS do not inherit the shell PATH, so also probe common install dirs. */
function candidateDirs(): string[] {
  const home = homedir()
  const fromPath = (process.env.PATH ?? '').split(delimiter).filter(Boolean)
  const extras = [
    join(home, '.local', 'bin'),
    join(home, '.grok', 'bin'),
    join(home, '.claude', 'local'),
    join(home, '.npm-global', 'bin'),
    join(home, '.bun', 'bin'),
    join(home, '.volta', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ]
  return Array.from(new Set([...fromPath, ...extras]))
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, process.platform === 'win32' ? fsConstants.F_OK : fsConstants.X_OK)
    return true
  } catch {
    return false
  }
}

export function findExecutable(name: string, override?: string): string | null {
  if (override?.trim()) return isExecutable(override.trim()) ? override.trim() : null
  const names = process.platform === 'win32' ? [`${name}.exe`, `${name}.cmd`, name] : [name]
  for (const dir of candidateDirs()) {
    for (const n of names) {
      const full = join(dir, n)
      if (isExecutable(full)) return full
    }
  }
  return null
}

function readVersion(bin: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(bin, ['--version'], { timeout: 4_000, windowsHide: true }, (err, stdout) => {
      if (err) return resolve(null)
      const first = String(stdout).trim().split('\n')[0]?.trim()
      resolve(first ? first.slice(0, 80) : null)
    })
  })
}

/** Absolute path to the bundled Claude ACP adapter entry, or null when not installed. */
export function resolveClaudeAcpAdapterEntry(): string | null {
  try {
    const require = createRequire(import.meta.url)
    const pkg = require.resolve('@agentclientprotocol/claude-agent-acp/package.json')
    const entry = join(dirname(pkg), 'dist', 'index.js')
    return existsSync(entry) ? entry : null
  } catch {
    return null
  }
}

/** Run a JS file with the Node runtime embedded in Electron (or plain Node under tests). */
function nodeScriptLaunch(script: string, extraEnv: NodeJS.ProcessEnv = {}): AcpLaunchSpec {
  return {
    command: process.execPath,
    args: [script],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ...extraEnv },
  }
}

function overrideDetection(id: AcpProviderId, script: string): AcpProviderDetection {
  return {
    status: {
      id,
      label: AGENT_PROVIDER_LABELS[id],
      tagline: id === 'grok-build' ? 'Your SuperGrok subscription' : 'Your Claude subscription',
      available: true,
      detail: `ACP override: ${script}`,
    },
    launch: nodeScriptLaunch(script),
    loginHint: id === 'grok-build' ? GROK_LOGIN_HINT : CLAUDE_LOGIN_HINT,
  }
}

async function detectGrokBuild(): Promise<AcpProviderDetection> {
  const override = process.env[ENV_ACP_AGENT_OVERRIDE]?.trim()
  if (override) return overrideDetection('grok-build', override)

  const bin = findExecutable('grok', process.env[ENV_GROK_PATH])
  const base = {
    id: 'grok-build' as const,
    label: AGENT_PROVIDER_LABELS['grok-build'],
    tagline: 'Uses your SuperGrok / X Premium+ subscription via the `grok` CLI',
  }
  if (!bin) {
    return {
      status: {
        ...base,
        available: false,
        hint: 'Install Grok Build (see x.ai/cli, or `npm i -g @xai-official/grok`), then run `grok login`.',
      },
      launch: null,
      loginHint: GROK_LOGIN_HINT,
    }
  }
  const version = await readVersion(bin)
  return {
    status: {
      ...base,
      available: true,
      detail: `${version ?? 'grok'} · ${bin}`,
      hint: 'Not signed in yet? Run `grok login` once in a terminal.',
    },
    launch: { command: bin, args: ['agent', 'stdio'], env: process.env },
    loginHint: GROK_LOGIN_HINT,
  }
}

async function detectClaudeCode(): Promise<AcpProviderDetection> {
  const override = process.env[ENV_ACP_AGENT_OVERRIDE]?.trim()
  if (override) return overrideDetection('claude-code', override)

  const base = {
    id: 'claude-code' as const,
    label: AGENT_PROVIDER_LABELS['claude-code'],
    tagline: 'Uses your Claude Pro / Max subscription via the `claude` CLI',
  }
  const adapter = resolveClaudeAcpAdapterEntry()
  const bin = findExecutable('claude', process.env[ENV_CLAUDE_PATH])
  if (!adapter) {
    return {
      status: {
        ...base,
        available: false,
        hint: 'The bundled Claude ACP adapter is missing. Run `npm install` in the GrokForge checkout.',
      },
      launch: null,
      loginHint: CLAUDE_LOGIN_HINT,
    }
  }
  if (!bin) {
    return {
      status: {
        ...base,
        available: false,
        hint: 'Install Claude Code (`npm i -g @anthropic-ai/claude-code` or the native installer), then run `claude` once to sign in.',
      },
      launch: null,
      loginHint: CLAUDE_LOGIN_HINT,
    }
  }
  const version = await readVersion(bin)
  return {
    status: {
      ...base,
      available: true,
      detail: `${version ?? 'claude'} · ${bin}`,
      hint: 'Not signed in yet? Run `claude` once in a terminal and use `/login`.',
    },
    launch: nodeScriptLaunch(adapter, { CLAUDE_CODE_EXECUTABLE: bin }),
    loginHint: CLAUDE_LOGIN_HINT,
  }
}

export function detectAcpProvider(id: AcpProviderId): Promise<AcpProviderDetection> {
  return id === 'grok-build' ? detectGrokBuild() : detectClaudeCode()
}
