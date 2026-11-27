import { ipcMain } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type {
  CheckpointFileDiffResult,
  CheckpointRevertResult,
} from '../../shared/agent/checkpoint-contract'
import type { GrokProjectManifest, Root } from '../project/manifest'
import { scheduleWorkspaceFilesystemRefresh } from '../workspace/fs-notify'
import { shadowRepoForRoot } from './service'

const MAX_DIFF_TEXT_BYTES = 1024 * 1024

const CheckpointId = z.string().regex(/^[0-9a-f]{7,64}$/)
const RelPath = z.string().min(1).max(4_096)

const DiffSchema = z.object({
  projectId: z.string().min(1),
  rootId: z.string().min(1),
  checkpoint: CheckpointId,
  path: RelPath,
})

const RevertSchema = z.object({
  projectId: z.string().min(1),
  rootId: z.string().min(1),
  checkpoint: CheckpointId,
  paths: z.array(RelPath).max(500),
})

type CurrentProject = () => { projectId: string | null; manifest: GrokProjectManifest | null }

function looksBinary(buf: Buffer): boolean {
  return buf.subarray(0, 8_000).includes(0)
}

async function readWorkTreeFile(abs: string): Promise<Buffer | null> {
  try {
    return await readFile(abs)
  } catch {
    return null
  }
}

/** Review / revert files an agent turn changed, against the checkpoint taken before it. */
export function registerCheckpointIpc(deps: { getCurrentProject: CurrentProject }): void {
  type Resolved = { ok: true; manifest: GrokProjectManifest; root: Root } | { ok: false; error: string }
  const resolveRoot = (projectId: string, rootId: string): Resolved => {
    const { projectId: currentId, manifest } = deps.getCurrentProject()
    if (!manifest || currentId !== projectId) return { ok: false, error: 'That project is not open.' }
    const root = manifest.roots.find((r) => r.id === rootId)
    if (!root) return { ok: false, error: 'Workspace root not found.' }
    return { ok: true, manifest, root }
  }

  ipcMain.handle('agent-checkpoint-file-diff', async (_, raw: unknown): Promise<CheckpointFileDiffResult> => {
    const parsed = DiffSchema.safeParse(raw)
    if (!parsed.success) return { ok: false, error: 'Invalid diff request.' }
    const { projectId, rootId, checkpoint, path } = parsed.data
    const target = resolveRoot(projectId, rootId)
    if (!target.ok) return { ok: false, error: target.error }

    const repo = shadowRepoForRoot(projectId, target.root, target.manifest)
    try {
      const before = await repo.fileAt(checkpoint, path)
      const after = await readWorkTreeFile(join(target.root.path, path))
      const binary = Boolean((before && looksBinary(before)) || (after && looksBinary(after)))
      if (binary) return { ok: true, before: null, after: null, binary: true, truncated: false }
      const truncated =
        (before?.length ?? 0) > MAX_DIFF_TEXT_BYTES || (after?.length ?? 0) > MAX_DIFF_TEXT_BYTES
      const text = (b: Buffer | null) => (b ? b.subarray(0, MAX_DIFF_TEXT_BYTES).toString('utf8') : null)
      return { ok: true, before: text(before), after: text(after), binary: false, truncated }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('agent-checkpoint-revert', async (_, raw: unknown): Promise<CheckpointRevertResult> => {
    const parsed = RevertSchema.safeParse(raw)
    if (!parsed.success) return { ok: false, error: 'Invalid revert request.' }
    const { projectId, rootId, checkpoint, paths } = parsed.data
    const target = resolveRoot(projectId, rootId)
    if (!target.ok) return { ok: false, error: target.error }

    try {
      const repo = shadowRepoForRoot(projectId, target.root, target.manifest)
      const reverted = await repo.revert(checkpoint, paths)
      scheduleWorkspaceFilesystemRefresh({
        projectId,
        manifest: target.manifest,
        paths: reverted.map((p) => join(target.root.path, p)),
        notifyRenderer: true,
        reason: 'mutation',
      })
      return { ok: true, reverted }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })
}
