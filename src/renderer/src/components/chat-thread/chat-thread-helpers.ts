import type {
  AgentChatActivityPayload,
  ChatMessage,
  GrokProjectManifest,
  PersistedChatLineV1,
} from "@/types";
import {
  AGENT_CHAT_MAX_THREAD_MESSAGES,
  type AgentChatThreadMessage,
} from "../../../../shared/agent/chat-contract";

/** Settle steps that were still running when the turn ended. */
export function terminalizeRunningAgentActivities(
  activities: AgentChatActivityPayload[],
  reason: "done" | "error" | "cancelled" | "interrupted",
): AgentChatActivityPayload[] {
  return activities.map((activity) => {
    if (activity.status !== "running" && activity.status !== "awaiting_approval") {
      return activity;
    }
    if (reason === "done") return { ...activity, status: "done" };
    return {
      ...activity,
      status: reason === "interrupted" ? "interrupted" : "error",
      title:
        reason === "cancelled"
          ? `${activity.title} (cancelled)`
          : reason === "interrupted"
            ? `${activity.title} (interrupted)`
            : `${activity.title} (stopped)`,
    };
  });
}

/** Reply text for a turn that failed: keep partial output, then say what stopped it. */
export function formatTurnError(partial: string, error: string): string {
  const reason = error.trim() || "Unknown error";
  const quoted = reason
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  return `${partial.trim() ? `${partial.trimEnd()}\n\n` : ""}> **The agent stopped.**\n${quoted}`;
}

/** Recent dialog sent with a turn so a fresh agent session can pick up the thread. */
export function buildAgentThreadSnapshot(messages: ChatMessage[]): AgentChatThreadMessage[] {
  return messages
    .filter((m) => m.id !== "welcome")
    .filter((m) => m.role === "user" || m.role === "assistant")
    .filter((m) => m.content.trim().length > 0)
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
    .slice(-AGENT_CHAT_MAX_THREAD_MESSAGES);
}

export function makeWelcomeMessage(project: GrokProjectManifest): ChatMessage {
  const name = project.name.trim() || "this project";
  return {
    id: "welcome",
    role: "assistant",
    content: `Ready to work on **${name}**. Describe a change, ask about the code, or switch to **Plan** to think it through first.`,
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
    ...(line.turnChanges ? { turnChanges: line.turnChanges } : {}),
  };
}
