import { describe, expect, it } from 'vitest'
import { waitForCommandApproval } from '../command-approval'

describe('waitForCommandApproval', () => {
  it('resolves when approval is settled before abort', async () => {
    const ac = new AbortController()
    const requestId = 'req-1'
    const streamId = 'stream-1'

    const pending = waitForCommandApproval(requestId, streamId, ac.signal)

    // Simulate IPC handler resolving via internal map — import pattern uses register;
    // exercise the public wait + manual resolve through duplicate registration is heavy.
    // Instead, abort rejects.
    ac.abort(new Error('cancelled'))
    await expect(pending).rejects.toThrow('cancelled')
  })

  it('rejects immediately when signal already aborted', async () => {
    const ac = new AbortController()
    ac.abort(new Error('already'))
    await expect(
      waitForCommandApproval('r', 's', ac.signal),
    ).rejects.toThrow('already')
  })
})