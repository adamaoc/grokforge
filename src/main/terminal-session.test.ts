import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { GrokProjectManifest } from './manifest'
import {
  killAllTerminalSessions,
  killTerminalSession,
  parseTerminalSessionResizeRequest,
  parseTerminalSessionStartRequest,
  resetTerminalSessionPtyFactoryForTests,
  resizeTerminalSession,
  setTerminalSessionPtyFactoryForTests,
  startTerminalSession,
  terminalSessionCountForTests,
  writeTerminalSessionInput,
} from './terminal-session'

type Handler<T> = (payload: T) => void

class FakePty {
  pid = 123
  process = 'fake-shell'
  writes: string[] = []
  resized: Array<{ cols: number; rows: number }> = []
  killed = false
  private dataHandlers: Handler<string>[] = []
  private exitHandlers: Handler<{ exitCode: number; signal?: string }>[] = []

  write(data: string) {
    this.writes.push(data)
  }

  resize(cols: number, rows: number) {
    this.resized.push({ cols, rows })
  }

  kill() {
    this.killed = true
    this.exitHandlers.forEach((h) => h({ exitCode: 0 }))
  }

  onData(handler: Handler<string>) {
    this.dataHandlers.push(handler)
    return { dispose: () => undefined }
  }

  onExit(handler: Handler<{ exitCode: number; signal?: string }>) {
    this.exitHandlers.push(handler)
    return { dispose: () => undefined }
  }
}

let lastPty: FakePty | null = null

function manifestForRoot(root: string): GrokProjectManifest {
  return {
    version: '1.2',
    name: 'Terminal Test',
    roots: [{ id: 'root', path: root, type: 'code', label: 'Root' }],
    ignore: ['**/node_modules', '**/.git'],
    models: {
      default: 'grok-build-0.1',
      planning: 'grok-4.3',
      execution: 'grok-build-0.1',
      reasoning: 'grok-4.20-0309-reasoning',
      voice: 'grok-voice-latest',
    },
    voice: { enabled: true, defaultVoiceMode: 'off', autoListen: false, speakResponses: false },
    context: { alwaysInclude: [] },
    metadata: { createdAt: 'now', lastOpened: 'now', tags: [] },
  }
}

afterEach(() => {
  killAllTerminalSessions()
  resetTerminalSessionPtyFactoryForTests()
  lastPty = null
})

describe('terminal session service', () => {
  it('starts a PTY session in a workspace root and accepts input', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-terminal-'))
    setTerminalSessionPtyFactoryForTests({
      spawn: (_file, _args, _options) => {
        lastPty = new FakePty()
        return lastPty
      },
    })

    const started = startTerminalSession(manifestForRoot(root), {
      rootId: 'root',
      cols: 80,
      rows: 24,
      shell: '/bin/zsh',
    })

    expect(started.ok).toBe(true)
    if (!started.ok) throw new Error(started.error)
    expect(started.session.cwd).toBe(root)
    expect(terminalSessionCountForTests()).toBe(1)

    const input = writeTerminalSessionInput({ sessionId: started.session.sessionId, data: 'pwd\r' })
    expect(input.ok).toBe(true)
    expect(lastPty?.writes).toEqual(['pwd\r'])
  })

  it('rejects invalid roots and unknown sessions', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-terminal-'))
    const badRoot = startTerminalSession(manifestForRoot(root), {
      rootId: 'missing',
      cols: 80,
      rows: 24,
    })

    expect(badRoot.ok).toBe(false)
    if (!badRoot.ok) expect(badRoot.code).toBe('unknown_root')

    const input = writeTerminalSessionInput({ sessionId: 'missing', data: 'x' })
    expect(input.ok).toBe(false)
    if (!input.ok) expect(input.code).toBe('unknown_session')
  })

  it('validates resize bounds and forwards resize to the PTY', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-terminal-'))
    setTerminalSessionPtyFactoryForTests({
      spawn: () => {
        lastPty = new FakePty()
        return lastPty
      },
    })
    const parsed = parseTerminalSessionResizeRequest({ sessionId: 's', cols: 1, rows: 999 })
    expect(parsed).toEqual({ sessionId: 's', cols: 20, rows: 100 })

    const started = startTerminalSession(manifestForRoot(root), { rootId: 'root', cols: 80, rows: 24 })
    expect(started.ok).toBe(true)
    if (!started.ok) throw new Error(started.error)

    const resized = resizeTerminalSession({ sessionId: started.session.sessionId, cols: 100, rows: 30 })
    expect(resized.ok).toBe(true)
    expect(lastPty?.resized).toEqual([{ cols: 100, rows: 30 }])
  })

  it('parses start payloads with defaults and kills sessions', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-terminal-'))
    setTerminalSessionPtyFactoryForTests({
      spawn: () => {
        lastPty = new FakePty()
        return lastPty
      },
    })
    expect(parseTerminalSessionStartRequest({ rootId: 'root', cols: 0, rows: 0 })).toEqual({
      rootId: 'root',
      cols: 20,
      rows: 5,
      shell: undefined,
    })

    const started = startTerminalSession(manifestForRoot(root), { rootId: 'root', cols: 80, rows: 24 })
    expect(started.ok).toBe(true)
    if (!started.ok) throw new Error(started.error)
    const killed = killTerminalSession({ sessionId: started.session.sessionId })

    expect(killed.ok).toBe(true)
    expect(lastPty?.killed).toBe(true)
    expect(terminalSessionCountForTests()).toBe(0)
  })
})
