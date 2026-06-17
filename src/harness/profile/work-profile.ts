/**
 * Single Work profile for the harness — ties to {@link loop.ts} tool allowlist
 * and {@link tools.ts} schemas.
 */

import type { GrokProjectManifest } from '../../main/project/manifest'
import { formatWorkspaceRootsForPrompt } from '../workspace/paths'
import { resolveHarnessProfileKey } from './profile-key'

/** Tool names exposed to the model (ampnet naming + GrokForge `edit` + guarded `run_command`). */
export const HARNESS_WORK_TOOLS = [
  'list_files',
  'read_file',
  'write_file',
  'edit',
  'run_command',
] as const

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
export function buildHarnessSystemPrompt(manifest: GrokProjectManifest): string {
  return [
    `You are a coding agent for the project "${manifest.name}".`,
    formatWorkspaceRootsForPrompt(manifest),
    '',
    'Tools (use only these):',
    '- list_files — list one directory level ("." lists every root in multi-root projects)',
    '- read_file — returns JSON with rawContent and contentHash',
    '- edit — small changes to existing files (edits[] + expectedContentHash from read_file); applied immediately',
    '- write_file — full file contents for new files or large rewrites',
    '- run_command — one-shot shell in a workspace root (requires user approval; pass rootId when multiple roots exist)',
    '',
    'For new framework projects (Vite, React, etc.), prefer run_command (npm create, npm install) over hand-writing package.json and template files.',
    'After a successful scaffold or install command, read_file generated paths before editing.',
    'Never claim install, build, or verification succeeded unless run_command returned ok: true in this turn.',
    '',
    manifest.context.customInstructions?.trim()
      ? `Project instructions:\n${manifest.context.customInstructions.trim()}`
      : '',
    'Use paths relative to a workspace root, or rootId:relative/path when needed. After tools, reply to the user in plain text.',
  ]
    .filter((line) => line.length > 0)
    .join('\n')
}

/** Appended on Approve & Run execute turns — follows stored plan artifact injection. */
export function buildHarnessExecuteSystemPromptAppendix(): string {
  return [
    '',
    '## Approved plan execution',
    'You are executing an **approved GrokForge plan** on this turn.',
    'Follow the **Plan steps** section in the system prompt. Prefer `run_command` for npm/Vite/git scaffold and install; use `write_file` / `edit` for source files.',
    'For **verifying a doc or file**, use **one** `read_file` on the workspace path after `write_file` (use `rootId:path` in multi-root projects) — then **stop tooling** and summarize. Do not re-read the same file repeatedly.',
    'For full structured plan JSON, use `read_file` on `gf-plan:<planId>` (app-storage alias). **Never** `read_file` absolute userData / Application Support paths — they are outside workspace roots.',
    'Do not output a new `gf-plan` fence on this turn — implement the approved plan with tools.',
    'Never claim scaffold, install, build, or verification succeeded unless `run_command` returned ok: true in this turn.',
  ].join('\n')
}

/**
 * Routing metadata for Work-only callers (tests, legacy imports).
 * Prefer {@link resolveHarnessTurnRouting} in `turn-routing.ts` for real turns.
 */
export function harnessTurnRouting(manifest: GrokProjectManifest) {
  const modelId = manifest.models.default?.trim() || manifest.models.execution?.trim() || 'grok-build-0.1'
  return {
    modelIntent: 'chat_default' as const,
    modelId,
    harnessProfileKey: resolveHarnessProfileKey(modelId),
    agentProfileId: 'executor' as const,
  }
}
