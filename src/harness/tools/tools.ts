/**
 * Harness tool implementations — multi-root disk I/O via {@link paths.resolveHarnessReadPath}.
 * Schemas: ampnet `list_files` / `read_file` / `write_file` plus GrokForge `edit`.
 */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { computeAgentContentHash } from '../agent/content-hash'
import { executeEdit } from './edit-tool'
import { submitHarnessWriteProposal } from '../proposal/submit-write-proposal'
import { executeRunCommandHarnessTool } from './run-command'
import type { HarnessToolRunContext } from './tool-context'
import { notifyHarnessDiskMutation } from '../workspace/fs-refresh'
import {
  HarnessPathError,
  isMultiRootManifest,
  resolveHarnessListPath,
  resolveHarnessReadPath,
  resolveHarnessWritePath,
  type HarnessToolEnv,
} from '../workspace/paths'
import { shouldIgnoreFsEntry } from '../../main/workspace/ignore-globs'
import { readGfPlanArtifactContent } from '../../harness-support/plan/contracts/plan-artifact-read'
import { parseGfPlanArtifactReadPath } from '../../harness-support/plan/contracts/plan-artifact-read-path'
import type { HarnessToolDefinition } from './tool-schema'
import type { HarnessProfile } from '../profile/turn-routing'
import { WORK_PROFILE, type HarnessWorkToolName } from '../profile/work-profile'

function pathErrorText(err: unknown): string {
  if (err instanceof HarnessPathError) return err.message
  const msg = err instanceof Error ? err.message : String(err)
  return msg
}

const TOOL_SCHEMAS: HarnessToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description:
        'Read a file. Returns JSON: path, rawContent (exact text), contentHash (copy into edit expectedContentHash). Required before edit on existing files. On execute turns, approved plan JSON: gf-plan:<planId> (app-storage alias).',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description:
              'Workspace path (relative or rootId:relative/path), or gf-plan:<planId> for approved plan JSON on execute turns',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description:
        'Write full file contents (creates parents). Produces a reviewable edit proposal — nothing hits disk until the user applies. Prefer edit for small changes to existing files.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description:
              'Target path relative to a workspace root, or rootId:relative/path for multi-root projects',
          },
          content: { type: 'string', description: 'Full new file contents' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description:
        'List files and folders in a directory (one level). Use to explore before reading.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description:
              'Directory path relative to a workspace root, rootId:relative/path, or "." to list all roots in a multi-root project',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit',
      description:
        'Apply targeted edits to an existing file (reviewable proposal). Provide path, edits: [{ oldText, newText }, ...], and expectedContentHash from read_file. All oldText values match the original snapshot, not each other incrementally.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description:
              'File path relative to a workspace root, or rootId:relative/path when the project has multiple roots',
          },
          edits: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                oldText: { type: 'string', description: 'Exact text to find (unique in file)' },
                newText: { type: 'string', description: 'Replacement text' },
              },
              required: ['oldText', 'newText'],
            },
          },
          expectedContentHash: {
            type: 'string',
            description: 'SHA-256 hex from read_file contentHash',
          },
        },
        required: ['path', 'edits', 'expectedContentHash'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description:
        'Run one shell command in a workspace root. Requires explicit user approval before execution. Use for npm create, npm install, git init, npm run typecheck/build/dev, and verification — not for creating files you could write with write_file.',
      parameters: {
        type: 'object',
        properties: {
          rootId: {
            type: 'string',
            description:
              'Workspace root id from the manifest (required when the project has multiple roots)',
          },
          command: { type: 'string', description: 'Shell command string to run in the root directory' },
          purpose: {
            type: 'string',
            description: 'Short human-readable reason (shown in the approval card)',
          },
          timeoutMs: {
            type: 'number',
            description: 'Optional timeout in ms (default 120000, max 300000)',
          },
        },
        required: ['command', 'purpose'],
      },
    },
  },
]

export function getToolSchemas(profile: HarnessProfile = WORK_PROFILE): HarnessToolDefinition[] {
  const allowed = new Set(profile.allowedTools)
  return TOOL_SCHEMAS.filter((t) => allowed.has(t.function.name as HarnessWorkToolName))
}

function isAllowed(name: string, allowed: readonly HarnessWorkToolName[]): boolean {
  return (allowed as readonly string[]).includes(name)
}

async function readFileTool(env: HarnessToolEnv, pathArg: string): Promise<string> {
  const planRead = parseGfPlanArtifactReadPath(pathArg)
  if (planRead) {
    if (!env.projectId) {
      throw new HarnessPathError('Plan artifact read requires an active project context.')
    }
    const rawContent = readGfPlanArtifactContent(env.projectId, planRead.planId, planRead.format)
    const agentPath = pathArg.trim()
    return JSON.stringify({
      path: agentPath,
      rawContent,
      contentHash: computeAgentContentHash(rawContent),
      contentHashScope: 'full_file',
      planArtifact: true,
      planId: planRead.planId,
    })
  }

  const resolved = resolveHarnessReadPath(env, pathArg)
  const rawContent = await readFile(resolved.absPath, 'utf-8')
  return JSON.stringify({
    path: resolved.agentPath,
    rawContent,
    contentHash: computeAgentContentHash(rawContent),
    contentHashScope: 'full_file',
  })
}

