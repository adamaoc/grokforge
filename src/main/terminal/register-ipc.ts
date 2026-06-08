import { ipcMain, type BrowserWindow } from "electron";
import type { GrokProjectManifest } from "../project/manifest";
import {
  killTerminalSession,
  parseTerminalSessionInputRequest,
  parseTerminalSessionKillRequest,
  parseTerminalSessionResizeRequest,
  parseTerminalSessionStartRequest,
  resizeTerminalSession,
  setTerminalSessionTargetWindow,
  startTerminalSession,
  writeTerminalSessionInput,
} from "./session";
import type {
  TerminalSessionMutationResult,
  TerminalSessionStartResult,
} from "../../shared/terminal/session-contract";

export function registerTerminalIpc(deps: {
  getCurrentProject: () => GrokProjectManifest | null;
}): void {
  ipcMain.handle(
    "terminal-session-start",
    async (_, payload: unknown): Promise<TerminalSessionStartResult> => {
      const req = parseTerminalSessionStartRequest(payload);
      if (!req)
        return {
          ok: false,
          error: "Invalid payload: expected { rootId, cols, rows, shell? }",
          code: "invalid",
        };
      return startTerminalSession(deps.getCurrentProject(), req);
    },
  );

  ipcMain.handle(
    "terminal-session-input",
    async (_, payload: unknown): Promise<TerminalSessionMutationResult> => {
      const req = parseTerminalSessionInputRequest(payload);
      if (!req)
        return {
          ok: false,
          error: "Invalid payload: expected { sessionId, data }",
          code: "invalid",
        };
      return writeTerminalSessionInput(req);
    },
  );

  ipcMain.handle(
    "terminal-session-resize",
    async (_, payload: unknown): Promise<TerminalSessionMutationResult> => {
      const req = parseTerminalSessionResizeRequest(payload);
      if (!req)
        return {
          ok: false,
          error: "Invalid payload: expected { sessionId, cols, rows }",
          code: "invalid",
        };
      return resizeTerminalSession(req);
    },
  );

  ipcMain.handle(
    "terminal-session-kill",
    async (_, payload: unknown): Promise<TerminalSessionMutationResult> => {
      const req = parseTerminalSessionKillRequest(payload);
      if (!req)
        return {
          ok: false,
          error: "Invalid payload: expected { sessionId }",
          code: "invalid",
        };
      return killTerminalSession(req);
    },
  );
}

export function setTerminalIpcTargetWindow(window: BrowserWindow | null): void {
  setTerminalSessionTargetWindow(window);
}
