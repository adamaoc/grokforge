/**
 * Enforced creation-path incremental recovery (story 153).
 * After the creation incremental recovery nudge fires, block oversized new-file
 * bootstrap proposals until a minimal scaffold is accepted.
 * Story 162: single-file HTML intent uses shell-first (no inline script) then `edit`.
 */

import {
  htmlProposalContainsInlineScript,
  isHtmlCreationPath,
} from './single-file-html-intent'

export const CREATION_RECOVERY_MAX_SCAFFOLD_LINES = 32
export const CREATION_RECOVERY_MAX_SCAFFOLD_CHARS = 1200

export const AGENT_EDIT_MINIMAL_SCAFFOLD_REQUIRED_REASON =
  'Creation incremental recovery is active for this new path — submit a **minimal scaffold** first (small complete valid subset), not another large full-file bootstrap. Keep the proposal under roughly 32 lines and 1200 characters. After it validates, `read_file` the path and extend with the primary `edit` tool or small scoped `propose_file_edits`.'

export const AGENT_EDIT_SINGLE_FILE_HTML_SHELL_FIRST_REASON =
  'Single-file HTML creation recovery is active — submit a **minimal HTML shell** first (structure and markup only, **no** `<script>` block). Keep it under roughly 32 lines and 1200 characters. After it validates, `read_file` the path and append JavaScript with the primary **`edit`** tool in one or more chunks. Do not send another full-file `propose_file_edits` with inline script on this path this turn.'

export function normalizeCreationRecoveryPath(resolvedPath: string): string {
  return resolvedPath.replace(/\\/g, '/')
}

export function isOversizedCreationBootstrap(content: string): boolean {
  if (!content) return false
  const lineCount = (content.match(/\n/g) ?? []).length + 1
  return (
    lineCount > CREATION_RECOVERY_MAX_SCAFFOLD_LINES ||
    content.length > CREATION_RECOVERY_MAX_SCAFFOLD_CHARS
  )
}

export function recordCreationRecoveryEnforced(
  enforcedPaths: Set<string>,
  paths: readonly string[],
): void {
  for (const path of paths) {
    enforcedPaths.add(normalizeCreationRecoveryPath(path))
  }
}

export function isCreationRecoveryEnforced(
  enforcedPaths: ReadonlySet<string>,
  resolvedPath: string,
): boolean {
  return enforcedPaths.has(normalizeCreationRecoveryPath(resolvedPath))
}

export function recordCreationScaffoldAccepted(
  acceptedPaths: Set<string>,
  resolvedPath: string,
): void {
  acceptedPaths.add(normalizeCreationRecoveryPath(resolvedPath))
}

export function isCreationScaffoldAccepted(
  acceptedPaths: ReadonlySet<string>,
  resolvedPath: string,
): boolean {
  return acceptedPaths.has(normalizeCreationRecoveryPath(resolvedPath))
}

function appliesSingleFileHtmlCreationRecovery(input: {
  resolvedPath: string
  fileExistsOnDisk: boolean
  singleFileHtmlIntent?: boolean
}): boolean {
  return Boolean(
    input.singleFileHtmlIntent && isHtmlCreationPath(input.resolvedPath, input.fileExistsOnDisk),
  )
}

/** Whether raw write content counts as an accepted minimal creation scaffold (153 / 162). */
export function qualifiesAsCreationRecoveryScaffold(input: {
  content: string
  resolvedPath: string
  fileExistsOnDisk: boolean
  singleFileHtmlIntent?: boolean
}): boolean {
  if (isOversizedCreationBootstrap(input.content)) return false
  if (
    appliesSingleFileHtmlCreationRecovery(input) &&
    htmlProposalContainsInlineScript(input.content)
  ) {
    return false
  }
  return true
}

export function assessCreationRecoveryBootstrapBlock(input: {
  content: string
  resolvedPath: string
  fileExistsOnDisk: boolean
  creationRecoveryEnforcedPaths?: ReadonlySet<string>
  creationScaffoldAcceptedPaths?: ReadonlySet<string>
  contentSource?: 'search_replace' | 'propose'
  singleFileHtmlIntent?: boolean
}): { blocked: boolean; reason?: string } {
  if (input.fileExistsOnDisk) return { blocked: false }
  if (input.contentSource === 'search_replace') return { blocked: false }
  const enforced = input.creationRecoveryEnforcedPaths
  const accepted = input.creationScaffoldAcceptedPaths
  if (!enforced || !isCreationRecoveryEnforced(enforced, input.resolvedPath)) {
    return { blocked: false }
  }
  if (accepted && isCreationScaffoldAccepted(accepted, input.resolvedPath)) {
    return { blocked: false }
  }

  const singleFileHtml = appliesSingleFileHtmlCreationRecovery({
    resolvedPath: input.resolvedPath,
    fileExistsOnDisk: input.fileExistsOnDisk,
    singleFileHtmlIntent: input.singleFileHtmlIntent,
  })
  if (singleFileHtml && htmlProposalContainsInlineScript(input.content)) {
    return { blocked: true, reason: AGENT_EDIT_SINGLE_FILE_HTML_SHELL_FIRST_REASON }
  }

  if (!isOversizedCreationBootstrap(input.content)) {
    return { blocked: false }
  }
  return { blocked: true, reason: AGENT_EDIT_MINIMAL_SCAFFOLD_REQUIRED_REASON }
}

export function creationRecoveryUnmetPathLabels(input: {
  creationRecoveryEnforcedPaths: ReadonlySet<string>
  creationScaffoldAcceptedPaths: ReadonlySet<string>
}): string[] {
  const labels: string[] = []
  for (const path of input.creationRecoveryEnforcedPaths) {
    if (isCreationScaffoldAccepted(input.creationScaffoldAcceptedPaths, path)) continue
    const parts = path.split('/').filter(Boolean)
    const label = parts[parts.length - 1] ?? path
    if (label) labels.push(label)
  }
  return labels
}
