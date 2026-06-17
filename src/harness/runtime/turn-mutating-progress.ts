/**
 * Tracks successful mutating tool calls within one harness turn.
 * Used to append partial-progress hints when a turn ends in error.
 */

export type HarnessTurnMutatingProgress = {
  proposalToolSuccessCount: number
  runCommandSuccessCount: number
}

export function createHarnessTurnMutatingProgress(): HarnessTurnMutatingProgress {
  return {
    proposalToolSuccessCount: 0,
    runCommandSuccessCount: 0,
  }
}

export function recordHarnessMutatingToolSuccess(
  progress: HarnessTurnMutatingProgress | undefined,
  toolName: string,
  ok: boolean,
): void {
  if (!progress || !ok) return
  if (toolName === 'write_file' || toolName === 'edit') {
    progress.proposalToolSuccessCount += 1
    return
  }
  if (toolName === 'run_command') {
    progress.runCommandSuccessCount += 1
  }
}

export function harnessTurnHadMutatingProgress(
  progress: HarnessTurnMutatingProgress,
): boolean {
  return progress.proposalToolSuccessCount > 0 || progress.runCommandSuccessCount > 0
}