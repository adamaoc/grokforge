import { dialog, ipcMain, type BrowserWindow } from "electron";
import { existsSync, statSync } from "fs";
import { readdir } from "fs/promises";
import { isAbsolute, join, relative, resolve } from "path";
import { randomUUID } from "crypto";
import {
  GrokProjectManifest,
  type AddWorkspaceRootResult,
  type OpenProjectResult,
  type ProjectSessionSnapshot,
  type ReadDirectoryResult,
} from "./manifest";
import {
  createStoredProject,
  deleteStoredProject,
  loadStoredProject,
  saveManifestForProject,
  touchProjectLastOpened,
  updateStoredProjectDisplayName,
  type StoredWorkspaceProject,
} from "./store";
import {
  getRecentProjectsSanitized,
  recordRecentProject,
  removeRecentProject,
  updateRecentProjectDisplayName,
} from "./recent-store";
import {
  RECENT_PROJECT_DISPLAY_NAME_MAX_LEN,
  type DeleteProjectResult,
  type OpenProjectByIdFailure,
  type RecentProjectEntry,
  type RemoveRecentProjectResult,
  type UpdateRecentPickerNameResult,
} from "../../shared/projects/recent-projects-contract";
import { mergeDiscoveredAgentInstructions } from "../../harness-support/context/instructions-discover";
import { shouldIgnoreFsEntry } from "../workspace/ignore-globs";

const PROJECT_ID_MAX_LEN = 128;

function parseProjectIdPayload(raw: unknown): string | null {
  if (raw === null || typeof raw !== "object" || !("projectId" in raw))
    return null;
  const id = (raw as { projectId: unknown }).projectId;
  if (typeof id !== "string" || !id.trim()) return null;
  const t = id.trim();
  if (t.length > PROJECT_ID_MAX_LEN) return null;
  return t;
}

