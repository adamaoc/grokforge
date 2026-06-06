import { ipcMain, type BrowserWindow } from "electron";
import { z } from "zod";
import { runAgentHarnessTurn } from '../../harness';
import type {
  AgentChatActiveContext,
  AgentChatCapabilitiesResult,
  AgentChatEventPayload,
  AgentChatStartPayload,
  AgentChatStartResult,
} from '../../shared/agent/chat-contract';
import {
  AGENT_CHAT_MAX_ATTACHMENTS,
  AGENT_CHAT_MAX_MESSAGE_CHARS,
  AGENT_CHAT_MAX_OPEN_TABS,
  AGENT_CHAT_MAX_STREAM_ID_LEN,
  AGENT_CHAT_MAX_THREAD_MESSAGES,
  AGENT_CHAT_MAX_USER_TEXT_CHARS,
  AGENT_CHAT_SELECTION_MAX_CHARS,
} from '../../shared/agent/chat-contract';
import type { GrokProjectManifest } from '../project/manifest';
import { getXaiApiKey } from '../xai/stream';
import { hasConfiguredXaiApiKey } from '../xai/key-store';

const ABORT_USER = "gf:agent-user-cancel";
const ABORT_QUIT = "gf:agent-quit";

type CurrentProjectSnapshot = {
  projectId: string | null;
  manifest: GrokProjectManifest | null;
};

let getCurrentProject: () => CurrentProjectSnapshot = () => ({
  projectId: null,
  manifest: null,
});

let targetWindow: BrowserWindow | null = null;
const activeTurns = new Map<string, AbortController>();

const AttachmentSchema = z.object({
  type: z.enum(["file", "folder"]),
  path: z.string().min(1).max(10_000),
  source: z.enum(["workspace", "upload"]).optional(),
  displayName: z.string().max(512).optional(),
  mediaType: z.string().max(256).optional(),
  byteSize: z.number().nonnegative().finite().optional(),
});

const EditorSelectionSchema = z.object({
  path: z.string().min(1).max(10_000),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  text: z.string().max(AGENT_CHAT_SELECTION_MAX_CHARS).optional(),
  truncated: z.boolean(),
});

const ActiveContextSchema: z.ZodType<AgentChatActiveContext> = z.object({
  activeRootId: z.string().nullable().optional(),
  activeFilePath: z.string().nullable().optional(),
  selectedTreePath: z.string().nullable().optional(),
  openTabs: z
    .array(
      z.object({
        path: z.string().min(1).max(10_000),
        dirty: z.boolean(),
      }),
    )
    .max(AGENT_CHAT_MAX_OPEN_TABS),
  attachments: z.array(AttachmentSchema).max(AGENT_CHAT_MAX_ATTACHMENTS).optional(),
  pinned: z.array(z.any()).optional(),
  editorSelection: EditorSelectionSchema.nullable().optional(),
  chatMode: z.enum(["fast", "plan"]),
});

const ThreadMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().max(AGENT_CHAT_MAX_MESSAGE_CHARS),
});

const StartPayloadSchema: z.ZodType<AgentChatStartPayload> = z.object({
  streamId: z.string().min(1).max(AGENT_CHAT_MAX_STREAM_ID_LEN),
  model: z.string().max(128),
  modelIntent: z.enum(["chat_default", "planning", "execution"]).optional(),
  isApprovedPlanAutoRun: z.boolean().optional(),
  approvedPlanId: z.string().optional(),
  approvedPlanMessageId: z.string().optional(),
  userText: z.string().min(1).max(AGENT_CHAT_MAX_USER_TEXT_CHARS),
  threadSnapshot: z.array(ThreadMessageSchema).max(AGENT_CHAT_MAX_THREAD_MESSAGES),
  activeContext: ActiveContextSchema,
});

function getE2eMockReply(): string | null {
  const raw = process.env.GROKFORGE_E2E_AGENT_REPLY;
  return raw && raw.trim() ? raw : null;
}

export function setAgentChatTargetWindow(win: BrowserWindow | null): void {
  targetWindow = win;
}

function emit(payload: AgentChatEventPayload): void {
  targetWindow?.webContents.send("agent-chat-event", payload);
}

function activityId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function emitActivity(
  streamId: string,
  activity: Omit<
    AgentChatEventPayload & { phase: "activity" },
    "streamId" | "phase"
  >["activity"],
): void {
  emit({ streamId, phase: "activity", activity });
}

export function flushActiveAgentTurnReceiptsAsInterruptedForApp(): void {
  for (const ac of activeTurns.values()) {
    ac.abort(ABORT_QUIT);
  }
  activeTurns.clear();
}

async function runTurnJob(payload: AgentChatStartPayload): Promise<void> {
  const ac = activeTurns.get(payload.streamId);
  if (!ac) return;

  try {
    const snapshot = getCurrentProject();
    const manifest = snapshot.manifest;
    const projectId = snapshot.projectId;
    if (!manifest || !projectId) {
      emit({ streamId: payload.streamId, phase: "error", error: "No project loaded" });
      return;
    }

    await runAgentHarnessTurn(
      {
        emit,
        emitActivity,
        newActivityId: activityId,
        getE2eMockReply,
      },
      payload,
      manifest,
      projectId,
      ac,
    );
  } catch (e) {
    if (ac.signal.reason === ABORT_QUIT) return;
    if (ac.signal.reason === ABORT_USER) {
      emit({ streamId: payload.streamId, phase: "activity_clear_running", reason: "cancelled" });
      emit({ streamId: payload.streamId, phase: "cancelled" });
      return;
    }
    const message = e instanceof Error ? e.message : "Agent turn failed";
    emit({ streamId: payload.streamId, phase: "activity_clear_running", reason: "error" });
    emit({ streamId: payload.streamId, phase: "error", error: message });
  } finally {
    activeTurns.delete(payload.streamId);
  }
}

export function registerAgentChatIpc(options: {
  getCurrentProject: () => CurrentProjectSnapshot;
}): void {
  getCurrentProject = options.getCurrentProject;

  ipcMain.handle(
    "agent-chat-capabilities",
    (): AgentChatCapabilitiesResult => ({
      apiKeyConfigured: Boolean(hasConfiguredXaiApiKey() || getE2eMockReply()),
    }),
  );

  ipcMain.handle(
    "agent-chat-start",
    async (_, raw: unknown): Promise<AgentChatStartResult> => {
      const parsed = StartPayloadSchema.safeParse(raw);
      if (!parsed.success) return { ok: false, error: parsed.error.message };
      if (!getXaiApiKey() && !getE2eMockReply()) {
        return {
          ok: false,
          error:
            "Missing XAI API key. Add it in Settings or set XAI_API_KEY / GROKFORGE_XAI_API_KEY.",
        };
      }
      const payload = parsed.data;
      if (activeTurns.has(payload.streamId)) {
        return { ok: false, error: "streamId already in use" };
      }
      activeTurns.set(payload.streamId, new AbortController());
      void runTurnJob(payload);
      return { ok: true, streamId: payload.streamId };
    },
  );

  ipcMain.handle(
    "agent-chat-cancel",
    async (_, streamId: unknown): Promise<{ ok: boolean }> => {
      if (typeof streamId !== "string" || !streamId.trim()) return { ok: false };
      const ac = activeTurns.get(streamId);
      if (!ac) return { ok: true };
      ac.abort(ABORT_USER);
      return { ok: true };
    },
  );
}
