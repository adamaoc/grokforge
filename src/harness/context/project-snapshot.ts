/**
 * Lightweight workspace context for Plan mode system prompts.
 * Surfaces doc paths and stack hints so the planner reads real project material.
 */

import { existsSync } from 'node:fs'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { GrokProjectManifest } from '../../main/project/manifest'
import { loadWorkspaceIndex, type StoredWorkspaceIndex } from '../../harness-support/context/index-store'
import { isGreenfieldWorkspace } from '../../harness-support/context/workspace-greenfield'
import { formatWorkspaceIndexForPrompt } from './workspace-index-prompt'

/** Relative paths (from workspace root) the planner should read when present. */
export const PLAN_DISCOVERY_DOC_CANDIDATES = [
  'README.md',
  'readme.md',
  'README',
  'Readme.md',
  'AGENTS.md',
  'agents.md',
  'CLAUDE.md',
  'claude.md',
  'CONTRIBUTING.md',
  'contributing.md',
  'docs/README.md',
  'docs/readme.md',
] as const

export type PlanProjectSnapshot = {
  greenfieldWorkspace: boolean
  indexUpdatedAt: string | null
  fileCountScanned: number | null
  frameworkHints: string[]
  packageNames: string[]
  existingDocPaths: string[]
  docsDirectoryEntries: string[]
  otherRoots: Array<{ id: string; label: string }>
  /** Shared bounded index section (same formatter as work mode). */
  workspaceIndexPromptSection: string
}

function fileExistsUnderRoot(workspaceRoot: string, relativePath: string): boolean {
  try {
    return existsSync(join(workspaceRoot, relativePath))
  } catch {
    return false
  }
}

function discoverDocPaths(workspaceRoot: string): string[] {
  const found = new Set<string>()
  for (const candidate of PLAN_DISCOVERY_DOC_CANDIDATES) {
    if (fileExistsUnderRoot(workspaceRoot, candidate)) {
      found.add(candidate)
    }
  }
  return [...found].sort()
}

function listDocsTopLevel(workspaceRoot: string): string[] {
  const docsDir = join(workspaceRoot, 'docs')
  if (!existsSync(docsDir)) return []
  try {
    return readdirSync(docsDir, { withFileTypes: true })
      .filter((e) => e.isFile() && /\.(md|mdx|txt|rst)$/i.test(e.name))
      .map((e) => `docs/${e.name}`)
      .sort()
      .slice(0, 24)
  } catch {
    return []
  }
}

function frameworkHintsFromIndex(
  index: StoredWorkspaceIndex | null,
  activeRootId: string,
): { frameworkHints: string[]; packageNames: string[]; fileCountScanned: number | null } {
  if (!index) {
    return { frameworkHints: [], packageNames: [], fileCountScanned: null }
  }
  const pkgs = index.intelligence.packages.filter((p) => p.rootId === activeRootId)
  const frameworkHints = [
    ...new Set(pkgs.flatMap((p) => p.frameworkHints).filter(Boolean)),
  ].slice(0, 12)
  const packageNames = pkgs.map((p) => p.name).filter((n): n is string => Boolean(n)).slice(0, 6)
  return {
    frameworkHints,
    packageNames,
    fileCountScanned: index.intelligence.stats.fileCountScanned,
  }
}

export function buildPlanProjectSnapshot(
  manifest: GrokProjectManifest,
  projectId: string,
  workspaceRoot: string,
  activeRootId: string,
): PlanProjectSnapshot {
  const index = loadWorkspaceIndex(projectId)
  const { frameworkHints, packageNames, fileCountScanned } = frameworkHintsFromIndex(
    index,
    activeRootId,
  )
  const greenfieldWorkspace = isGreenfieldWorkspace({
    index: index
      ? {
          intelligence: {
            files: index.intelligence.files.map((f) => ({
              relativePath: f.relativePath,
              basename: f.basename,
            })),
            packages: index.intelligence.packages.map((p) => ({
              path: p.path,
              name: p.name,
            })),
            stats: { fileCountScanned: index.intelligence.stats.fileCountScanned },
          },
        }
      : null,
    retrievalMatchCount: 0,
  })

  const otherRoots = manifest.roots
    .filter((r) => r.id !== activeRootId)
    .map((r) => ({ id: r.id, label: r.label?.trim() || r.id }))

  return {
    greenfieldWorkspace,
    indexUpdatedAt: index?.updatedAt ?? null,
    fileCountScanned,
    frameworkHints,
    packageNames,
    existingDocPaths: discoverDocPaths(workspaceRoot),
    docsDirectoryEntries: listDocsTopLevel(workspaceRoot),
    otherRoots,
    workspaceIndexPromptSection: formatWorkspaceIndexForPrompt(manifest, index, {
      mode: 'plan',
      includeExplorationGuidance: false,
    }),
  }
}

/** Rendered into the Plan mode system prompt. */
export function formatPlanProjectContextSection(
  snapshot: PlanProjectSnapshot,
  manifest: GrokProjectManifest,
): string {
  const lines: string[] = ['## Project context (discovery)']
  if (manifest.roots.length === 1) {
    const only = manifest.roots[0]!
    lines.push(`Workspace root: **${only.label?.trim() || only.id}**.`)
  } else {
    lines.push('This project spans multiple workspace roots — discover each as needed.')
  }

  if (snapshot.greenfieldWorkspace) {
    lines.push(
      'Workspace appears **empty or nearly empty** (greenfield). Use `list_files` on `"."` once, then plan a concrete bootstrap for the requested stack.',
    )
  } else if (snapshot.fileCountScanned != null) {
    lines.push(`Indexed files (approx): **${snapshot.fileCountScanned}**.`)
  }

  if (snapshot.frameworkHints.length > 0) {
    lines.push(`Detected stack hints: ${snapshot.frameworkHints.join(', ')}.`)
  }
  if (snapshot.packageNames.length > 0) {
    lines.push(`Packages: ${snapshot.packageNames.join(', ')}.`)
  }

  lines.push(
    '',
    '**Before you finalize the plan**, read project material with `read_file` when paths **exist**:',
    'If the user wants a **new** doc or file that is not on disk yet, do **not** `read_file` it — list the path in `filesLikelyTouched` and plan `write_file` on the execute turn.',
  )

  const readTargets = [
    ...snapshot.existingDocPaths,
    ...snapshot.docsDirectoryEntries.filter((p) => !snapshot.existingDocPaths.includes(p)),
  ]

  if (readTargets.length > 0) {
    for (const p of readTargets) {
      lines.push(`- \`${p}\``)
    }
  } else {
    lines.push(
      '- No README/AGENTS/CLAUDE at repo root yet — run `list_files` on `"."` and `docs/` if present, then `read_file` on anything that explains architecture or conventions.',
    )
  }

  lines.push(
    '- `package.json`, `pyproject.toml`, `Cargo.toml`, or equivalent manifest when present (confirms dependencies and scripts).',
    '- Key entry files (`src/main.tsx`, `app/page.tsx`, etc.) if the task touches application code.',
  )

  if (snapshot.otherRoots.length > 0) {
    lines.push(
      '',
      'Additional roots (mention in plan when cross-root work is needed):',
      ...snapshot.otherRoots.map((r) => `- ${r.label} (\`${r.id}\`)`),
    )
  }

  return lines.join('\n')
}