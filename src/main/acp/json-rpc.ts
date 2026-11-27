import type { Readable, Writable } from 'node:stream'

/**
 * Minimal bidirectional JSON-RPC 2.0 peer over newline-delimited JSON (the ACP stdio
 * transport). Both sides send requests: GrokForge calls `session/prompt`, the agent calls
 * back with `session/request_permission`, `fs/read_text_file`, and so on.
 */

export type JsonRpcId = number | string

export class JsonRpcError extends Error {
  readonly code: number
  readonly data: unknown

  constructor(code: number, message: string, data?: unknown) {
    super(message)
    this.name = 'JsonRpcError'
    this.code = code
    this.data = data
  }
}

export const JSON_RPC_METHOD_NOT_FOUND = -32601
export const JSON_RPC_INTERNAL_ERROR = -32603
/** ACP: agent requires `authenticate` before creating sessions / prompting. */
export const ACP_AUTH_REQUIRED = -32000

export type JsonRpcRequestHandler = (method: string, params: unknown) => Promise<unknown>
export type JsonRpcNotificationHandler = (method: string, params: unknown) => void

type Pending = {
  method: string
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

type IncomingMessage = {
  jsonrpc?: string
  id?: JsonRpcId | null
  method?: string
  params?: unknown
  result?: unknown
  error?: { code?: number; message?: string; data?: unknown }
}

export type JsonRpcPeerOptions = {
  input: Readable
  output: Writable
  onRequest: JsonRpcRequestHandler
  onNotification: JsonRpcNotificationHandler
  /** Lines that are not JSON (some CLIs print banners); for diagnostics only. */
  onNonJsonLine?: (line: string) => void
}

export class JsonRpcPeer {
  private nextId = 1
  private buffer = ''
  private closed = false
  private closeError: Error | null = null
  private readonly pending = new Map<JsonRpcId, Pending>()
  private readonly options: JsonRpcPeerOptions

  constructor(options: JsonRpcPeerOptions) {
    this.options = options
    options.input.setEncoding?.('utf8')
    options.input.on('data', (chunk: string | Buffer) => this.onData(String(chunk)))
    options.input.on('end', () => this.close(new Error('Agent closed its output stream.')))
    options.input.on('error', (err: Error) => this.close(err))
  }

  get isClosed(): boolean {
    return this.closed
  }

  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (this.closed) {
      return Promise.reject(this.closeError ?? new Error('Agent connection is closed.'))
    }
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { method, resolve: resolve as (v: unknown) => void, reject })
      this.write({ jsonrpc: '2.0', id, method, params })
    })
  }

  notify(method: string, params?: unknown): void {
    if (this.closed) return
    this.write({ jsonrpc: '2.0', method, params })
  }

  /** Rejects all in-flight requests; further calls fail fast. */
  close(error: Error = new Error('Agent connection is closed.')): void {
    if (this.closed) return
    this.closed = true
    this.closeError = error
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
  }

  private write(message: unknown): void {
    try {
      this.options.output.write(`${JSON.stringify(message)}\n`)
    } catch (e) {
      this.close(e instanceof Error ? e : new Error(String(e)))
    }
  }

  private onData(chunk: string): void {
    this.buffer += chunk
    let newline = this.buffer.indexOf('\n')
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim()
      this.buffer = this.buffer.slice(newline + 1)
      if (line) this.onLine(line)
      newline = this.buffer.indexOf('\n')
    }
  }

  private onLine(line: string): void {
    let message: IncomingMessage
    try {
      message = JSON.parse(line) as IncomingMessage
    } catch {
      this.options.onNonJsonLine?.(line)
      return
    }
    if (!message || typeof message !== 'object') return

    const hasId = message.id !== undefined && message.id !== null
    if (typeof message.method === 'string') {
      if (hasId) void this.handleRequest(message.id as JsonRpcId, message.method, message.params)
      else this.safeNotify(message.method, message.params)
      return
    }
    if (hasId) this.handleResponse(message)
  }

  private safeNotify(method: string, params: unknown): void {
    try {
      this.options.onNotification(method, params)
    } catch (e) {
      console.warn('[GrokForge][acp] notification handler failed:', method, e)
    }
  }

  private async handleRequest(id: JsonRpcId, method: string, params: unknown): Promise<void> {
    try {
      const result = await this.options.onRequest(method, params)
      this.write({ jsonrpc: '2.0', id, result: result ?? null })
    } catch (e) {
      const error =
        e instanceof JsonRpcError
          ? { code: e.code, message: e.message, ...(e.data !== undefined ? { data: e.data } : {}) }
          : { code: JSON_RPC_INTERNAL_ERROR, message: e instanceof Error ? e.message : String(e) }
      this.write({ jsonrpc: '2.0', id, error })
    }
  }

  private handleResponse(message: IncomingMessage): void {
    const pending = this.pending.get(message.id as JsonRpcId)
    if (!pending) return
    this.pending.delete(message.id as JsonRpcId)
    if (message.error) {
      pending.reject(
        new JsonRpcError(
          typeof message.error.code === 'number' ? message.error.code : JSON_RPC_INTERNAL_ERROR,
          message.error.message || `${pending.method} failed`,
          message.error.data,
        ),
      )
      return
    }
    pending.resolve(message.result)
  }
}
