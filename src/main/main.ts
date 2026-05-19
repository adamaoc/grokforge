import 'dotenv/config'
import { app, BrowserWindow, ipcMain, dialog, session, shell, clipboard, nativeImage } from 'electron'
import { join, resolve, relative, isAbsolute } from 'path'
import { readFileSync, writeFileSync, existsSync, statSync } from 'fs'
import { readdir } from 'fs/promises'
import { randomUUID } from 'crypto'
import {
  GrokProjectManifest,
  type AddWorkspaceRootResult,
  type OpenProjectResult,
  type ProjectSessionSnapshot,
  type ReadDirectoryResult,
} from './manifest'
import {
  isVoiceRealtimeSocketOpen,
  sendVoiceAudioAppendBase64,
  startVoiceRealtime,
  stopVoiceRealtime,
} from './voice-realtime'
import { shouldIgnoreFsEntry } from './ignore-globs'
import { invalidateRepoIgnoreCheckerCache } from './repo-ignore'
import { mergeDiscoveredAgentInstructions } from './agent-instructions-discover'
import { applyWorkspaceFsMutate } from './workspace-fs-mutate'
import { isPathWithinWorkspaceRoots as pathIsWithinWorkspaceRoots } from './workspace-path-guard'
import {
  applyAgentToolWriteBatch,
  clearLastUndoBatch,
  peekLastUndoSnapshots,
  undoLastAgentWriteBatch,
} from './agent-tools'
import {
  appendAgentWriteHistory,
  getAgentWriteHistory,
  removeLatestAgentWriteHistoryEntry,
  revertAgentWriteBatch,
} from './agent-write-history-store'
import { computeAgentContentHash } from './agent-content-hash'
import {
  buildAgentContextPreview,
  buildChatSystemPrompt,
  type GetAgentContextPreviewResult,
  type GetChatSystemPromptResult,
} from './agent-context'
import { registerGrokStreamIpc, setGrokStreamTargetWindow } from './grok-stream'
import { registerAgentChatIpc, setAgentChatTargetWindow } from './agent-runner'
import { refreshWorkspaceIndex } from './agent-index-store'
import type { RefreshProjectIntelligenceResult } from '../shared/agent-chat-contract'
import {
  appendChatMessage,
  clearChatThread,
  loadChatThread,
  parseIncomingPersistPayload,
} from './chat-store'
import {
  loadProjectContextPins,
  saveProjectContextPins,
} from './agent-context-pins-store'
import { clearThreadMemory } from './agent-thread-memory-store'
import {
  AgentContextPinSchema,
  AGENT_CONTEXT_MAX_PINS_PER_PROJECT,
} from '../shared/agent-context-pins-contract'
import { StageChatAttachmentPayloadSchema } from '../shared/chat-attachment-contract'
import { parseAllowedExternalOpenUrl } from '../shared/external-open-url'
import { VoiceSessionStartPayloadSchema } from '../shared/voice-session-contract'
import { stageChatAttachment } from './chat-attachment-staging'
import { getGitDiffSessionForRoot, getGitStatusForRoot, type GitDiffSessionResult, type GitStatusSummary } from './git'
import type { SearchWorkspaceResult } from '../shared/workspace-search-contract'
import { cancelWorkspaceSearch, parseSearchWorkspacePayload, runWorkspaceSearch } from './workspace-search'
import {
  killAllTerminalSessions,
  killTerminalSession,
  parseTerminalSessionInputRequest,
  parseTerminalSessionKillRequest,
  parseTerminalSessionResizeRequest,
  parseTerminalSessionStartRequest,
  resizeTerminalSession,
  setTerminalSessionTargetWindow,
  startTerminalSession,
  writeTerminalSessionInput,
} from './terminal-session'
import type { TerminalSessionMutationResult, TerminalSessionStartResult } from '../shared/terminal-session-contract'
import { invokeTtsReadAloud, verifyTtsVoice } from './tts-read-aloud'
import {
  createStoredProject,
  deleteStoredProject,
  isStoredProjectPresent,
  loadStoredProject,
  saveManifestForProject,
  touchProjectLastOpened,
  updateStoredProjectDisplayName,
  type StoredWorkspaceProject,
} from './app-project-store'
import {
  getRecentProjectsSanitized,
  recordRecentProject,
  removeRecentProject,
  updateRecentProjectDisplayName,
} from './recent-projects-store'
import {
  RECENT_PROJECT_DISPLAY_NAME_MAX_LEN,
  type DeleteProjectResult,
  type OpenProjectByIdFailure,
  type RecentProjectEntry,
  type RemoveRecentProjectResult,
  type UpdateRecentPickerNameResult,
} from '../shared/recent-projects-contract'
import {
  clearStoredXaiKey,
  getXaiKeyStatusPayload,
  saveStoredXaiKey,
} from './xai-key-store'
import type { ClearXaiApiKeyResult, SetXaiApiKeyResult, XaiKeyStatusPayload } from '../shared/xai-key-settings-contract'
import type { WorkspaceFsMutateResult } from '../shared/workspace-fs-mutation-contract'
import type { AppInfoPayload } from '../shared/app-info-contract'

