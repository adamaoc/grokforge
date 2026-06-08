import { app, clipboard, ipcMain, shell, type BrowserWindow } from "electron";
import type { AppInfoPayload } from "../../shared/app/info-contract";
import { parseAllowedExternalOpenUrl } from "../../shared/security/external-open-url";

const WINDOW_TITLE_MAX_LENGTH = 256;

export function registerAppIpc(deps: {
  getMainWindow: () => BrowserWindow | null;
}): void {
  ipcMain.handle(
    "window-set-title",
    (_event, raw: unknown): { ok: true } | { ok: false; error: string } => {
      if (typeof raw !== "string") {
        return { ok: false, error: "Title must be a string" };
      }
      const trimmed = raw.trim();
      const clipped =
        trimmed.length > WINDOW_TITLE_MAX_LENGTH
          ? trimmed.slice(0, WINDOW_TITLE_MAX_LENGTH)
          : trimmed;
      const title = clipped.length > 0 ? clipped : "GrokForge";
      deps.getMainWindow()?.setTitle(title);
      return { ok: true };
    },
  );

  ipcMain.handle(
    "open-external-url",
    async (
      _event,
      raw: unknown,
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (typeof raw !== "string" || !raw.trim()) {
        return { ok: false, error: "Invalid URL" };
      }
      const parsed = parseAllowedExternalOpenUrl(raw);
      if (!parsed) {
        return {
          ok: false,
          error:
            "Only https:// links and local http:// (localhost) links can be opened",
        };
      }
      try {
        await shell.openExternal(parsed.href);
        return { ok: true };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to open link";
        return { ok: false, error: msg };
      }
    },
  );

  ipcMain.handle(
    "clipboard-write-text",
    (_event, raw: unknown): { ok: true } | { ok: false; error: string } => {
      if (typeof raw !== "string") {
        return { ok: false, error: "Clipboard text must be a string" };
      }
      try {
        clipboard.writeText(raw);
        return { ok: true };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to write clipboard";
        return { ok: false, error: msg };
      }
    },
  );

  ipcMain.handle("get-app-info", (): AppInfoPayload => {
    return {
      name: app.getName() || "GrokForge",
      version: app.getVersion(),
      electron: process.versions.electron ?? "unknown",
      chromium: process.versions.chrome ?? "unknown",
      node: process.versions.node,
      platform: process.platform,
      arch: process.arch,
    };
  });
}
