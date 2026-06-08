import { ipcMain } from "electron";
import type { GrokProjectManifest } from "../project/manifest";
import {
  getGitDiffSessionForRoot,
  getGitStatusForRoot,
  type GitDiffSessionResult,
  type GitStatusSummary,
} from "./service";

function parseRootId(payload: unknown): string {
  return payload &&
    typeof payload === "object" &&
    "rootId" in payload &&
    typeof (payload as { rootId: unknown }).rootId === "string"
    ? (payload as { rootId: string }).rootId.trim()
    : "";
}

export function registerGitIpc(deps: {
  getCurrentProject: () => GrokProjectManifest | null;
}): void {
  ipcMain.handle(
    "git-status",
    async (_, payload: unknown): Promise<GitStatusSummary> => {
      const rootId = parseRootId(payload);
      if (!rootId) {
        return {
          ok: false,
          code: "invalid_request",
          message: "Expected { rootId: string }",
        };
      }
      return getGitStatusForRoot(deps.getCurrentProject(), rootId);
    },
  );

  ipcMain.handle(
    "git-diff-session",
    async (_, payload: unknown): Promise<GitDiffSessionResult> => {
      const rootId = parseRootId(payload);
      if (!rootId) {
        return {
          ok: false,
          code: "invalid_request",
          message: "Expected { rootId: string }",
        };
      }
      return getGitDiffSessionForRoot(deps.getCurrentProject(), rootId);
    },
  );
}
