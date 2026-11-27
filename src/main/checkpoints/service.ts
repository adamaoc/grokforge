import { join } from 'node:path'
import type { AgentTurnChanges, TurnRootChanges } from '../../shared/agent/checkpoint-contract'
import type { GrokProjectManifest, Root } from '../project/manifest'
import { projectDir } from '../project/store'
import { ShadowRepo } from './shadow-repo'

/** rootId → checkpoint commit taken before a turn. */
export type TurnCheckpoints = Map<string, string>

function safeSegment(id: string): string {
  return id.replace(/[^A-Za-z0-9._-]/g, '_') || 'root'
}

export function shadowRepoForRoot(projectId: string, root: Root, manifest: GrokProjectManifest): ShadowRepo {
  const gitDir = join(projectDir(projectId), 'checkpoints', `${safeSegment(root.id)}.git`)
  return new ShadowRepo(gitDir, root.path, manifest.ignore ?? [])
}

/** Snapshot every root. A root that cannot be snapshotted (e.g. git missing) is skipped. */
export async function snapshotProjectRoots(
  projectId: string,
  manifest: GrokProjectManifest,
  label: string,
): Promise<TurnCheckpoints> {
  const out: TurnCheckpoints = new Map()
  await Promise.all(
    manifest.roots.map(async (root) => {
      try {
        out.set(root.id, await shadowRepoForRoot(projectId, root, manifest).snapshot(label))
      } catch (e) {
        console.warn(`[GrokForge][checkpoints] snapshot failed for ${root.path}:`, e)
      }
    }),
  )
  return out
}

export async function collectTurnChanges(
  projectId: string,
  manifest: GrokProjectManifest,
  checkpoints: TurnCheckpoints,
): Promise<AgentTurnChanges> {
  const roots: TurnRootChanges[] = []
  for (const root of manifest.roots) {
    const checkpoint = checkpoints.get(root.id)
    if (!checkpoint) continue
    try {
      const files = await shadowRepoForRoot(projectId, root, manifest).changesSince(checkpoint)
      if (files.length) {
        roots.push({ rootId: root.id, rootLabel: root.label || root.id, rootPath: root.path, checkpoint, files })
      }
    } catch (e) {
      console.warn(`[GrokForge][checkpoints] diff failed for ${root.path}:`, e)
    }
  }
  return { roots }
}
