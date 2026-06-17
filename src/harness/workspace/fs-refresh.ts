import { scheduleWorkspaceFilesystemRefresh } from '../../main/workspace/fs-notify'
import type { HarnessResolvedPath, HarnessToolEnv } from './paths'

/** Notify renderer + refresh workspace index after harness disk writes. */
export function notifyHarnessDiskMutation(
  env: HarnessToolEnv,
  resolved: HarnessResolvedPath,
): void {
  if (!env.projectId) return
  scheduleWorkspaceFilesystemRefresh({
    projectId: env.projectId,
    manifest: env.manifest,
    paths: [resolved.root.path, resolved.absPath],
    notifyRenderer: true,
    reason: 'agent_write',
  })
}