import type {
  AgentChatActivityPayload,
  ChatMessage,
  GrokProjectManifest,
  PersistedChatLineV1,
  Root,
} from "@/types";
import { buildChatWelcomeContent } from "@/lib/ui-copy";
import {
  isPathUnderWorkspaceRoots,
  normalizeFsPath,
} from "@/lib/workspace-path-check";
import {
  AGENT_CHAT_MAX_THREAD_MESSAGES,
  type AgentChatThreadMessage,
} from "../../../../shared/agent/chat-contract";
import {
  AGENT_EDIT_FAILURE_MAX_SNAPSHOT,
  isAgentEditFailureSystemMessage,
} from "../../lib/legacy-agent/edit";
import type { ParsedAgentToolBatch } from "../../lib/legacy-agent/tools";
import type { PendingEditProposal } from "./chat-thread-types";

export const MAX_DIFF_REVIEW_CONTENT_CHARS = 512 * 1024;

export function terminalizeRunningAgentActivities(
  activities: AgentChatActivityPayload[],
  reason: "done" | "error" | "cancelled" | "interrupted",
): AgentChatActivityPayload[] {
  return activities.map((activity) =>
    activity.status === "running" || activity.status === "awaiting_approval"
      ? {
          ...activity,
          status:
            reason === "done"
              ? "done"
              : reason === "interrupted"
                ? "interrupted"
                : "error",
          title:
            reason === "cancelled"
              ? `${activity.title} cancelled`
              : reason === "interrupted"
                ? `${activity.title} interrupted`
                : reason === "error"
                  ? `${activity.title} stopped`
                  : activity.title,
        }
      : activity,
  );
}

export function buildAgentThreadSnapshot(
  messages: ChatMessage[],
): AgentChatThreadMessage[] {
  const dialog = messages
    .filter((m) => m.id !== "welcome")
    .filter((m) => m.role === "user" || m.role === "assistant")
    .filter((m) => m.role !== "assistant" || m.content.trim().length > 0)
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  const failures = messages
    .filter(
      (m) =>
        m.role === "system" && isAgentEditFailureSystemMessage(m.content),
    )
    .slice(-AGENT_EDIT_FAILURE_MAX_SNAPSHOT)
    .map((m) => ({ role: "system" as const, content: m.content }));

  return [...dialog, ...failures].slice(-AGENT_CHAT_MAX_THREAD_MESSAGES);
}

export async function capturePreApplySnapshots(
  operations: ParsedAgentToolBatch["operations"],
  roots: Root[],
): Promise<Record<string, string | null>> {
  const readFile = window.electron?.readFile;
  if (!readFile) return {};
  const snapshots: Record<string, string | null> = {};
  for (const op of operations) {
    if (!isPathUnderWorkspaceRoots(op.path, roots)) continue;
    const key = normalizeFsPath(op.path);
    if (key in snapshots) continue;
    snapshots[key] = await readFile(op.path);
  }
  return snapshots;
}

export function markProposalApplied(
  proposal: PendingEditProposal,
  snapshots: Record<string, string | null>,
): PendingEditProposal {
  return {
    ...proposal,
    uiPhase: "applied",
    preApplySnapshots: snapshots,
  };
}

export function makeWelcomeMessage(
  project: GrokProjectManifest,
): ChatMessage {
  return {
    id: "welcome",
    role: "assistant",
    content: buildChatWelcomeContent(project.name),
    timestamp: new Date(),
  };
}

export function lineToMessage(line: PersistedChatLineV1): ChatMessage {
  return {
    id: line.id,
    role: line.role,
    content: line.content,
    timestamp: new Date(line.timestamp),
    model: line.model,
    attachments: line.attachments,
    turnContext: line.turnContext,
  };
}
