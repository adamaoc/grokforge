import { ipcMain, type BrowserWindow } from "electron";
import type { GrokProjectManifest } from "../project/manifest";
import { VoiceSessionStartPayloadSchema } from "../../shared/voice/session-contract";
import {
  isVoiceRealtimeSocketOpen,
  sendVoiceAudioAppendBase64,
  startVoiceRealtime,
  stopVoiceRealtime,
} from "./realtime";
import { invokeTtsReadAloud, verifyTtsVoice } from "./tts-read-aloud";

export function registerVoiceIpc(deps: {
  getMainWindow: () => BrowserWindow | null;
  getCurrentProject: () => {
    projectId: string | null;
    manifest: GrokProjectManifest | null;
  };
}): void {
  ipcMain.handle("voice-session-start", async (_, raw: unknown) => {
    const current = deps.getCurrentProject();
    if (!current.manifest || !current.projectId) {
      return { ok: false as const, error: "No project loaded" };
    }
    const mainWindow = deps.getMainWindow();
    if (!mainWindow) {
      return { ok: false as const, error: "No browser window" };
    }
    const parsed = VoiceSessionStartPayloadSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return { ok: false as const, error: "Invalid voice session payload." };
    }
    const threadSummary = parsed.data.threadSummary?.trim();
    return startVoiceRealtime(
      mainWindow,
      current.manifest,
      threadSummary ? { threadSummary } : undefined,
    );
  });

  ipcMain.handle("voice-session-stop", () => {
    stopVoiceRealtime();
    return { ok: true as const };
  });

  ipcMain.on("voice-audio-chunk", (_, payload: unknown) => {
    if (!isVoiceRealtimeSocketOpen()) return;
    if (typeof payload !== "string" || !payload.length) return;
    sendVoiceAudioAppendBase64(payload);
  });

  ipcMain.handle("tts-read-aloud", async (_, payload: unknown) =>
    invokeTtsReadAloud(payload),
  );

  ipcMain.handle("tts-verify-voice", async (_, voiceId: unknown) =>
    verifyTtsVoice(voiceId),
  );
}
