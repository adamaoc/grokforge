import { describe, expect, it } from 'vitest'
import { formatHarnessTurnErrorMessage } from '../turn-error-hint'
import { createHarnessTurnMutatingProgress } from '../turn-mutating-progress'

describe('formatHarnessTurnErrorMessage', () => {
  it('passes through errors when no mutating tools succeeded', () => {
    const message = formatHarnessTurnErrorMessage(
      new Error('HTTP 429: rate limited'),
      createHarnessTurnMutatingProgress(),
    )

    expect(message).toBe('HTTP 429: rate limited')
  })

  it('replaces generic timeout copy with proposal-only partial progress hints', () => {
    const progress = createHarnessTurnMutatingProgress()
    progress.proposalToolSuccessCount = 2

    const message = formatHarnessTurnErrorMessage(
      new Error('The operation was aborted due to timeout'),
      progress,
    )

    expect(message).toContain('Model request timed out.')
    expect(message).toContain('edit proposals may already be in the chat')
    expect(message).not.toContain('may already be on disk')
  })

  it('mentions disk changes on timeout when run_command succeeded', () => {
    const progress = createHarnessTurnMutatingProgress()
    progress.runCommandSuccessCount = 1

    const message = formatHarnessTurnErrorMessage(
      new Error('timed out'),
      progress,
    )

    expect(message).toContain('refresh the file tree')
    expect(message).toContain('Retry if more work remains.')
  })

  it('appends proposal and command hints for non-timeout failures', () => {
    const progress = createHarnessTurnMutatingProgress()
    progress.proposalToolSuccessCount = 1
    progress.runCommandSuccessCount = 1

    const message = formatHarnessTurnErrorMessage(
      new TypeError('fetch failed'),
      progress,
    )

    expect(message).toContain('Could not reach the xAI API')
    expect(message).toContain('edit proposals may already be in the chat')
    expect(message).toContain('refresh the file tree')
  })
})