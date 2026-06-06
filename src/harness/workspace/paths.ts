/**
 * Workspace path resolution for the minimal harness.
 *
 * The current runtime selects one active root per turn. Add multi-root support here first so
 * prompts and tools continue to share the same path rules.
 */

import { resolve } from 'node:path'
import type { GrokProjectManifest, Root } from '../../main/project/manifest'
import { isPathWithinWorkspaceRoots } from '../../main/workspace/path-guard'

export type HarnessWorkspaceContext = {
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
 * Resolves the active workspace root for this turn.
 */
export function resolveHarnessWorkspace(
  manifest: GrokProjectManifest,
  activeRootId?: string | null,
): HarnessWorkspaceContext {
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
