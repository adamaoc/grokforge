import "dotenv/config";
import {
  app,
  BrowserWindow,
  session,
  nativeImage,
} from "electron";
import { join, resolve } from "path";
import { existsSync } from "fs";
import {
  GrokProjectManifest,
  type OpenProjectResult,
} from "./project/manifest";
import { stopVoiceRealtime } from "./voice/realtime";
import { invalidateRepoIgnoreCheckerCache } from "./workspace/repo-ignore";
import { isPathWithinWorkspaceRoots as pathIsWithinWorkspaceRoots } from "./workspace/path-guard";
import {
  registerGrokStreamIpc,
  setGrokStreamTargetWindow,
} from "./xai/stream";
import {
  flushActiveAgentTurnReceiptsAsInterruptedForApp,
  registerAgentChatIpc,
  setAgentChatTargetWindow,
} from "./agent/runner";
import {
  scheduleWorkspaceFilesystemRefresh,
  setWorkspaceFsNotifyTargetWindow,
} from "./workspace/fs-notify";
import type { WorkspaceFsChangeReason } from "../shared/workspace/fs-change-contract";
import {
  killAllTerminalSessions,
} from "./terminal/session";
import {
  type StoredWorkspaceProject,
} from "./project/store";
import {
  getRecentProjectsSanitized,
  recordRecentProject,
} from "./project/recent-store";
import { registerAppIpc } from "./app/register-ipc";
import { registerXaiSettingsIpc } from "./xai/register-ipc";
import { registerGitIpc } from "./git/register-ipc";
import {
  registerTerminalIpc,
  setTerminalIpcTargetWindow,
} from "./terminal/register-ipc";
import { registerVoiceIpc } from "./voice/register-ipc";
import { registerProjectIpc } from "./project/register-ipc";
import { registerWorkspaceIpc } from "./workspace/register-ipc";
import { registerAgentSupportIpc } from "./agent/register-ipc";
import { registerChatIpc } from "./chat/register-ipc";

/** Shown in the macOS menu bar and other OS shells instead of the default "Electron". */
app.setName("GrokForge");

let mainWindow: BrowserWindow | null = null;
let currentProject: GrokProjectManifest | null = null;
/** App-side workspace project id (`userData/workspace-projects/<id>/`). */
let currentProjectId: string | null = null;

/** True only when electron-vite dev server is active — not merely “unpackaged”. */
const useDevServer = Boolean(process.env["ELECTRON_RENDERER_URL"]);

const e2eUserDataDir = process.env["GROKFORGE_E2E_USER_DATA_DIR"];
if (e2eUserDataDir) {
  app.setPath("userData", resolve(e2eUserDataDir));
}

/** electron-vite may emit `preload.mjs` (type: module) or `preload.js` depending on config. */
function resolvePreloadPath(): string {
  const preloadDir = join(__dirname, "../preload");
  const mjs = join(preloadDir, "preload.mjs");
  const js = join(preloadDir, "preload.js");
  if (existsSync(mjs)) return mjs;
  if (existsSync(js)) return js;
  console.error("[GrokForge] Preload not found:", mjs, "or", js);
  return mjs;
}

/** Push sanitized recents to renderer after disk changes. */
function notifyRecentProjectsChanged(): void {
  const list = getRecentProjectsSanitized();
  mainWindow?.webContents.send("recent-projects-changed", list);
}

function finishOpenProjectSession(
  stored: StoredWorkspaceProject,
): OpenProjectResult {
  killAllTerminalSessions();
  invalidateRepoIgnoreCheckerCache();
  currentProject = stored.manifest;
  currentProjectId = stored.id;
  scheduleWorkspaceIndexRefresh();
  recordRecentProject(stored.id, stored.manifest);
  notifyRecentProjectsChanged();
  return { manifest: stored.manifest, projectId: stored.id };
}

function scheduleWorkspaceIndexRefresh(options?: {
  paths?: string[];
  notifyRenderer?: boolean;
  reason?: WorkspaceFsChangeReason;
}): void {
  if (!currentProject || !currentProjectId) return;
  scheduleWorkspaceFilesystemRefresh({
    projectId: currentProjectId,
    manifest: currentProject,
    paths: options?.paths,
    notifyRenderer: options?.notifyRenderer,
    reason: options?.reason,
  });
}

