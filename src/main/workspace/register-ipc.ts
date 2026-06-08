import { ipcMain, type BrowserWindow } from "electron";
import { readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import type { GrokProjectManifest } from "../project/manifest";
import { applyWorkspaceFsMutate } from "./fs-mutate";
import type { WorkspaceFsChangeReason } from "../../shared/workspace/fs-change-contract";
import type { WorkspaceFsMutateResult } from "../../shared/workspace/fs-mutation-contract";
import type { SearchWorkspaceResult } from "../../shared/workspace/search-contract";
import {
  cancelWorkspaceSearch,
  parseSearchWorkspacePayload,
  runWorkspaceSearch,
} from "./search";

export function registerWorkspaceIpc(deps: {
  getCurrentProject: () => GrokProjectManifest | null;
  getMainWindow: () => BrowserWindow | null;
  isPathWithinWorkspaceRoots: (path: string) => boolean;
  invalidateProjectCaches: () => void;
  scheduleWorkspaceIndexRefresh: (options?: {
    paths?: string[];
    notifyRenderer?: boolean;
    reason?: WorkspaceFsChangeReason;
  }) => void;
}): void {
  ipcMain.handle("read-file", async (_, filePath: unknown) => {
    if (typeof filePath !== "string" || !filePath.trim()) return null;
    const resolved = resolve(filePath);
    if (!deps.isPathWithinWorkspaceRoots(resolved)) return null;
    try {
      return readFileSync(resolved, "utf-8");
    } catch {
      return null;
    }
  });

  ipcMain.handle("write-file", async (_, filePath: unknown, content: unknown) => {
    if (typeof filePath !== "string" || !filePath.trim()) return false;
    if (typeof content !== "string") return false;
    const resolved = resolve(filePath);
    if (!deps.isPathWithinWorkspaceRoots(resolved)) return false;
    try {
      writeFileSync(resolved, content);
      const base = resolved.split(/[\\/]/).filter(Boolean).pop() ?? "";
      if (base === ".gitignore" || base === ".cursorignore") {
        deps.invalidateProjectCaches();
      }
      deps.scheduleWorkspaceIndexRefresh({
        paths: [resolved],
        notifyRenderer: true,
        reason: "mutation",
      });
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle(
    "workspace-fs-mutate",
    async (_, raw: unknown): Promise<WorkspaceFsMutateResult> => {
      const result = await applyWorkspaceFsMutate(deps.getCurrentProject(), raw);
      if (result.ok) {
        const paths = changedPathsForWorkspaceFsMutate(raw);
        if (paths.length > 0) {
          deps.invalidateProjectCaches();
          deps.scheduleWorkspaceIndexRefresh({
            paths,
            notifyRenderer: true,
            reason: "mutation",
          });
        }
      }
      return result;
    },
  );

  ipcMain.handle(
    "search-workspace",
    async (_, payload: unknown): Promise<SearchWorkspaceResult> => {
      const currentProject = deps.getCurrentProject();
      if (!currentProject) {
        return { ok: false, error: "No project loaded" };
      }
      const req = parseSearchWorkspacePayload(payload);
      if (!req) {
        return {
          ok: false,
          error:
            "Invalid payload: expected { query: string, caseSensitive?, regex? }",
        };
      }
      return runWorkspaceSearch(currentProject, deps.getMainWindow(), req);
    },
  );

  ipcMain.handle("search-workspace-cancel", () => {
    cancelWorkspaceSearch();
    return { ok: true as const };
  });
}

function changedPathsForWorkspaceFsMutate(raw: unknown): string[] {
  if (!raw || typeof raw !== "object" || !("op" in raw)) return [];
  const body = raw as {
    op?: unknown;
    parentDir?: unknown;
    name?: unknown;
    path?: unknown;
    newName?: unknown;
  };
  if (body.op === "mkdir" || body.op === "touch") {
    if (typeof body.parentDir !== "string" || typeof body.name !== "string") return [];
    const parentDir = resolve(body.parentDir);
    return [resolve(join(parentDir, body.name)), parentDir];
  }
  if (body.op === "remove") {
    if (typeof body.path !== "string") return [];
    const target = resolve(body.path);
    return [target, dirname(target)];
  }
  if (body.op === "rename") {
    if (typeof body.path !== "string" || typeof body.newName !== "string") return [];
    const oldPath = resolve(body.path);
    const parent = dirname(oldPath);
    return [oldPath, resolve(join(parent, body.newName)), parent];
  }
  return [];
}
