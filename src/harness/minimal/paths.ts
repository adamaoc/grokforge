/**
 * Workspace path resolution for minimal harness (v0: single root).
 *
 * Multi-root is deferred — see {@link DEFERRED-FEATURES.md}.
 * {@link loop.ts} and {@link tools.ts} both call into here so path rules stay consistent.
 */

import { resolve } from 'node:path'
import type { GrokProjectManifest, Root } from '../../main/manifest'
import { isPathWithinWorkspaceRoots } from '../../main/workspace-path-guard'

export type MinimalWorkspaceContext = {
  /** Absolute path on disk — all tool paths resolve under this. */
  workspaceRoot: string
  root: Root
  /** Short label for prompts/logs (manifest label or folder name). */
  displayLabel: string
}

function pickRoot(manifest: GrokProjectManifest, activeRootId?: string | null): Root {
  if (activeRootId) {
    const match = manifest.roots.find((r) => r.id === activeRootId)
    if (match) return match
  }
  return manifest.roots[0]!
}

/**
 * Resolves the one active workspace root for this turn.
 * v0 ignores secondary roots; re-enable multi-root in this module first.
 */
export function resolveMinimalWorkspace(
  manifest: GrokProjectManifest,
  activeRootId?: string | null,
): MinimalWorkspaceContext {
  const root = pickRoot(manifest, activeRootId)
  const workspaceRoot = resolve(root.path)
  const displayLabel = root.label?.trim() || root.id
  return { workspaceRoot, root, displayLabel }
}

/** Join relative path under workspace; throws if path escapes root. */
export function resolveWithinWorkspace(workspaceRoot: string, relativePath: string): string {
  const target = resolve(workspaceRoot, relativePath || '.')
  if (!isPathWithinWorkspaceRoots(target, [{ path: workspaceRoot }])) {
    throw new Error(`Path escapes workspace: ${relativePath}`)
  }
  return target
}
