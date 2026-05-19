import { describe, expect, it } from 'vitest'
import { agentEditPathKey, isWriteFileBlockedWithoutRead } from './agent-edit-read-guard'

describe('isWriteFileBlockedWithoutRead', () => {
  const path = '/workspace/src/app.ts'

  it('does not block writes to paths that do not exist yet', () => {
    expect(isWriteFileBlockedWithoutRead(path, undefined, false)).toBe(false)
    expect(isWriteFileBlockedWithoutRead(path, new Set(), false)).toBe(false)
  })

  it('blocks existing files when read set is missing or empty', () => {
    expect(isWriteFileBlockedWithoutRead(path, undefined, true)).toBe(true)
    expect(isWriteFileBlockedWithoutRead(path, new Set(), true)).toBe(true)
  })

  it('allows existing files when the path was read this turn', () => {
    const reads = new Set([agentEditPathKey(path)])
    expect(isWriteFileBlockedWithoutRead(path, reads, true)).toBe(false)
  })
})
