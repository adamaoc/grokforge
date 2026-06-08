import { ipcMain } from "electron";
import type { GrokProjectManifest } from "../project/manifest";
import { isStoredProjectPresent, loadStoredProject } from "../project/store";
import type { RefreshProjectIntelligenceResult } from "../../shared/agent/chat-contract";
import {
  appendChatMessage,
  clearChatThread,
  loadChatThread,
  parseIncomingPersistPayload,
} from "./store";
import { clearThreadMemory } from "../../harness-support/compaction/thread-memory-store";
import { refreshWorkspaceIndex } from "../../harness-support/context/index-store";
import { isGreenfieldWorkspace } from "../../harness-support/context/workspace-greenfield";
import {
  findPlanByThreadMessageId,
  markPlansSupersededForMessageIds,
  setPlanArtifactStatus,
} from "../../harness-support/plan/store/plan-store";
import {
  buildApprovedPlanExecuteSummary,
  PlanArtifactStatusSchema,
} from "../../harness-support/plan/contracts/plan-artifact";
import {
  loadProjectContextPins,
  saveProjectContextPins,
} from "../../harness-support/context/context-pins-store";
import {
  AgentContextPinSchema,
  AGENT_CONTEXT_MAX_PINS_PER_PROJECT,
} from "../../harness-support/context/context-pins-contract";
import { StageChatAttachmentPayloadSchema } from "../../shared/chat/attachment-contract";
import { stageChatAttachment } from "./attachment-staging";

