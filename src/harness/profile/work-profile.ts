/**
 * Single Work profile for the harness — ties to {@link loop.ts} tool allowlist
 * and {@link tools.ts} schemas.
 */

import type { GrokProjectManifest } from '../../main/project/manifest'
import { resolveHarnessProfileKey } from './profile-key'

/** Tool names exposed to the model (ampnet naming + GrokForge `edit`). */
export const HARNESS_WORK_TOOLS = ['list_files', 'read_file', 'write_file', 'edit'] as const

export type HarnessWorkToolName = (typeof HARNESS_WORK_TOOLS)[number]

export type HarnessWorkProfile = {
  id: 'work'
  allowedTools: readonly HarnessWorkToolName[]
}

export const WORK_PROFILE: HarnessWorkProfile = {
  id: 'work',
  allowedTools: HARNESS_WORK_TOOLS,
}

/**
 * System prompt for one turn.
 *
 * Logged in full via {@link HarnessLogger} `context_snapshot`.
 */
export function buildHarnessSystemPrompt(
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
    manifest.context.customInstructions?.trim()
      ? `Project instructions:\n${manifest.context.customInstructions.trim()}`
      : '',
    'Work in paths relative to the workspace root. After tools, reply to the user in plain text.',
  ].join('\n')
}

/** Routing metadata for IPC `turn_started` (renderer compatibility). */
export function harnessTurnRouting(manifest: GrokProjectManifest) {
  const modelId = manifest.models.execution?.trim() || manifest.models.default
  return {
    modelIntent: 'chat_default' as const,
    modelId,
    harnessProfileKey: resolveHarnessProfileKey(modelId),
    agentProfileId: 'executor' as const,
  }
}
