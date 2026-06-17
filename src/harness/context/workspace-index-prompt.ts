/**
 * Shared workspace index formatting for harness v2 plan and work system prompts.
 */

import type { GrokProjectManifest, Root } from '../../main/project/manifest'
import {
  WORKSPACE_INDEX_MAX_ENTRIES_PER_ROOT,
  type WorkspaceIndexRootSummary,
} from '../../harness-support/context/context'
import type { StoredWorkspaceIndex } from '../../harness-support/context/index-store'

export type WorkspaceIndexPromptMode = 'work' | 'plan'

export type FormatWorkspaceIndexForPromptOptions = {
  mode?: WorkspaceIndexPromptMode
  includeExplorationGuidance?: boolean
}

const ROOT_TYPE_ORDER: Root['type'][] = [
  'code',
  'docs',
  'research',
  'design',
  'comms',
  'other',
]

function rootTypeRank(type: Root['type']): number {
  const idx = ROOT_TYPE_ORDER.indexOf(type)
  return idx === -1 ? ROOT_TYPE_ORDER.length : idx
}

function sortRootsForPrompt(manifest: GrokProjectManifest): Root[] {
  return [...manifest.roots].sort((a, b) => {
    const byType = rootTypeRank(a.type) - rootTypeRank(b.type)
    if (byType !== 0) return byType
    const labelA = a.label?.trim() || a.id
    const labelB = b.label?.trim() || b.id
    return labelA.localeCompare(labelB)
  })
}

function formatRootIndexBlock(
  manifestRoot: Root,
  summary: WorkspaceIndexRootSummary | undefined,
): string[] {
  const label = manifestRoot.label?.trim() || manifestRoot.id
  const lines: string[] = [
    `### ${label} (\`${manifestRoot.id}\`, ${manifestRoot.type})`,
    `Path: \`${manifestRoot.path}\``,
  ]

  if (!summary) {
    lines.push('Index: _(not built yet — call `workspace_index` or `list_files` on `"."`)_')
    return lines
  }

  if (summary.warning) {
    lines.push(`Warning: ${summary.warning}`)
    return lines
  }

  if (summary.packageHints.length > 0) {
    lines.push('Package hints:')
    for (const hint of summary.packageHints) lines.push(`- ${hint}`)
  }

  if (summary.importantFiles.length > 0) {
    lines.push('Important files:')
    for (const file of summary.importantFiles) {
      lines.push(`- \`${manifestRoot.id}:${file}\``)
    }
  }

  if (summary.entries.length > 0) {
    lines.push('Tree sketch:')
    for (const entry of summary.entries) {
      lines.push(`- \`${manifestRoot.id}:${entry}\``)
    }
  }

  if (summary.truncated) {
    lines.push(
      `Note: index truncated after ${WORKSPACE_INDEX_MAX_ENTRIES_PER_ROOT} entries for this root.`,
    )
  }

  return lines
}

function formatExplorationGuidance(mode: WorkspaceIndexPromptMode): string[] {
  if (mode === 'plan') {
    return [
      '## Workspace exploration (plan mode)',
      'The index above is a compact map — not a full file read.',
      'Use `workspace_index` when you need a fresher tree after structural changes; use `search_workspace` to locate features by name; use `read_file` only on **existing** paths.',
      'Prefer a complete `gf-plan` with assumptions in `risksUnknowns` over repeated discovery tool calls.',
    ]
  }

  return [
    '## Workspace exploration',
    'The index above is a compact map — not a full file read.',
    'When the user names a page, feature, or area **without** a file path, use `search_workspace` and/or `workspace_index`, then `read_file` on the best match.',
    'Prefer acting with tools over clarifying questions. Ask only when search leaves multiple equally likely targets.',
    'Call `workspace_index` with `refresh: true` after scaffold, install, or large structural changes if the sketch may be stale.',
    'Avoid re-reading files you already read this turn unless content may have changed.',
  ]
}

/**
 * Bounded, root-type-aware workspace map for system prompts (plan + work).
 */
export function formatWorkspaceIndexForPrompt(
  manifest: GrokProjectManifest,
  index: StoredWorkspaceIndex | null,
  options?: FormatWorkspaceIndexForPromptOptions,
): string {
  const mode = options?.mode ?? 'work'
  const includeExploration = options?.includeExplorationGuidance ?? true
  const summaryByRootId = new Map(
    (index?.summary.roots ?? []).map((root) => [root.rootId, root]),
  )

  const lines: string[] = [
    '## Workspace index (bounded, ignore-aware)',
    'Per-root tree sketch and package hints. Refreshes automatically when files are created or applied; call `workspace_index` with `refresh: true` if you need to force a rebuild.',
  ]

  if (index?.updatedAt) {
    lines.push(`Last indexed: ${index.updatedAt}.`)
  }

  if (index?.warnings.length) {
    for (const warning of index.warnings.slice(0, 6)) {
      lines.push(`Index warning: ${warning}`)
    }
  }

  const sortedRoots = sortRootsForPrompt(manifest)
  const multi = manifest.roots.length > 1
  if (multi) {
    const byType = new Map<Root['type'], Root[]>()
    for (const root of sortedRoots) {
      const bucket = byType.get(root.type) ?? []
      bucket.push(root)
      byType.set(root.type, bucket)
    }
    for (const type of ROOT_TYPE_ORDER) {
      const roots = byType.get(type)
      if (!roots?.length) continue
      lines.push('', `#### ${type} roots`)
      for (const root of roots) {
        lines.push('')
        lines.push(...formatRootIndexBlock(root, summaryByRootId.get(root.id)))
      }
    }
  } else {
    const only = sortedRoots[0]
    if (only) {
      lines.push('')
      lines.push(...formatRootIndexBlock(only, summaryByRootId.get(only.id)))
    }
  }

  if (includeExploration) {
    lines.push('', ...formatExplorationGuidance(mode))
  }

  return lines.join('\n')
}