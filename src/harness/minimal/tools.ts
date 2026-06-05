/**
 * Minimal tool implementations — disk I/O under {@link paths.resolveWithinWorkspace}.
 * Schemas: ampnet `list_files` / `read_file` / `write_file` plus GrokForge `edit`.
 */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { computeAgentContentHash } from '../agent/content-hash'
import { executeMinimalEdit } from './edit-tool'
import { resolveWithinWorkspace } from './paths'
import type { AgentSnapshotToolDefinition } from '../compaction/turn-snapshot'
import {
  MINIMAL_WORK_TOOLS,
  WORK_PROFILE,
  type MinimalWorkProfile,
  type MinimalWorkToolName,
} from './profile'

const TOOL_SCHEMAS: AgentSnapshotToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description:
        'Read a file. Returns JSON: path, rawContent (exact text), contentHash (copy into edit expectedContentHash). Required before edit on existing files.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'File path relative to the workspace root (e.g. src/app.ts)',
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
        'Write full file contents (creates parents). Use for new files or large rewrites; prefer edit for small changes to existing files.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path from workspace root' },
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
            description: 'Directory relative to workspace root (use "." for root)',
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
        'Apply targeted edits to an existing file (immediate write). Provide path, edits: [{ oldText, newText }, ...], and expectedContentHash from read_file. All oldText values match the original snapshot, not each other incrementally.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path from workspace root' },
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
]

export function getMinimalToolSchemas(
  profile: MinimalWorkProfile = WORK_PROFILE,
): AgentSnapshotToolDefinition[] {
  const allowed = new Set(profile.allowedTools)
  return TOOL_SCHEMAS.filter((t) => allowed.has(t.function.name as MinimalWorkToolName))
}

function isAllowed(name: string, allowed: readonly MinimalWorkToolName[]): boolean {
  return (allowed as readonly string[]).includes(name)
}

async function readFileTool(workspaceRoot: string, pathArg: string): Promise<string> {
  const filePath = resolveWithinWorkspace(workspaceRoot, pathArg)
  const rawContent = await readFile(filePath, 'utf-8')
  return JSON.stringify({
    path: pathArg,
    rawContent,
    contentHash: computeAgentContentHash(rawContent),
    contentHashScope: 'full_file',
  })
}

async function writeFileTool(
  workspaceRoot: string,
  pathArg: string,
  content: string,
): Promise<string> {
  const filePath = resolveWithinWorkspace(workspaceRoot, pathArg)
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, content, 'utf-8')
  return `Wrote ${pathArg} (${content.length} characters)`
}

async function listFilesTool(workspaceRoot: string, pathArg: string): Promise<string> {
  const dirPath = resolveWithinWorkspace(workspaceRoot, pathArg || '.')
  const entries = await readdir(dirPath, { withFileTypes: true })
  const lines = entries.map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
  return lines.join('\n') || '(empty directory)'
}

export async function executeMinimalTool(
  workspaceRoot: string,
  name: string,
  argsJson: string,
  profile: MinimalWorkProfile = WORK_PROFILE,
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
        return { ok: true, text: await readFileTool(workspaceRoot, String(args.path ?? '')) }
      case 'write_file':
        return {
          ok: true,
          text: await writeFileTool(
            workspaceRoot,
            String(args.path ?? ''),
            String(args.content ?? ''),
          ),
        }
      case 'list_files':
        return { ok: true, text: await listFilesTool(workspaceRoot, String(args.path ?? '.')) }
      case 'edit': {
        const result = await executeMinimalEdit(workspaceRoot, argsJson)
        return { ok: result.ok, text: result.text }
      }
      default:
        return { ok: false, text: `Unknown tool: ${name}` }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, text: `Tool error (${name}): ${message}` }
  }
}

/** For docs / logging. */
export const MINIMAL_TOOL_NAMES = [...MINIMAL_WORK_TOOLS]
