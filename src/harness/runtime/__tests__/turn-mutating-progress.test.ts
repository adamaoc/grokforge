import { describe, expect, it } from 'vitest'
import {
  createHarnessTurnMutatingProgress,
  harnessTurnHadMutatingProgress,
  recordHarnessMutatingToolSuccess,
} from '../turn-mutating-progress'

describe('turn mutating progress', () => {
  it('records successful proposal and command tools only', () => {
    const progress = createHarnessTurnMutatingProgress()

    recordHarnessMutatingToolSuccess(progress, 'read_file', true)
    recordHarnessMutatingToolSuccess(progress, 'write_file', true)
    recordHarnessMutatingToolSuccess(progress, 'edit', true)
    recordHarnessMutatingToolSuccess(progress, 'run_command', true)
    recordHarnessMutatingToolSuccess(progress, 'write_file', false)

    expect(progress.proposalToolSuccessCount).toBe(2)
    expect(progress.runCommandSuccessCount).toBe(1)
    expect(harnessTurnHadMutatingProgress(progress)).toBe(true)
  })
})