/** Shown in the macOS menu bar and other OS shells instead of the default "Electron". */
app.setName('GrokForge')

let mainWindow: BrowserWindow | null = null
let currentProject: GrokProjectManifest | null = null
/** App-side workspace project id (`userData/workspace-projects/<id>/`). */
let currentProjectId: string | null = null
let workspaceIndexRefreshTimer: NodeJS.Timeout | null = null

/** True only when electron-vite dev server is active — not merely “unpackaged”. */
const useDevServer = Boolean(process.env['ELECTRON_RENDERER_URL'])

const e2eUserDataDir = process.env['GROKFORGE_E2E_USER_DATA_DIR']
if (e2eUserDataDir) {
  app.setPath('userData', resolve(e2eUserDataDir))
}

/** electron-vite may emit `preload.mjs` (type: module) or `preload.js` depending on config. */
function resolvePreloadPath(): string {
  const preloadDir = join(__dirname, '../preload')
  const mjs = join(preloadDir, 'preload.mjs')
  const js = join(preloadDir, 'preload.js')
  if (existsSync(mjs)) return mjs
  if (existsSync(js)) return js
  console.error('[GrokForge] Preload not found:', mjs, 'or', js)
  return mjs
}

/** Push sanitized recents to renderer after disk changes. */
function notifyRecentProjectsChanged(): void {
  const list = getRecentProjectsSanitized()
  mainWindow?.webContents.send('recent-projects-changed', list)
}

function finishOpenProjectSession(stored: StoredWorkspaceProject): OpenProjectResult {
  killAllTerminalSessions()
  invalidateRepoIgnoreCheckerCache()
  currentProject = stored.manifest
  currentProjectId = stored.id
  scheduleWorkspaceIndexRefresh()
  recordRecentProject(stored.id, stored.manifest)
  notifyRecentProjectsChanged()
  return { manifest: stored.manifest, projectId: stored.id }
}

function scheduleWorkspaceIndexRefresh(): void {
  if (!currentProject || !currentProjectId) return
  if (workspaceIndexRefreshTimer) clearTimeout(workspaceIndexRefreshTimer)
  workspaceIndexRefreshTimer = setTimeout(() => {
    workspaceIndexRefreshTimer = null
    if (!currentProject || !currentProjectId) return
    try {
      refreshWorkspaceIndex(currentProjectId, currentProject)
    } catch (e) {
      console.warn('[GrokForge] failed to refresh workspace index:', e)
    }
  }, 750)
}

function isPathWithinWorkspaceRoots(candidate: string): boolean {
  if (!currentProject) return false
  return pathIsWithinWorkspaceRoots(candidate, currentProject.roots)
}

/** PNG next to `dist/` in dev and inside the app bundle when packaged (see `package.json` `build.files`). */
function resolveAppIconPath(): string | undefined {
  const fromDist = join(__dirname, '../../assets/GF-logo.png')
  if (existsSync(fromDist)) return fromDist
  const fromApp = join(app.getAppPath(), 'assets', 'GF-logo.png')
  if (existsSync(fromApp)) return fromApp
  return undefined
}

function createWindow() {
  const iconPath = resolveAppIconPath()
  const icon = iconPath ? nativeImage.createFromPath(iconPath) : undefined

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'GrokForge',
    ...(icon && !icon.isEmpty() ? { icon } : {}),
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: !useDevServer,
    },
    /**
     * macOS window chrome (story 022):
     * - `hiddenInset` — native traffic lights sit in the window corner; renderer draws edge-to-edge under them.
     *   Pair with renderer `-webkit-app-region: drag` / `no-drag` so users can move the window from custom HTML chrome.
     * - `trafficLightPosition` — aligns native controls with the renderer’s top chrome row (`Sidebar` / `ProjectHeader`, `h-14`).
     * Windows/Linux: `titleBarStyle` behaves differently (no inset traffic lights); drag regions still apply where Chromium supports them.
     */
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    backgroundColor: '#0a0a0a',
    show: false,
  })

  if (useDevServer) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']!)
    if (process.env.NODE_ENV === 'development') {
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    }
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    stopVoiceRealtime()
    setTerminalSessionTargetWindow(null)
    setGrokStreamTargetWindow(null)
    setAgentChatTargetWindow(null)
    mainWindow = null
  })

  setGrokStreamTargetWindow(mainWindow)
  setAgentChatTargetWindow(mainWindow)
  setTerminalSessionTargetWindow(mainWindow)
}

