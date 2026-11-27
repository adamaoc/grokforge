import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { JsonRpcError, JsonRpcPeer } from '../json-rpc'

function pair(handlers: {
  a?: (method: string, params: unknown) => Promise<unknown>
  b?: (method: string, params: unknown) => Promise<unknown>
  onNotifyB?: (method: string, params: unknown) => void
}) {
  const aToB = new PassThrough()
  const bToA = new PassThrough()
  const a = new JsonRpcPeer({
    input: bToA,
    output: aToB,
    onRequest: handlers.a ?? (async () => null),
    onNotification: () => undefined,
  })
  const b = new JsonRpcPeer({
    input: aToB,
    output: bToA,
    onRequest: handlers.b ?? (async () => null),
    onNotification: handlers.onNotifyB ?? (() => undefined),
  })
  return { a, b, aToB, bToA }
}

describe('JsonRpcPeer', () => {
  it('round-trips requests in both directions', async () => {
    const { a, b } = pair({
      a: async (method, params) => ({ from: 'a', method, params }),
      b: async (method) => {
        if (method === 'ping') return 'pong'
        throw new JsonRpcError(-32601, 'nope')
      },
    })
    await expect(a.request('ping')).resolves.toBe('pong')
    await expect(b.request('hello', { x: 1 })).resolves.toEqual({ from: 'a', method: 'hello', params: { x: 1 } })
  })

  it('maps error responses to JsonRpcError with code and data', async () => {
    const { a } = pair({
      b: async () => {
        throw new JsonRpcError(-32000, 'Authentication required', 'no auth method id provided')
      },
    })
    const err = await a.request('session/new').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(JsonRpcError)
    expect((err as JsonRpcError).code).toBe(-32000)
    expect((err as JsonRpcError).data).toBe('no auth method id provided')
  })

  it('delivers notifications and tolerates split lines and banner noise', async () => {
    const seen: unknown[] = []
    const { aToB } = pair({ onNotifyB: (method, params) => seen.push({ method, params }) })
    aToB.write('not json banner\n{"jsonrpc":"2.0","method":"session/up')
    aToB.write('date","params":{"n":1}}\n')
    await new Promise((r) => setTimeout(r, 5))
    expect(seen).toEqual([{ method: 'session/update', params: { n: 1 } }])
  })

  it('rejects in-flight requests when the stream ends', async () => {
    const { a, bToA } = pair({ b: () => new Promise(() => undefined) })
    const pending = a.request('session/prompt')
    bToA.end()
    await expect(pending).rejects.toThrow(/closed its output/)
    await expect(a.request('again')).rejects.toThrow()
  })
})