export function registerChatIpc(deps: {
  getCurrentProject: () => GrokProjectManifest | null;
  getCurrentProjectId: () => string | null;
}): void {
  ipcMain.handle(
    "refresh-project-intelligence",
    (): RefreshProjectIntelligenceResult => {
      const currentProject = deps.getCurrentProject();
      const currentProjectId = deps.getCurrentProjectId();
      if (!currentProject || !currentProjectId) {
        return { ok: false, error: "No project loaded" };
      }
      try {
        const index = refreshWorkspaceIndex(currentProjectId, currentProject);
        const isGreenfield = isGreenfieldWorkspace({
          index: {
            intelligence: {
              files: index.intelligence.files,
              packages: index.intelligence.packages,
              stats: {
                fileCountScanned: index.intelligence.stats.fileCountScanned,
              },
            },
          },
          retrievalMatchCount: 0,
        });
        return {
          ok: true,
          updatedAt: index.updatedAt,
          fileCountScanned: index.intelligence.stats.fileCountScanned,
          sensitiveSkipped: index.intelligence.stats.skippedSensitive,
          isGreenfield,
        };
      } catch (e) {
        const msg =
          e instanceof Error
            ? e.message
            : "Failed to refresh project intelligence";
        return { ok: false, error: msg };
      }
    },
  );

  ipcMain.handle("load-chat-thread", (): ReturnType<typeof loadChatThread> => {
    const currentProjectId = deps.getCurrentProjectId();
    if (!currentProjectId) {
      return { ok: false, error: "No project loaded" };
    }
    return loadChatThread(currentProjectId);
  });

  ipcMain.handle("append-chat-message-for-project", (_, raw: unknown) => {
    if (!raw || typeof raw !== "object") {
      return { ok: false, error: "Invalid payload" } as const;
    }
    const o = raw as { projectId?: unknown; payload?: unknown };
    const projectId =
      typeof o.projectId === "string" && o.projectId.trim()
        ? o.projectId.trim()
        : "";
    if (!projectId || !isStoredProjectPresent(projectId)) {
      return { ok: false, error: "Unknown project" } as const;
    }
    const record = parseIncomingPersistPayload(o.payload);
    if (!record) {
      return { ok: false, error: "Invalid chat message payload" } as const;
    }
    if (record.id === "welcome") {
      return {
        ok: false,
        error: "Cannot persist synthetic welcome message",
      } as const;
    }
    return appendChatMessage(projectId, record);
  });

  ipcMain.handle("append-chat-message", (_, payload: unknown) => {
    const currentProjectId = deps.getCurrentProjectId();
    if (!currentProjectId) {
      return { ok: false, error: "No project loaded" } as const;
    }
    const record = parseIncomingPersistPayload(payload);
    if (!record) {
      return { ok: false, error: "Invalid chat message payload" } as const;
    }
    if (record.id === "welcome") {
      return {
        ok: false,
        error: "Cannot persist synthetic welcome message",
      } as const;
    }
    return appendChatMessage(currentProjectId, record);
  });

  ipcMain.handle("set-stored-plan-status", (_, raw: unknown) => {
    if (!raw || typeof raw !== "object") {
      return { ok: false as const, error: "Invalid payload" };
    }
    const o = raw as {
      projectId?: unknown;
      planId?: unknown;
      status?: unknown;
    };
    const projectId =
      typeof o.projectId === "string" && o.projectId.trim()
        ? o.projectId.trim()
        : "";
    const planId =
      typeof o.planId === "string" && o.planId.trim() ? o.planId.trim() : "";
    const statusParsed = PlanArtifactStatusSchema.safeParse(o.status);
    if (
      !projectId ||
      !planId ||
      !statusParsed.success ||
      !isStoredProjectPresent(projectId)
    ) {
      return { ok: false as const, error: "Invalid payload" };
    }
    if (!setPlanArtifactStatus(projectId, planId, statusParsed.data)) {
      return { ok: false as const, error: "Plan not found" };
    }
    return { ok: true as const };
  });

  ipcMain.handle("get-stored-plan-for-message", (_, raw: unknown) => {
    if (!raw || typeof raw !== "object") {
      return { ok: false as const, error: "Invalid payload" };
    }
    const o = raw as { projectId?: unknown; threadMessageId?: unknown };
    const projectId =
      typeof o.projectId === "string" && o.projectId.trim()
        ? o.projectId.trim()
        : "";
    const threadMessageId =
      typeof o.threadMessageId === "string" && o.threadMessageId.trim()
        ? o.threadMessageId.trim()
        : "";
    if (!projectId || !threadMessageId || !isStoredProjectPresent(projectId)) {
      return { ok: false as const, error: "Invalid payload" };
    }
    const artifact = findPlanByThreadMessageId(projectId, threadMessageId);
    if (!artifact) {
      return { ok: true as const };
    }
    return {
      ok: true as const,
      planId: artifact.planId,
      status: artifact.status,
      summaryPreview: buildApprovedPlanExecuteSummary(artifact, 400),
    };
  });

  ipcMain.handle("mark-stored-plans-superseded", (_, raw: unknown) => {
    if (!raw || typeof raw !== "object") {
      return { ok: false as const, error: "Invalid payload" };
    }
    const o = raw as {
      projectId?: unknown;
      threadMessageIds?: unknown;
      supersededByPlanId?: unknown;
    };
    const projectId =
      typeof o.projectId === "string" && o.projectId.trim()
        ? o.projectId.trim()
        : "";
    if (!projectId || !isStoredProjectPresent(projectId)) {
      return { ok: false as const, error: "Invalid payload" };
    }
    if (!Array.isArray(o.threadMessageIds)) {
      return { ok: false as const, error: "Invalid message ids" };
    }
    const threadMessageIds = o.threadMessageIds.filter(
      (id): id is string => typeof id === "string" && id.trim().length > 0,
    );
    const supersededByPlanId =
      typeof o.supersededByPlanId === "string" && o.supersededByPlanId.trim()
        ? o.supersededByPlanId.trim()
        : undefined;
    const updated = markPlansSupersededForMessageIds(
      projectId,
      threadMessageIds,
      supersededByPlanId,
    );
    return { ok: true as const, updated };
  });

  ipcMain.handle("clear-chat-thread", (): ReturnType<typeof clearChatThread> => {
    const currentProjectId = deps.getCurrentProjectId();
    if (!currentProjectId) {
      return { ok: false, error: "No project loaded" };
    }
    clearThreadMemory(currentProjectId);
    return clearChatThread(currentProjectId);
  });

  ipcMain.handle("get-project-context-pins", (_, raw: unknown) => {
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
    return loadProjectContextPins(projectId);
  });

  ipcMain.handle("set-project-context-pins", (_, raw: unknown) => {
    if (!raw || typeof raw !== "object") {
      return { ok: false as const, error: "Invalid payload" };
    }
    const o = raw as { projectId?: unknown; pins?: unknown };
    const projectId =
      typeof o.projectId === "string" && o.projectId.trim()
        ? o.projectId.trim()
        : "";
    if (!projectId || !isStoredProjectPresent(projectId)) {
      return { ok: false as const, error: "Unknown project" };
    }
    if (
      !Array.isArray(o.pins) ||
      o.pins.length > AGENT_CONTEXT_MAX_PINS_PER_PROJECT
    ) {
      return { ok: false as const, error: "Invalid pins list" };
    }
    const pins = [];
    for (const item of o.pins) {
      const parsed = AgentContextPinSchema.safeParse(item);
      if (!parsed.success) {
        return { ok: false as const, error: "Invalid pin entry" };
      }
      pins.push(parsed.data);
    }
    const stored = loadStoredProject(projectId);
    if (!stored) {
      return { ok: false as const, error: "Unknown project" };
    }
    return saveProjectContextPins(projectId, stored.manifest, pins);
  });

  ipcMain.handle("stage-chat-attachment", (_, raw: unknown) => {
    const currentProjectId = deps.getCurrentProjectId();
    if (!currentProjectId) {
      return { ok: false as const, error: "No project loaded" };
    }
    const parsed = StageChatAttachmentPayloadSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false as const, error: "Invalid attachment request." };
    }
    return stageChatAttachment(currentProjectId, parsed.data);
  });
}