registerGrokStreamIpc()
registerAgentChatIpc({
  getCurrentProject: () => ({ projectId: currentProjectId, manifest: currentProject }),
})

app.whenReady().then(() => {
  /** Required for reliable `getUserMedia` in packaged builds (mic prompt / permission). */
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    if (permission === 'media') {
      callback(true)
    } else {
      callback(false)
    }
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission, _origin, _details) => {
    return permission === 'media'
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  killAllTerminalSessions()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  killAllTerminalSessions()
})

// IPC Handlers for GrokForge core features

const WINDOW_TITLE_MAX_LENGTH = 256

ipcMain.handle(
  'window-set-title',
  (_event, raw: unknown): { ok: true } | { ok: false; error: string } => {
    if (typeof raw !== 'string') {
      return { ok: false, error: 'Title must be a string' }
    }
    const trimmed = raw.trim()
    const clipped =
      trimmed.length > WINDOW_TITLE_MAX_LENGTH ? trimmed.slice(0, WINDOW_TITLE_MAX_LENGTH) : trimmed
    const title = clipped.length > 0 ? clipped : 'GrokForge'
    mainWindow?.setTitle(title)
    return { ok: true }
  },
)

ipcMain.handle(
  'open-external-url',
  async (_event, raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> => {
    if (typeof raw !== 'string' || !raw.trim()) {
      return { ok: false, error: 'Invalid URL' }
    }
    const parsed = parseAllowedExternalOpenUrl(typeof raw === 'string' ? raw : '')
    if (!parsed) {
      return {
        ok: false,
        error: 'Only https:// links and local http:// (localhost) links can be opened',
      }
    }
    try {
      await shell.openExternal(parsed.href)
      return { ok: true }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to open link'
      return { ok: false, error: msg }
    }
  },
)

ipcMain.handle(
  'clipboard-write-text',
  (_event, raw: unknown): { ok: true } | { ok: false; error: string } => {
    if (typeof raw !== 'string') {
      return { ok: false, error: 'Clipboard text must be a string' }
    }
    try {
      clipboard.writeText(raw)
      return { ok: true }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to write clipboard'
      return { ok: false, error: msg }
    }
  },
)

ipcMain.handle('get-app-info', (): AppInfoPayload => {
  return {
    name: app.getName() || 'GrokForge',
    version: app.getVersion(),
    electron: process.versions.electron ?? 'unknown',
    chromium: process.versions.chrome ?? 'unknown',
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
  }
})

ipcMain.handle('get-xai-key-status', (): XaiKeyStatusPayload => getXaiKeyStatusPayload())

ipcMain.handle('set-xai-api-key', async (_, raw: unknown): Promise<SetXaiApiKeyResult> => {
  if (raw === null || typeof raw !== 'object' || !('apiKey' in raw)) {
    return { ok: false, error: 'Invalid payload' }
  }
  const key = (raw as { apiKey: unknown }).apiKey
  if (typeof key !== 'string') {
    return { ok: false, error: 'API key must be a string' }
  }
  return saveStoredXaiKey(key)
})

ipcMain.handle('clear-xai-api-key', (): ClearXaiApiKeyResult => clearStoredXaiKey())

ipcMain.handle('open-project', async (): Promise<OpenProjectResult | null> => {
  const e2eProjectPath = process.env['GROKFORGE_E2E_OPEN_PROJECT_PATH']
  let resolved: string
  if (e2eProjectPath) {
    resolved = resolve(e2eProjectPath)
  } else {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
      title: 'New GrokForge project — pick a folder',
    })

    if (result.canceled || !result.filePaths.length) return null
    resolved = resolve(result.filePaths[0])
  }
  if (!existsSync(resolved)) {
    throw new Error('Project path does not exist')
  }
  let st: ReturnType<typeof statSync>
  try {
    st = statSync(resolved)
  } catch {
    throw new Error('Cannot read project path')
  }
  if (!st.isDirectory()) {
    throw new Error('Project path is not a directory')
  }

  const stored = createStoredProject(resolved)
  return finishOpenProjectSession(stored)
})