async function writeFileTool(
  env: HarnessToolEnv,
  pathArg: string,
  content: string,
  proposalAccumulator?: HarnessToolRunContext['proposalAccumulator'],
): Promise<{ ok: boolean; text: string }> {
  const resolved = resolveHarnessWritePath(env, pathArg)

  if (proposalAccumulator) {
    const result = await submitHarnessWriteProposal({
      accumulator: proposalAccumulator,
      resolved,
      content,
    })
    return result
  }

  await mkdir(dirname(resolved.absPath), { recursive: true })
  await writeFile(resolved.absPath, content, 'utf-8')
  notifyHarnessDiskMutation(env, resolved)
  return { ok: true, text: `Wrote ${resolved.agentPath} (${content.length} characters)` }
}

async function listFilesTool(env: HarnessToolEnv, pathArg: string): Promise<string> {
  const resolved = resolveHarnessListPath(env, pathArg || '.')

  if (!resolved.absPath && isMultiRootManifest(env.manifest)) {
    const lines: string[] = []
    for (const root of env.manifest.roots) {
      const label = root.label?.trim() || root.id
      lines.push(`[${root.id}] ${label}/`)
      try {
        const entries = await readdir(root.path, { withFileTypes: true })
        const visible = entries
          .map((e) => ({
            name: e.name,
            isDirectory: e.isDirectory(),
            absPath: join(root.path, e.name),
          }))
          .filter(
            (entry) =>
              !shouldIgnoreFsEntry(entry.absPath, env.manifest.roots, env.manifest.ignore ?? []),
          )
          .sort((a, b) => {
            if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
            return a.name.localeCompare(b.name)
          })
          .slice(0, 80)
        for (const entry of visible) {
          lines.push(`  ${entry.isDirectory ? `${entry.name}/` : entry.name}`)
        }
        if (entries.length > visible.length) {
          lines.push(`  …${entries.length - visible.length} more (some hidden by ignore rules)`)
        }
      } catch {
        lines.push('  (could not list)')
      }
      lines.push('')
    }
    return lines.join('\n').trim() || '(no workspace roots)'
  }

  const entries = await readdir(resolved.absPath, { withFileTypes: true })
  const lines = entries
    .map((e) => ({
      name: e.isDirectory() ? `${e.name}/` : e.name,
      absPath: join(resolved.absPath, e.name),
    }))
    .filter(
      (entry) => !shouldIgnoreFsEntry(entry.absPath, env.manifest.roots, env.manifest.ignore ?? []),
    )
    .map((entry) => entry.name)
  return lines.join('\n') || '(empty directory)'
}

export async function executeTool(
  env: HarnessToolEnv,
  name: string,
  argsJson: string,
  profile: HarnessProfile = WORK_PROFILE,
  options?: {
    toolContext?: HarnessToolRunContext
    toolCallId?: string
    activityId?: string
  },
): Promise<{ ok: boolean; text: string }> {
  if (!isAllowed(name, profile.allowedTools)) {
    return {
      ok: false,
      text:
        `Permission denied: profile does not allow "${name}". ` +
        `Allowed: ${profile.allowedTools.join(', ')}`,
    }
  }

  let args: Record<string, unknown>
  try {
    args = JSON.parse(argsJson) as Record<string, unknown>
  } catch {
    return { ok: false, text: `Invalid tool arguments JSON: ${argsJson}` }
  }

  try {
    switch (name) {
      case 'read_file':
        return { ok: true, text: await readFileTool(env, String(args.path ?? '')) }
      case 'write_file': {
        const writeResult = await writeFileTool(
          env,
          String(args.path ?? ''),
          String(args.content ?? ''),
          options?.toolContext?.proposalAccumulator,
        )
        return writeResult
      }
      case 'list_files':
        return { ok: true, text: await listFilesTool(env, String(args.path ?? '.')) }
      case 'edit': {
        const result = await executeEdit(env, argsJson, {
          proposalAccumulator: options?.toolContext?.proposalAccumulator,
        })
        return { ok: result.ok, text: result.text }
      }
      case 'run_command': {
        if (!options?.toolContext || !options.toolCallId || !options.activityId) {
          return {
            ok: false,
            text: JSON.stringify({ ok: false, error: 'run_command missing harness tool context' }),
          }
        }
        return executeRunCommandHarnessTool(
          options.toolContext,
          argsJson,
          options.toolCallId,
          options.activityId,
        )
      }
      default:
        return { ok: false, text: `Unknown tool: ${name}` }
    }
  } catch (err) {
    return { ok: false, text: pathErrorText(err) }
  }
}