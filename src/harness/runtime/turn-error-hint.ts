/**
 * Contextual partial-progress hints when a harness turn ends in error (GFAPP-010).
 */

import { toHarnessModelError } from '../model/client'
import type { HarnessTurnMutatingProgress } from './turn-mutating-progress'
import { harnessTurnHadMutatingProgress } from './turn-mutating-progress'

const TIMEOUT_PREFIX = 'Model request timed out.'

function proposalHint(): string {
  return 'Some edit proposals may already be in the chat — review and apply them before retrying.'
}

function commandDiskHint(): string {
  return 'Some approved commands may have changed files on disk — refresh the file tree.'
}

function formatTimeoutWithProgress(progress: HarnessTurnMutatingProgress): string {
  const parts = [TIMEOUT_PREFIX]
  if (progress.runCommandSuccessCount > 0) {
    parts.push(
      'Partial file changes from approved commands may already be on disk — refresh the file tree.',
    )
  }
  if (progress.proposalToolSuccessCount > 0) {
    parts.push(proposalHint())
  }
  parts.push('Retry if more work remains.')
  return parts.join(' ')
}

/**
 * Map a turn failure to a user-facing message, appending partial-progress hints when
 * mutating tools succeeded earlier in the same turn.
 */
export function formatHarnessTurnErrorMessage(
  error: unknown,
  progress: HarnessTurnMutatingProgress,
): string {
  const base = toHarnessModelError(error).message

  if (!harnessTurnHadMutatingProgress(progress)) {
    return base
  }

  if (base.startsWith(TIMEOUT_PREFIX)) {
    return formatTimeoutWithProgress(progress)
  }

  const hints: string[] = []
  if (progress.runCommandSuccessCount > 0 && !base.includes('refresh the file tree')) {
    hints.push(commandDiskHint())
  }
  if (progress.proposalToolSuccessCount > 0 && !base.toLowerCase().includes('edit proposals')) {
    hints.push(proposalHint())
  }

  if (hints.length === 0) return base
  return `${base} ${hints.join(' ')}`
}