function isPathWithinWorkspaceRoots(candidate: string): boolean {
  if (!currentProject) return false;
  return pathIsWithinWorkspaceRoots(candidate, currentProject.roots);
}

/** PNG next to `dist/` in dev and inside the app bundle when packaged (see `package.json` `build.files`). */
function resolveAppIconPath(): string | undefined {
  const fromDist = join(__dirname, "../../assets/GF-logo.png");
  if (existsSync(fromDist)) return fromDist;
  const fromApp = join(app.getAppPath(), "assets", "GF-logo.png");
  if (existsSync(fromApp)) return fromApp;
  return undefined;
}

function createWindow() {
  const iconPath = resolveAppIconPath();
  const icon = iconPath ? nativeImage.createFromPath(iconPath) : undefined;

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: "GrokForge",
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
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 12, y: 12 },
    backgroundColor: "#0a0a0a",
    show: false,
  });

  if (useDevServer) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]!);
    if (process.env.NODE_ENV === "development") {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    stopVoiceRealtime();
    setTerminalIpcTargetWindow(null);
    setGrokStreamTargetWindow(null);
    setAgentChatTargetWindow(null);
    setWorkspaceFsNotifyTargetWindow(null);
    mainWindow = null;
  });

  setGrokStreamTargetWindow(mainWindow);
  setAgentChatTargetWindow(mainWindow);
  setTerminalIpcTargetWindow(mainWindow);
  setWorkspaceFsNotifyTargetWindow(mainWindow);
}

registerGrokStreamIpc();
// registerAgentChatIpc - entry point (ish) for harness/agent
registerAgentChatIpc({
  getCurrentProject: () => ({
    projectId: currentProjectId,
    manifest: currentProject,
  }),
});
registerAppIpc({ getMainWindow: () => mainWindow });
registerXaiSettingsIpc();
registerGitIpc({ getCurrentProject: () => currentProject });
registerTerminalIpc({ getCurrentProject: () => currentProject });
registerVoiceIpc({
  getMainWindow: () => mainWindow,
  getCurrentProject: () => ({
    projectId: currentProjectId,
    manifest: currentProject,
  }),
});
registerProjectIpc({
  getMainWindow: () => mainWindow,
  getCurrentProject: () => currentProject,
  getCurrentProjectId: () => currentProjectId,
  setCurrentProject: (manifest) => {
    currentProject = manifest;
  },
  setCurrentProjectId: (projectId) => {
    currentProjectId = projectId;
  },
  finishOpenProjectSession,
  notifyRecentProjectsChanged,
  clearProjectRuntimeState: () => {
    killAllTerminalSessions();
    invalidateRepoIgnoreCheckerCache();
  },
  invalidateProjectCaches: invalidateRepoIgnoreCheckerCache,
  scheduleWorkspaceIndexRefresh,
  isPathWithinWorkspaceRoots,
});
registerWorkspaceIpc({
  getCurrentProject: () => currentProject,
  getMainWindow: () => mainWindow,
  isPathWithinWorkspaceRoots,
  invalidateProjectCaches: invalidateRepoIgnoreCheckerCache,
  scheduleWorkspaceIndexRefresh,
});
registerAgentSupportIpc({
  getCurrentProject: () => currentProject,
  getCurrentProjectId: () => currentProjectId,
  invalidateProjectCaches: invalidateRepoIgnoreCheckerCache,
  scheduleWorkspaceIndexRefresh,
});
registerChatIpc({
  getCurrentProject: () => currentProject,
  getCurrentProjectId: () => currentProjectId,
});

app.whenReady().then(() => {
  /** Required for reliable `getUserMedia` in packaged builds (mic prompt / permission). */
  session.defaultSession.setPermissionRequestHandler(
    (_wc, permission, callback) => {
      if (permission === "media") {
        callback(true);
      } else {
        callback(false);
      }
    },
  );
  session.defaultSession.setPermissionCheckHandler(
    (_wc, permission, _origin, _details) => {
      return permission === "media";
    },
  );

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  killAllTerminalSessions();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  flushActiveAgentTurnReceiptsAsInterruptedForApp();
  killAllTerminalSessions();
});

// IPC Handlers for GrokForge core features
