import { ipcMain } from "electron";
import {
  clearStoredXaiKey,
  getXaiKeyStatusPayload,
  saveStoredXaiKey,
} from "./key-store";
import type {
  ClearXaiApiKeyResult,
  SetXaiApiKeyResult,
  XaiKeyStatusPayload,
} from "../../shared/settings/xai-key-settings-contract";

export function registerXaiSettingsIpc(): void {
  ipcMain.handle(
    "get-xai-key-status",
    (): XaiKeyStatusPayload => getXaiKeyStatusPayload(),
  );

  ipcMain.handle(
    "set-xai-api-key",
    async (_, raw: unknown): Promise<SetXaiApiKeyResult> => {
      if (raw === null || typeof raw !== "object" || !("apiKey" in raw)) {
        return { ok: false, error: "Invalid payload" };
      }
      const key = (raw as { apiKey: unknown }).apiKey;
      if (typeof key !== "string") {
        return { ok: false, error: "API key must be a string" };
      }
      return saveStoredXaiKey(key);
    },
  );

  ipcMain.handle(
    "clear-xai-api-key",
    (): ClearXaiApiKeyResult => clearStoredXaiKey(),
  );
}