ipcMain.handle('get-recent-projects', (): RecentProjectEntry[] => getRecentProjectsSanitized())

const PROJECT_ID_MAX_LEN = 128

function parseProjectIdPayload(raw: unknown): string | null {
  if (raw === null || typeof raw !== 'object' || !('projectId' in raw)) return null
  const id = (raw as { projectId: unknown }).projectId
  if (typeof id !== 'string' || !id.trim()) return null
  const t = id.trim()
  if (t.length > PROJECT_ID_MAX_LEN) return null
  return t
}

ipcMain.handle('remove-recent-project', (_, raw: unknown): RemoveRecentProjectResult => {
  const id = parseProjectIdPayload(raw)
  if (!id) {
    return { ok: false, error: 'Invalid payload' }
  }
  removeRecentProject(id)
  notifyRecentProjectsChanged()
  return { ok: true }
})

ipcMain.handle('delete-project', (_, raw: unknown): DeleteProjectResult => {
  const id = parseProjectIdPayload(raw)
  if (!id) {
    return { ok: false, error: 'Invalid payload' }
  }
  if (currentProjectId === id) {
    killAllTerminalSessions()
    invalidateRepoIgnoreCheckerCache()
    currentProject = null
    currentProjectId = null
  }
  deleteStoredProject(id)
  removeRecentProject(id)
  notifyRecentProjectsChanged()
  return { ok: true }
})

ipcMain.handle('update-recent-picker-name', (_, raw: unknown): UpdateRecentPickerNameResult => {
  if (raw === null || typeof raw !== 'object' || !('projectId' in raw) || !('displayName' in raw)) {
    return { ok: false, error: 'Invalid payload' }
  }
  const projectId = (raw as { projectId: unknown }).projectId
  const displayName = (raw as { displayName: unknown }).displayName
  if (typeof projectId !== 'string' || !projectId.trim()) {
    return { ok: false, error: 'Invalid project id' }
  }
  if (typeof displayName !== 'string') {
    return { ok: false, error: 'Invalid name' }
  }
  const trimmedId = projectId.trim()
  const trimmedName = displayName.trim()
  if (trimmedId.length > PROJECT_ID_MAX_LEN) {
    return { ok: false, error: 'Invalid project id' }
  }
  if (!trimmedName) {
    return { ok: false, error: 'Name cannot be empty' }
  }
  if (trimmedName.length > RECENT_PROJECT_DISPLAY_NAME_MAX_LEN) {
    return { ok: false, error: 'Name too long' }
  }
  const visible = getRecentProjectsSanitized()
  if (!visible.some((e) => e.projectId === trimmedId)) {
    return { ok: false, error: 'Project not in recent list' }
  }
  updateStoredProjectDisplayName(trimmedId, trimmedName)
  updateRecentProjectDisplayName(trimmedId, trimmedName)
  notifyRecentProjectsChanged()
  return { ok: true }
})

ipcMain.handle(
  'open-project-by-id',
  async (_, raw: unknown): Promise<OpenProjectResult | OpenProjectByIdFailure> => {
    const id =
      typeof raw === 'string'
        ? raw.trim()
        : raw !== null && typeof raw === 'object' && 'projectId' in raw
          ? parseProjectIdPayload(raw)
          : null
    if (!id || id.length > PROJECT_ID_MAX_LEN) {
      return { ok: false, error: 'Invalid project id' }
    }
    try {
      touchProjectLastOpened(id)
      const stored = loadStoredProject(id)
      if (!stored) {
        return { ok: false, error: 'Project not found' }
      }
      return finishOpenProjectSession(stored)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to open project'
      return { ok: false, error: msg }
    }
  },
)

ipcMain.handle('get-project', (): ProjectSessionSnapshot => ({
  manifest: currentProject,
  projectId: currentProjectId,
}))

ipcMain.handle('save-manifest', async (_, manifest: GrokProjectManifest) => {
  if (!currentProject || !currentProjectId) return false
  try {
    saveManifestForProject(currentProjectId, manifest)
    const fresh = loadStoredProject(currentProjectId)
    if (fresh) {
      currentProject = fresh.manifest
      invalidateRepoIgnoreCheckerCache()
      scheduleWorkspaceIndexRefresh()
    }
    return true
  } catch {
    return false
  }
})