export function registerProjectIpc(deps: {
  getMainWindow: () => BrowserWindow | null;
  getCurrentProject: () => GrokProjectManifest | null;
  getCurrentProjectId: () => string | null;
  setCurrentProject: (manifest: GrokProjectManifest | null) => void;
  setCurrentProjectId: (projectId: string | null) => void;
  finishOpenProjectSession: (stored: StoredWorkspaceProject) => OpenProjectResult;
  notifyRecentProjectsChanged: () => void;
  clearProjectRuntimeState: () => void;
  invalidateProjectCaches: () => void;
  scheduleWorkspaceIndexRefresh: () => void;
  isPathWithinWorkspaceRoots: (path: string) => boolean;
}): void {
  ipcMain.handle("open-project", async (): Promise<OpenProjectResult | null> => {
    const e2eProjectPath = process.env["GROKFORGE_E2E_OPEN_PROJECT_PATH"];
    let resolved: string;
    if (e2eProjectPath) {
      resolved = resolve(e2eProjectPath);
    } else {
      const result = await dialog.showOpenDialog(deps.getMainWindow()!, {
        properties: ["openDirectory"],
        title: "New GrokForge project — pick a folder",
      });

      if (result.canceled || !result.filePaths.length) return null;
      resolved = resolve(result.filePaths[0]);
    }
    if (!existsSync(resolved)) {
      throw new Error("Project path does not exist");
    }
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(resolved);
    } catch {
      throw new Error("Cannot read project path");
    }
    if (!st.isDirectory()) {
      throw new Error("Project path is not a directory");
    }

    const stored = createStoredProject(resolved);
    return deps.finishOpenProjectSession(stored);
  });

  ipcMain.handle("get-recent-projects", (): RecentProjectEntry[] =>
    getRecentProjectsSanitized(),
  );

  ipcMain.handle(
    "remove-recent-project",
    (_, raw: unknown): RemoveRecentProjectResult => {
      const id = parseProjectIdPayload(raw);
      if (!id) {
        return { ok: false, error: "Invalid payload" };
      }
      removeRecentProject(id);
      deps.notifyRecentProjectsChanged();
      return { ok: true };
    },
  );

  ipcMain.handle("delete-project", (_, raw: unknown): DeleteProjectResult => {
    const id = parseProjectIdPayload(raw);
    if (!id) {
      return { ok: false, error: "Invalid payload" };
    }
    if (deps.getCurrentProjectId() === id) {
      deps.clearProjectRuntimeState();
      deps.setCurrentProject(null);
      deps.setCurrentProjectId(null);
    }
    deleteStoredProject(id);
    removeRecentProject(id);
    deps.notifyRecentProjectsChanged();
    return { ok: true };
  });

  ipcMain.handle(
    "update-recent-picker-name",
    (_, raw: unknown): UpdateRecentPickerNameResult => {
      if (
        raw === null ||
        typeof raw !== "object" ||
        !("projectId" in raw) ||
        !("displayName" in raw)
      ) {
        return { ok: false, error: "Invalid payload" };
      }
      const projectId = (raw as { projectId: unknown }).projectId;
      const displayName = (raw as { displayName: unknown }).displayName;
      if (typeof projectId !== "string" || !projectId.trim()) {
        return { ok: false, error: "Invalid project id" };
      }
      if (typeof displayName !== "string") {
        return { ok: false, error: "Invalid name" };
      }
      const trimmedId = projectId.trim();
      const trimmedName = displayName.trim();
      if (trimmedId.length > PROJECT_ID_MAX_LEN) {
        return { ok: false, error: "Invalid project id" };
      }
      if (!trimmedName) {
        return { ok: false, error: "Name cannot be empty" };
      }
      if (trimmedName.length > RECENT_PROJECT_DISPLAY_NAME_MAX_LEN) {
        return { ok: false, error: "Name too long" };
      }
      const visible = getRecentProjectsSanitized();
      if (!visible.some((e) => e.projectId === trimmedId)) {
        return { ok: false, error: "Project not in recent list" };
      }
      updateStoredProjectDisplayName(trimmedId, trimmedName);
      updateRecentProjectDisplayName(trimmedId, trimmedName);
      deps.notifyRecentProjectsChanged();
      return { ok: true };
    },
  );

  ipcMain.handle(
    "open-project-by-id",
    async (
      _,
      raw: unknown,
    ): Promise<OpenProjectResult | OpenProjectByIdFailure> => {
      const id =
        typeof raw === "string"
          ? raw.trim()
          : raw !== null && typeof raw === "object" && "projectId" in raw
            ? parseProjectIdPayload(raw)
            : null;
      if (!id || id.length > PROJECT_ID_MAX_LEN) {
        return { ok: false, error: "Invalid project id" };
      }
      try {
        touchProjectLastOpened(id);
        const stored = loadStoredProject(id);
        if (!stored) {
          return { ok: false, error: "Project not found" };
        }
        return deps.finishOpenProjectSession(stored);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to open project";
        return { ok: false, error: msg };
      }
    },
  );

  ipcMain.handle(
    "get-project",
    (): ProjectSessionSnapshot => ({
      manifest: deps.getCurrentProject(),
      projectId: deps.getCurrentProjectId(),
    }),
  );

  ipcMain.handle("save-manifest", async (_, manifest: GrokProjectManifest) => {
    const currentProjectId = deps.getCurrentProjectId();
    if (!deps.getCurrentProject() || !currentProjectId) return false;
    try {
      saveManifestForProject(currentProjectId, manifest);
      const fresh = loadStoredProject(currentProjectId);
      if (fresh) {
        deps.setCurrentProject(fresh.manifest);
        deps.invalidateProjectCaches();
        deps.scheduleWorkspaceIndexRefresh();
      }
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle(
    "read-directory",
    async (_, dirPath: unknown): Promise<ReadDirectoryResult> => {
      if (typeof dirPath !== "string" || !dirPath.trim()) {
        return { ok: false, error: "Invalid path" };
      }
      const currentProject = deps.getCurrentProject();
      if (!currentProject) {
        return { ok: false, error: "No project loaded" };
      }

      const resolved = resolve(dirPath);
      if (!deps.isPathWithinWorkspaceRoots(resolved)) {
        return { ok: false, error: "Path outside workspace roots" };
      }

      try {
        const dirents = await readdir(resolved, { withFileTypes: true });
        const ignore = currentProject.ignore ?? [];
        const entries = dirents
          .map((d) => ({
            name: d.name,
            path: join(resolved, d.name),
            isDirectory: d.isDirectory(),
          }))
          .filter(
            (e) => !shouldIgnoreFsEntry(e.path, currentProject.roots, ignore),
          )
          .sort((a, b) => {
            if (a.isDirectory !== b.isDirectory)
              return a.isDirectory ? -1 : 1;
            return a.name.localeCompare(b.name);
          });
        return { ok: true, entries };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to read directory";
        return { ok: false, error: msg };
      }
    },
  );

  ipcMain.handle("list-roots", () => {
    return deps.getCurrentProject()?.roots || [];
  });

  ipcMain.handle(
    "add-workspace-root",
    async (): Promise<AddWorkspaceRootResult | null> => {
      const currentProject = deps.getCurrentProject();
      const currentProjectId = deps.getCurrentProjectId();
      const mainWindow = deps.getMainWindow();
      if (!currentProject || !currentProjectId || !mainWindow) {
        return { ok: false, error: "No project loaded" };
      }
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ["openDirectory"],
        title: "Add workspace root",
      });
      if (result.canceled || !result.filePaths.length) return null;

      const picked = resolve(result.filePaths[0]);
      let st: ReturnType<typeof statSync>;
      try {
        st = statSync(picked);
      } catch {
        return { ok: false, error: "Cannot read that folder" };
      }
      if (!st.isDirectory()) {
        return { ok: false, error: "Selected path is not a directory" };
      }

      for (const existing of currentProject.roots) {
        const existingAbs = resolve(existing.path);
        if (existingAbs === picked) {
          return {
            ok: false,
            error: `That folder is already a root: "${existing.label}"`,
          };
        }
        const relFromExisting = relative(existingAbs, picked);
        if (
          relFromExisting !== "" &&
          !relFromExisting.startsWith("..") &&
          !isAbsolute(relFromExisting)
        ) {
          return {
            ok: false,
            error: `That folder is already inside root "${existing.label}". Pick a different folder.`,
          };
        }
        const relFromPicked = relative(picked, existingAbs);
        if (
          relFromPicked !== "" &&
          !relFromPicked.startsWith("..") &&
          !isAbsolute(relFromPicked)
        ) {
          return {
            ok: false,
            error: `That folder contains existing root "${existing.label}". Pick a more specific folder.`,
          };
        }
      }

      const basename =
        picked.split(/[\\/]/).filter(Boolean).pop() ?? "New Root";
      const hasGit = existsSync(join(picked, ".git"));
      const idCandidate = basename
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 32);
      const usedIds = new Set(currentProject.roots.map((r) => r.id));
      let id =
        idCandidate.length > 0
          ? idCandidate
          : `root-${randomUUID().slice(0, 8)}`;
      if (usedIds.has(id)) {
        id = `${idCandidate || "root"}-${randomUUID().slice(0, 8)}`;
      }

      const nextRoots = [
        ...currentProject.roots,
        {
          id,
          path: picked,
          type: "code" as const,
          label: basename,
          ...(hasGit
            ? { git: true as const, defaultBranch: "main" as const }
            : {}),
        },
      ];

      const nextManifest: GrokProjectManifest = {
        ...currentProject,
        roots: nextRoots,
        context: {
          ...currentProject.context,
          alwaysInclude: mergeDiscoveredAgentInstructions(
            currentProject.context.alwaysInclude,
            nextRoots,
            currentProject.ignore ?? [],
          ),
        },
        metadata: {
          ...currentProject.metadata,
          lastOpened: new Date().toISOString(),
        },
      };

      try {
        saveManifestForProject(currentProjectId, nextManifest);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to save manifest";
        return { ok: false, error: msg };
      }
      deps.setCurrentProject(nextManifest);
      deps.invalidateProjectCaches();
      deps.scheduleWorkspaceIndexRefresh();
      recordRecentProject(currentProjectId, nextManifest);
      deps.notifyRecentProjectsChanged();
      return { ok: true, manifest: nextManifest };
    },
  );
}
