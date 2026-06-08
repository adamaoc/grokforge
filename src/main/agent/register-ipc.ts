import { ipcMain } from "electron";
import type { GrokProjectManifest } from "../project/manifest";
import type { WorkspaceFsChangeReason } from "../../shared/workspace/fs-change-contract";
import { isStoredProjectPresent } from "../project/store";
import { computeAgentContentHash } from "./content-hash";
import {
  buildAgentContextPreview,
  buildChatSystemPrompt,
  type GetAgentContextPreviewResult,
  type GetChatSystemPromptResult,
} from "../../harness-support/context/context";
import {
  applyAgentToolWriteBatch,
  clearLastUndoBatch,
  peekLastUndoSnapshots,
  undoLastAgentWriteBatch,
} from "../../harness-support/tools/write-batch";
import {
  appendAgentWriteHistory,
  getAgentWriteHistory,
  removeLatestAgentWriteHistoryEntry,
  revertAgentWriteBatch,
} from "../../harness-support/session/write-history-store";

export function registerAgentSupportIpc(deps: {
  getCurrentProject: () => GrokProjectManifest | null;
  getCurrentProjectId: () => string | null;
  invalidateProjectCaches: () => void;
  scheduleWorkspaceIndexRefresh: (options?: {
    paths?: string[];
    notifyRenderer?: boolean;
    reason?: WorkspaceFsChangeReason;
  }) => void;
}): void {
  ipcMain.handle("compute-agent-content-hash", (_, content: unknown) => {
    if (typeof content !== "string") return null;
    return computeAgentContentHash(content);
  });

  ipcMain.handle("agent-tool-batch", async (_, raw: unknown) => {
    const currentProject = deps.getCurrentProject();
    if (!currentProject) {
      return { ok: false, error: "No project loaded" } as const;
    }
    const result = applyAgentToolWriteBatch(currentProject, raw);
    if (result.ok && result.applied.length > 0) {
      const paths = result.applied.map((file) => file.path);
      deps.invalidateProjectCaches();
      deps.scheduleWorkspaceIndexRefresh({
        paths,
        notifyRenderer: true,
        reason: "agent_write",
      });
      const currentProjectId = deps.getCurrentProjectId();
      if (currentProjectId) {
        const undoSnapshots = peekLastUndoSnapshots();
        if (undoSnapshots?.length) {
          const entry = appendAgentWriteHistory(currentProjectId, {
            applied: result.applied,
            undoSnapshots,
          });
          return { ...result, batchId: entry.batchId };
        }
      }
    }
    return result;
  });

  ipcMain.handle("agent-undo-last-batch", async () => {
    const currentProject = deps.getCurrentProject();
    if (!currentProject) {
      return { ok: false, error: "No project loaded" } as const;
    }
    const currentProjectId = deps.getCurrentProjectId();
    let result;
    if (currentProjectId) {
      const latest = removeLatestAgentWriteHistoryEntry(currentProjectId);
      if (latest) {
        const undoable = latest.snapshots
          .filter((s) => s.snapshotAvailable)
          .map((s) => ({ path: s.path, content: s.beforeContent }));
        result = undoLastAgentWriteBatch(
          currentProject,
          undoable.length > 0 ? undoable : null,
        );
        clearLastUndoBatch();
      } else {
        result = undoLastAgentWriteBatch(currentProject);
      }
    } else {
      result = undoLastAgentWriteBatch(currentProject);
    }
    if (result.ok && result.restoredPaths.length > 0) {
      deps.invalidateProjectCaches();
      deps.scheduleWorkspaceIndexRefresh({
        paths: result.restoredPaths,
        notifyRenderer: true,
        reason: "agent_write",
      });
    }
    return result;
  });

  ipcMain.handle("get-agent-write-history", (_, raw: unknown) => {
    if (!raw || typeof raw !== "object") {
      return { ok: false as const, error: "Invalid payload" };
    }
    const projectId =
      typeof (raw as { projectId?: unknown }).projectId === "string"
        ? (raw as { projectId: string }).projectId.trim()
        : "";
    if (!projectId || !isStoredProjectPresent(projectId)) {
      return { ok: false as const, error: "Unknown project" };
    }
    return getAgentWriteHistory(projectId);
  });

  ipcMain.handle("revert-agent-write-batch", (_, raw: unknown) => {
    const currentProject = deps.getCurrentProject();
    if (!currentProject) {
      return { ok: false as const, error: "No project loaded" };
    }
    if (!raw || typeof raw !== "object") {
      return { ok: false as const, error: "Invalid payload" };
    }
    const o = raw as { projectId?: unknown; batchId?: unknown };
    const projectId =
      typeof o.projectId === "string" && o.projectId.trim()
        ? o.projectId.trim()
        : "";
    const batchId =
      typeof o.batchId === "string" && o.batchId.trim() ? o.batchId.trim() : "";
    if (!projectId || !isStoredProjectPresent(projectId)) {
      return { ok: false as const, error: "Unknown project" };
    }
    if (!batchId) {
      return { ok: false as const, error: "Missing batch id" };
    }
    const result = revertAgentWriteBatch(projectId, batchId, currentProject);
    if (result.ok && result.restoredPaths.length > 0) {
      clearLastUndoBatch();
      deps.invalidateProjectCaches();
      deps.scheduleWorkspaceIndexRefresh({
        paths: result.restoredPaths,
        notifyRenderer: true,
        reason: "agent_write",
      });
    }
    return result;
  });

  ipcMain.handle(
    "get-agent-context-preview",
    (): GetAgentContextPreviewResult => {
      const currentProject = deps.getCurrentProject();
      if (!currentProject) {
        return { ok: false, error: "No project loaded" };
      }
      try {
        return { ok: true, preview: buildAgentContextPreview(currentProject) };
      } catch (e) {
        const msg =
          e instanceof Error
            ? e.message
            : "Failed to build agent context preview";
        return { ok: false, error: msg };
      }
    },
  );

  ipcMain.handle("get-chat-system-prompt", (): GetChatSystemPromptResult => {
    const currentProject = deps.getCurrentProject();
    if (!currentProject) {
      return { ok: false, error: "No project loaded" };
    }
    try {
      const { systemPrompt, warnings } = buildChatSystemPrompt(currentProject);
      return { ok: true, systemPrompt, warnings };
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Failed to build chat system prompt";
      return { ok: false, error: msg };
    }
  });
}