ipcMain.handle('read-directory', async (_, dirPath: unknown): Promise<ReadDirectoryResult> => {
  if (typeof dirPath !== 'string' || !dirPath.trim()) {
    return { ok: false, error: 'Invalid path' }
  }
  if (!currentProject) {
    return { ok: false, error: 'No project loaded' }
  }

  const resolved = resolve(dirPath)
  if (!isPathWithinWorkspaceRoots(resolved)) {
    return { ok: false, error: 'Path outside workspace roots' }
  }

  const project = currentProject
  try {
    const dirents = await readdir(resolved, { withFileTypes: true })
    const ignore = project.ignore ?? []
    const entries = dirents
      .map((d) => ({
        name: d.name,
        path: join(resolved, d.name),
        isDirectory: d.isDirectory(),
      }))
      .filter((e) => !shouldIgnoreFsEntry(e.path, project.roots, ignore))
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })
    return { ok: true, entries }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to read directory'
    return { ok: false, error: msg }
  }
})

ipcMain.handle('read-file', async (_, filePath: unknown) => {
  if (typeof filePath !== 'string' || !filePath.trim()) return null
  const resolved = resolve(filePath)
  if (!isPathWithinWorkspaceRoots(resolved)) return null
  try {
    return readFileSync(resolved, 'utf-8')
  } catch {
    return null
  }
})

ipcMain.handle('compute-agent-content-hash', (_, content: unknown) => {
  if (typeof content !== 'string') return null
  return computeAgentContentHash(content)
})

ipcMain.handle('write-file', async (_, filePath: unknown, content: unknown) => {
  if (typeof filePath !== 'string' || !filePath.trim()) return false
  if (typeof content !== 'string') return false
  const resolved = resolve(filePath)
  if (!isPathWithinWorkspaceRoots(resolved)) return false
  try {
    writeFileSync(resolved, content)
    const base = resolved.split(/[\\/]/).filter(Boolean).pop() ?? ''
    if (base === '.gitignore' || base === '.cursorignore') {
      invalidateRepoIgnoreCheckerCache()
    }
    scheduleWorkspaceIndexRefresh()
    return true
  } catch {
    return false
  }
})

ipcMain.handle('workspace-fs-mutate', async (_, raw: unknown): Promise<WorkspaceFsMutateResult> => {
  const result = await applyWorkspaceFsMutate(currentProject, raw)
  if (result.ok) {
    invalidateRepoIgnoreCheckerCache()
    scheduleWorkspaceIndexRefresh()
  }
  return result
})

ipcMain.handle('agent-tool-batch', async (_, raw: unknown) => {
  if (!currentProject) {
    return { ok: false, error: 'No project loaded' } as const
  }
  const result = applyAgentToolWriteBatch(currentProject, raw)
  if (result.ok && result.applied.length > 0) {
    invalidateRepoIgnoreCheckerCache()
    scheduleWorkspaceIndexRefresh()
    if (currentProjectId) {
      const undoSnapshots = peekLastUndoSnapshots()
      if (undoSnapshots?.length) {
        const entry = appendAgentWriteHistory(currentProjectId, {
          applied: result.applied,
          undoSnapshots,
        })
        return { ...result, batchId: entry.batchId }
      }
    }
  }
  return result
})

ipcMain.handle('agent-undo-last-batch', async () => {
  if (!currentProject) {
    return { ok: false, error: 'No project loaded' } as const
  }
  let result
  if (currentProjectId) {
    const latest = removeLatestAgentWriteHistoryEntry(currentProjectId)
    if (latest) {
      const undoable = latest.snapshots
        .filter((s) => s.snapshotAvailable)
        .map((s) => ({ path: s.path, content: s.beforeContent }))
      result = undoLastAgentWriteBatch(currentProject, undoable.length > 0 ? undoable : null)
      clearLastUndoBatch()
    } else {
      result = undoLastAgentWriteBatch(currentProject)
    }
  } else {
    result = undoLastAgentWriteBatch(currentProject)
  }
  if (result.ok && result.restoredPaths.length > 0) {
    invalidateRepoIgnoreCheckerCache()
    scheduleWorkspaceIndexRefresh()
  }
  return result
})

ipcMain.handle('get-agent-write-history', (_, raw: unknown) => {
  if (!raw || typeof raw !== 'object') {
    return { ok: false as const, error: 'Invalid payload' }
  }
  const projectId =
    typeof (raw as { projectId?: unknown }).projectId === 'string'
      ? (raw as { projectId: string }).projectId.trim()
      : ''
  if (!projectId || !isStoredProjectPresent(projectId)) {
    return { ok: false as const, error: 'Unknown project' }
  }
  return getAgentWriteHistory(projectId)
})

