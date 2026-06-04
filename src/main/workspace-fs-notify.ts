import type { BrowserWindow } from 'electron'
import type { WorkspaceFsChangeReason, WorkspaceFsChangedPayload } from '../shared/workspace-fs-change-contract'
import { refreshWorkspaceIndex } from '../harness/context/index-store'
import type { GrokProjectManifest } from './manifest'

const REFRESH_DEBOUNCE_MS = 750

let targetWindow: BrowserWindow | null = null
let refreshTimer: ReturnType<typeof setTimeout> | null = null
const pendingPaths = new Set<string>()
let pendingProjectId: string | null = null
let pendingManifest: GrokProjectManifest | null = null
let pendingNotifyRenderer = false
let pendingReason: WorkspaceFsChangeReason = 'mutation'

export function setWorkspaceFsNotifyTargetWindow(win: BrowserWindow | null): void {
  targetWindow = win
}

export function scheduleWorkspaceFilesystemRefresh(input: {
  projectId: string
  manifest: GrokProjectManifest
  paths?: string[]
  notifyRenderer?: boolean
  reason?: WorkspaceFsChangeReason
}): void {
  pendingProjectId = input.projectId
  pendingManifest = input.manifest
  for (const path of input.paths ?? []) {
    if (path.trim()) pendingPaths.add(path)
  }
  if (input.notifyRenderer) pendingNotifyRenderer = true
  if (input.reason) pendingReason = input.reason

  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(flushWorkspaceFilesystemRefresh, REFRESH_DEBOUNCE_MS)
}

function flushWorkspaceFilesystemRefresh(): void {
  refreshTimer = null
  const projectId = pendingProjectId
  const manifest = pendingManifest
  const paths = Array.from(pendingPaths)
  const notifyRenderer = pendingNotifyRenderer
  const reason = pendingReason

  pendingPaths.clear()
  pendingProjectId = null
  pendingManifest = null
  pendingNotifyRenderer = false
  pendingReason = 'mutation'

  if (!projectId || !manifest) return

  try {
    refreshWorkspaceIndex(projectId, manifest)
  } catch (e) {
    console.warn('[GrokForge] failed to refresh workspace index:', e)
  }

  if (!notifyRenderer || !targetWindow) return

  const payload: WorkspaceFsChangedPayload = { paths, reason }
  targetWindow.webContents.send('workspace-fs-changed', payload)
}

/** Test helper — run pending debounced refresh immediately. */
export function flushWorkspaceFilesystemRefreshForTests(): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }
  flushWorkspaceFilesystemRefresh()
}

/** Test helper — reset module state between tests. */
export function resetWorkspaceFilesystemRefreshForTests(): void {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = null
  pendingPaths.clear()
  pendingProjectId = null
  pendingManifest = null
  pendingNotifyRenderer = false
  pendingReason = 'mutation'
  targetWindow = null
}
