import { spawn, type ChildProcess } from 'node:child_process'
import type { Readable, Writable } from 'node:stream'
import { JsonRpcError, JsonRpcPeer, JSON_RPC_METHOD_NOT_FOUND } from './json-rpc'
import {
  ACP_PROTOCOL_VERSION,
  type AcpContentBlock,
  type AcpInitializeResult,
  type AcpNewSessionResult,
  type AcpPromptResult,
  type AcpReadTextFileParams,
  type AcpRequestPermissionParams,
  type AcpRequestPermissionResult,
  type AcpSessionNotification,
  type AcpWriteTextFileParams,
} from './protocol'

/** Client-side callbacks the agent can invoke while a turn is running. */
export type AcpClientHandlers = {
  onSessionUpdate: (notification: AcpSessionNotification) => void
  requestPermission: (params: AcpRequestPermissionParams) => Promise<AcpRequestPermissionResult>
  readTextFile: (params: AcpReadTextFileParams) => Promise<{ content: string }>
  writeTextFile: (params: AcpWriteTextFileParams) => Promise<null>
}

export type AcpLaunchSpec = {
  command: string
  args: string[]
  env?: NodeJS.ProcessEnv
  /** Process working directory (the session cwd is sent separately in `session/new`). */
  cwd?: string
}

const STDERR_TAIL_CHARS = 4_000

/**
 * One running ACP agent process. GrokForge keeps at most one session per connection; the
 * owning session manager swaps {@link handlers} per turn so agent callbacks reach the
 * active turn (or are refused between turns).
 */
export class AcpAgentConnection {
  handlers: AcpClientHandlers | null = null
  initializeResult: AcpInitializeResult | null = null

  private readonly peer: JsonRpcPeer
  private readonly child: ChildProcess | null
  private stderrTail = ''
  private exited = false

  private constructor(io: { input: Readable; output: Writable }, child: ChildProcess | null) {
    this.child = child
    this.peer = new JsonRpcPeer({
      input: io.input,
      output: io.output,
      onRequest: (method, params) => this.onAgentRequest(method, params),
      onNotification: (method, params) => this.onAgentNotification(method, params),
    })
  }

  /** Spawn an agent CLI and speak ACP over its stdio. */
  static spawn(spec: AcpLaunchSpec): AcpAgentConnection {
    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: spec.env ?? process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const conn = new AcpAgentConnection({ input: child.stdout!, output: child.stdin! }, child)
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk: string) => {
      conn.stderrTail = (conn.stderrTail + chunk).slice(-STDERR_TAIL_CHARS)
    })
    child.on('error', (err) => {
      conn.exited = true
      conn.peer.close(err)
    })
    child.on('exit', (code, signal) => {
      conn.exited = true
      const how = signal ? `signal ${signal}` : `code ${code}`
      const tail = conn.lastStderrLine()
      conn.peer.close(new Error(`Agent process exited (${how})${tail ? `: ${tail}` : ''}`))
    })
    // A dead agent must not crash main with EPIPE.
    child.stdin?.on('error', () => undefined)
    return conn
  }

  /** Test seam: speak ACP over arbitrary streams (no child process). */
  static fromStreams(io: { input: Readable; output: Writable }): AcpAgentConnection {
    return new AcpAgentConnection(io, null)
  }

  get isAlive(): boolean {
    return !this.exited && !this.peer.isClosed
  }

  lastStderrLine(): string {
    const lines = this.stderrTail
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    return lines[lines.length - 1]?.slice(0, 300) ?? ''
  }

  async initialize(): Promise<AcpInitializeResult> {
    const result = await this.peer.request<AcpInitializeResult>('initialize', {
      protocolVersion: ACP_PROTOCOL_VERSION,
      clientCapabilities: {
        // The agent reads/writes through GrokForge, which enforces workspace roots and
        // refreshes the file tree / open editors. Agents may still use their own tools.
        fs: { readTextFile: true, writeTextFile: true },
        // Commands run in the agent's own sandbox; GrokForge's PTY stays human-only.
        terminal: false,
      },
      clientInfo: { name: 'grokforge', title: 'GrokForge', version: '0.1.0' },
    })
    this.initializeResult = result
    return result
  }

  newSession(cwd: string, additionalDirectories: string[] = []): Promise<AcpNewSessionResult> {
    return this.peer.request<AcpNewSessionResult>('session/new', {
      cwd,
      mcpServers: [],
      ...(additionalDirectories.length > 0 ? { additionalDirectories } : {}),
    })
  }

  setMode(sessionId: string, modeId: string): Promise<unknown> {
    return this.peer.request('session/set_mode', { sessionId, modeId })
  }

  prompt(sessionId: string, prompt: AcpContentBlock[]): Promise<AcpPromptResult> {
    return this.peer.request<AcpPromptResult>('session/prompt', { sessionId, prompt })
  }

  cancel(sessionId: string): void {
    this.peer.notify('session/cancel', { sessionId })
  }

  dispose(): void {
    this.handlers = null
    this.peer.close(new Error('Agent connection disposed.'))
    if (this.child && !this.exited) {
      this.child.stdin?.end()
      this.child.kill()
    }
  }

  private async onAgentRequest(method: string, params: unknown): Promise<unknown> {
    const handlers = this.handlers
    switch (method) {
      case 'session/request_permission':
        // No turn in flight: refuse rather than silently allow.
        if (!handlers) return { outcome: { outcome: 'cancelled' } }
        return handlers.requestPermission(params as AcpRequestPermissionParams)
      case 'fs/read_text_file':
        if (!handlers) throw new JsonRpcError(-32002, 'No active GrokForge turn.')
        return handlers.readTextFile(params as AcpReadTextFileParams)
      case 'fs/write_text_file':
        if (!handlers) throw new JsonRpcError(-32002, 'No active GrokForge turn.')
        return handlers.writeTextFile(params as AcpWriteTextFileParams)
      default:
        throw new JsonRpcError(JSON_RPC_METHOD_NOT_FOUND, `Method not supported by GrokForge: ${method}`)
    }
  }

  private onAgentNotification(method: string, params: unknown): void {
    if (method === 'session/update') {
      this.handlers?.onSessionUpdate(params as AcpSessionNotification)
    }
    // Vendor extensions (`_x.ai/*`, `auth/status_update`, …) are ignored for now.
  }
}
