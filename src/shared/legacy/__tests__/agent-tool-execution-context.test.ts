import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createThrottledProgress } from '../../../harness-support/tools/contracts/execution-context'

describe('createThrottledProgress', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires the first update immediately', () => {
    const emit = vi.fn()
    const throttled = createThrottledProgress(emit, 500)
    throttled({ detail: 'a' })
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith({ detail: 'a' })
  })

  it('coalesces rapid updates and flushes trailing state', () => {
    const emit = vi.fn()
    const throttled = createThrottledProgress(emit, 500)
    throttled({ detail: 'first' })
    throttled({ detail: 'second' })
    throttled({ detail: 'third' })
    expect(emit).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(500)
    expect(emit).toHaveBeenCalledTimes(2)
    expect(emit).toHaveBeenLastCalledWith({ detail: 'third' })
  })
})