ipcMain.handle('revert-agent-write-batch', (_, raw: unknown) => {
  if (!currentProject) {
    return { ok: false as const, error: 'No project loaded' }
  }
  if (!raw || typeof raw !== 'object') {
    return { ok: false as const, error: 'Invalid payload' }
  }
  const o = raw as { projectId?: unknown; batchId?: unknown }
  const projectId = typeof o.projectId === 'string' && o.projectId.trim() ? o.projectId.trim() : ''
  const batchId = typeof o.batchId === 'string' && o.batchId.trim() ? o.batchId.trim() : ''
  if (!projectId || !isStoredProjectPresent(projectId)) {
    return { ok: false as const, error: 'Unknown project' }
  }
  if (!batchId) {
    return { ok: false as const, error: 'Missing batch id' }
  }
  const result = revertAgentWriteBatch(projectId, batchId, currentProject)
  if (result.ok && result.restoredPaths.length > 0) {
    clearLastUndoBatch()
    invalidateRepoIgnoreCheckerCache()
    scheduleWorkspaceIndexRefresh()
  }
  return result
})

ipcMain.handle('list-roots', () => {
  return currentProject?.roots || []
})

/**
 * Story 025: append a new workspace root to the current manifest after the user picks a folder.
 * Opens a native folder picker; rejects if the path is the same as / inside / a parent of an existing root.
 * `.git` presence at the picked folder enables git status by default (story 015).
 */
ipcMain.handle('add-workspace-root', async (): Promise<AddWorkspaceRootResult | null> => {
  if (!currentProject || !currentProjectId || !mainWindow) {
    return { ok: false, error: 'No project loaded' }
  }
  const project = currentProject
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Add workspace root',
  })
  if (result.canceled || !result.filePaths.length) return null

  const picked = resolve(result.filePaths[0])
  let st: ReturnType<typeof statSync>
  try {
    st = statSync(picked)
  } catch {
    return { ok: false, error: 'Cannot read that folder' }
  }
  if (!st.isDirectory()) {
    return { ok: false, error: 'Selected path is not a directory' }
  }

  for (const existing of project.roots) {
    const existingAbs = resolve(existing.path)
    if (existingAbs === picked) {
      return { ok: false, error: `That folder is already a root: "${existing.label}"` }
    }
    const relFromExisting = relative(existingAbs, picked)
    if (relFromExisting !== '' && !relFromExisting.startsWith('..') && !isAbsolute(relFromExisting)) {
      return {
        ok: false,
        error: `That folder is already inside root "${existing.label}". Pick a different folder.`,
      }
    }
    const relFromPicked = relative(picked, existingAbs)
    if (relFromPicked !== '' && !relFromPicked.startsWith('..') && !isAbsolute(relFromPicked)) {
      return {
        ok: false,
        error: `That folder contains existing root "${existing.label}". Pick a more specific folder.`,
      }
    }
  }

  const basename = picked.split(/[\\/]/).filter(Boolean).pop() ?? 'New Root'
  const hasGit = existsSync(join(picked, '.git'))
  const idCandidate = basename
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
  const usedIds = new Set(project.roots.map((r) => r.id))
  let id = idCandidate.length > 0 ? idCandidate : `root-${randomUUID().slice(0, 8)}`
  if (usedIds.has(id)) {
    id = `${idCandidate || 'root'}-${randomUUID().slice(0, 8)}`
  }

  const nextRoots = [
    ...project.roots,
    {
      id,
      path: picked,
      type: 'code' as const,
      label: basename,
      ...(hasGit ? { git: true as const, defaultBranch: 'main' as const } : {}),
    },
  ]

  const nextManifest: GrokProjectManifest = {
    ...project,
    roots: nextRoots,
    context: {
      ...project.context,
      alwaysInclude: mergeDiscoveredAgentInstructions(
        project.context.alwaysInclude,
        nextRoots,
        project.ignore ?? [],
      ),
    },
    metadata: {
      ...project.metadata,
      lastOpened: new Date().toISOString(),
    },
  }

  try {
    saveManifestForProject(currentProjectId, nextManifest)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to save manifest'
    return { ok: false, error: msg }
  }
  currentProject = nextManifest
  invalidateRepoIgnoreCheckerCache()
  scheduleWorkspaceIndexRefresh()
  recordRecentProject(currentProjectId, nextManifest)
  notifyRecentProjectsChanged()
  return { ok: true, manifest: nextManifest }
})

ipcMain.handle('get-agent-context-preview', (): GetAgentContextPreviewResult => {
  if (!currentProject) {
    return { ok: false, error: 'No project loaded' }
  }
  try {
    return { ok: true, preview: buildAgentContextPreview(currentProject) }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to build agent context preview'
    return { ok: false, error: msg }
  }
})

