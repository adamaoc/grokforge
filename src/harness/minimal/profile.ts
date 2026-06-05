/**
 * Single Work profile for minimal harness — ties to {@link loop.ts} tool allowlist
 * and {@link tools.ts} schemas.
 */

import type { GrokProjectManifest } from '../../main/manifest'
import { resolveHarnessProfileKey } from '../profiles/contracts/harness-profile-key'

/** Tool names exposed to the model (ampnet naming + GrokForge `edit`). */
export const MINIMAL_WORK_TOOLS = ['list_files', 'read_file', 'write_file', 'edit'] as const

export type MinimalWorkToolName = (typeof MINIMAL_WORK_TOOLS)[number]

export type MinimalWorkProfile = {
  id: 'work'
  allowedTools: readonly MinimalWorkToolName[]
}

export const WORK_PROFILE: MinimalWorkProfile = {
  id: 'work',
  allowedTools: MINIMAL_WORK_TOOLS,
}

/**
 * System prompt for one turn.
 *
 * Intentionally does **not** append `manifest.context.customInstructions` while minimal
 * mode is in testing — that field is still set on new projects in `app-project-store.ts`
 * (legacy harness / diff-review copy) but would contradict direct-write + minimal tools.
 *
 * Logged in full via {@link MinimalHarnessLogger} `context_snapshot`.
 */
export function buildMinimalSystemPrompt(
  manifest: GrokProjectManifest,
  workspaceRootDisplay: string,
): string {
  return [
    `You are a coding agent for the project "${manifest.name}".`,
    `Active workspace root: ${workspaceRootDisplay}`,
    '',
    'Tools (use only these):',
    '- list_files — list one directory level (path "." for root)',
    '- read_file — returns JSON with rawContent and contentHash',
    '- edit — small changes to existing files (edits[] + expectedContentHash from read_file); applied immediately',
    '- write_file — full file contents for new files or large rewrites',
    '',
    'Work in paths relative to the workspace root. After tools, reply to the user in plain text.',
  ].join('\n')
}

/** Routing metadata for IPC `turn_started` (renderer compatibility). */
export function minimalTurnRouting(manifest: GrokProjectManifest) {
  const modelId = manifest.models.execution?.trim() || manifest.models.default
  return {
    modelIntent: 'chat_default' as const,
    modelId,
    harnessProfileKey: resolveHarnessProfileKey(modelId),
    agentProfileId: 'executor' as const,
  }
}