ipcMain.handle('get-chat-system-prompt', (): GetChatSystemPromptResult => {
  if (!currentProject) {
    return { ok: false, error: 'No project loaded' }
  }
  try {
    const { systemPrompt, warnings } = buildChatSystemPrompt(currentProject)
    return { ok: true, systemPrompt, warnings }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to build chat system prompt'
    return { ok: false, error: msg }
  }
})

ipcMain.handle('refresh-project-intelligence', (): RefreshProjectIntelligenceResult => {
  if (!currentProject || !currentProjectId) {
    return { ok: false, error: 'No project loaded' }
  }
  try {
    const index = refreshWorkspaceIndex(currentProjectId, currentProject)
    return {
      ok: true,
      updatedAt: index.updatedAt,
      fileCountScanned: index.intelligence.stats.fileCountScanned,
      sensitiveSkipped: index.intelligence.stats.skippedSensitive,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to refresh project intelligence'
    return { ok: false, error: msg }
  }
})

ipcMain.handle('load-chat-thread', (): ReturnType<typeof loadChatThread> => {
  if (!currentProjectId) {
    return { ok: false, error: 'No project loaded' }
  }
  return loadChatThread(currentProjectId)
})

ipcMain.handle('append-chat-message-for-project', (_, raw: unknown) => {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Invalid payload' } as const
  }
  const o = raw as { projectId?: unknown; payload?: unknown }
  const projectId = typeof o.projectId === 'string' && o.projectId.trim() ? o.projectId.trim() : ''
  if (!projectId || !isStoredProjectPresent(projectId)) {
    return { ok: false, error: 'Unknown project' } as const
  }
  const record = parseIncomingPersistPayload(o.payload)
  if (!record) {
    return { ok: false, error: 'Invalid chat message payload' } as const
  }
  if (record.id === 'welcome') {
    return { ok: false, error: 'Cannot persist synthetic welcome message' } as const
  }
  return appendChatMessage(projectId, record)
})

ipcMain.handle('append-chat-message', (_, payload: unknown) => {
  if (!currentProjectId) {
    return { ok: false, error: 'No project loaded' } as const
  }
  const record = parseIncomingPersistPayload(payload)
  if (!record) {
    return { ok: false, error: 'Invalid chat message payload' } as const
  }
  if (record.id === 'welcome') {
    return { ok: false, error: 'Cannot persist synthetic welcome message' } as const
  }
  return appendChatMessage(currentProjectId, record)
})

ipcMain.handle('clear-chat-thread', (): ReturnType<typeof clearChatThread> => {
  if (!currentProjectId) {
    return { ok: false, error: 'No project loaded' }
  }
  clearThreadMemory(currentProjectId)
  return clearChatThread(currentProjectId)
})

ipcMain.handle('get-project-context-pins', (_, raw: unknown) => {
  if (!raw || typeof raw !== 'object') {
    return { ok: false as const, error: 'Invalid payload' }
  }
  const projectId =
    typeof (raw as { projectId?: unknown }).projectId === 'string'
      ? (raw as { projectId: string }).projectId.trim()
      : ''
  if (!projectId || !isStoredProjectPresent(projectId)) {
    return { ok: false as const, error: 'Unknown project' }
  }
  return loadProjectContextPins(projectId)
})

ipcMain.handle('set-project-context-pins', (_, raw: unknown) => {
  if (!raw || typeof raw !== 'object') {
    return { ok: false as const, error: 'Invalid payload' }
  }
  const o = raw as { projectId?: unknown; pins?: unknown }
  const projectId = typeof o.projectId === 'string' && o.projectId.trim() ? o.projectId.trim() : ''
  if (!projectId || !isStoredProjectPresent(projectId)) {
    return { ok: false as const, error: 'Unknown project' }
  }
  if (!Array.isArray(o.pins) || o.pins.length > AGENT_CONTEXT_MAX_PINS_PER_PROJECT) {
    return { ok: false as const, error: 'Invalid pins list' }
  }
  const pins = []
  for (const item of o.pins) {
    const parsed = AgentContextPinSchema.safeParse(item)
    if (!parsed.success) {
      return { ok: false as const, error: 'Invalid pin entry' }
    }
    pins.push(parsed.data)
  }
  const stored = loadStoredProject(projectId)
  if (!stored) {
    return { ok: false as const, error: 'Unknown project' }
  }
  return saveProjectContextPins(projectId, stored.manifest, pins)
})

ipcMain.handle('stage-chat-attachment', (_, raw: unknown) => {
  if (!currentProjectId) {
    return { ok: false as const, error: 'No project loaded' }
  }
  const parsed = StageChatAttachmentPayloadSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false as const, error: 'Invalid attachment request.' }
  }
  return stageChatAttachment(currentProjectId, parsed.data)
})

ipcMain.handle('voice-session-start', async (_, raw: unknown) => {
  if (!currentProject || !currentProjectId) {
    return { ok: false as const, error: 'No project loaded' }
  }
  if (!mainWindow) {
    return { ok: false as const, error: 'No browser window' }
  }
  const parsed = VoiceSessionStartPayloadSchema.safeParse(raw ?? {})
  if (!parsed.success) {
    return { ok: false as const, error: 'Invalid voice session payload.' }
  }
  const threadSummary = parsed.data.threadSummary?.trim()
  return startVoiceRealtime(mainWindow, currentProject, threadSummary ? { threadSummary } : undefined)
})

ipcMain.handle('voice-session-stop', () => {
  stopVoiceRealtime()
  return { ok: true as const }
})

ipcMain.on('voice-audio-chunk', (_, payload: unknown) => {
  if (!isVoiceRealtimeSocketOpen()) return
  if (typeof payload !== 'string' || !payload.length) return
  sendVoiceAudioAppendBase64(payload)
})

ipcMain.handle('git-status', async (_, payload: unknown): Promise<GitStatusSummary> => {
  const rootId =
    payload &&
    typeof payload === 'object' &&
    'rootId' in payload &&
    typeof (payload as { rootId: unknown }).rootId === 'string'
      ? (payload as { rootId: string }).rootId.trim()
      : ''
  if (!rootId) {
    return { ok: false, code: 'invalid_request', message: 'Expected { rootId: string }' }
  }
  return getGitStatusForRoot(currentProject, rootId)
})

ipcMain.handle('git-diff-session', async (_, payload: unknown): Promise<GitDiffSessionResult> => {
  const rootId =
    payload &&
    typeof payload === 'object' &&
    'rootId' in payload &&
    typeof (payload as { rootId: unknown }).rootId === 'string'
      ? (payload as { rootId: string }).rootId.trim()
      : ''
  if (!rootId) {
    return { ok: false, code: 'invalid_request', message: 'Expected { rootId: string }' }
  }
  return getGitDiffSessionForRoot(currentProject, rootId)
})

ipcMain.handle('search-workspace', async (_, payload: unknown): Promise<SearchWorkspaceResult> => {
  if (!currentProject) {
    return { ok: false, error: 'No project loaded' }
  }
  const req = parseSearchWorkspacePayload(payload)
  if (!req) {
    return { ok: false, error: 'Invalid payload: expected { query: string, caseSensitive?, regex? }' }
  }
  return runWorkspaceSearch(currentProject, mainWindow, req)
})

ipcMain.handle('search-workspace-cancel', () => {
  cancelWorkspaceSearch()
  return { ok: true as const }
})

ipcMain.handle('terminal-session-start', async (_, payload: unknown): Promise<TerminalSessionStartResult> => {
  const req = parseTerminalSessionStartRequest(payload)
  if (!req) return { ok: false, error: 'Invalid payload: expected { rootId, cols, rows, shell? }', code: 'invalid' }
  return startTerminalSession(currentProject, req)
})

ipcMain.handle('terminal-session-input', async (_, payload: unknown): Promise<TerminalSessionMutationResult> => {
  const req = parseTerminalSessionInputRequest(payload)
  if (!req) return { ok: false, error: 'Invalid payload: expected { sessionId, data }', code: 'invalid' }
  return writeTerminalSessionInput(req)
})

ipcMain.handle('terminal-session-resize', async (_, payload: unknown): Promise<TerminalSessionMutationResult> => {
  const req = parseTerminalSessionResizeRequest(payload)
  if (!req) return { ok: false, error: 'Invalid payload: expected { sessionId, cols, rows }', code: 'invalid' }
  return resizeTerminalSession(req)
})

ipcMain.handle('terminal-session-kill', async (_, payload: unknown): Promise<TerminalSessionMutationResult> => {
  const req = parseTerminalSessionKillRequest(payload)
  if (!req) return { ok: false, error: 'Invalid payload: expected { sessionId }', code: 'invalid' }
  return killTerminalSession(req)
})

ipcMain.handle('tts-read-aloud', async (_, payload: unknown) => invokeTtsReadAloud(payload))

ipcMain.handle('tts-verify-voice', async (_, voiceId: unknown) => verifyTtsVoice(voiceId))
