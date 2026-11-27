# Main Process Layout

`main.ts` stays at the root because it is the Electron entrypoint configured by
`electron.vite.config.ts`. Keep it focused on window lifecycle, capability IPC
registration calls, and app-level coordination. Individual `ipcMain` handlers
belong in `register-ipc.ts` modules inside the capability folders below.

Everything else in this folder should live under the capability it serves:

| Folder | Purpose |
| --- | --- |
| `acp/` | Agent Client Protocol client: CLI detection, agent processes, sessions, and turn mapping. |
| `agent/` | Agent chat IPC (`runner.ts`) and approval requests (`approval.ts`). |
| `checkpoints/` | Per-turn shadow-git snapshots of each root for review and undo. |
| `chat/` | Chat thread persistence and attachment staging under app `userData`. |
| `git/` | Git status and diff-session reads for workspace roots. |
| `project/` | Workspace manifest schema, stored project records, and recent-project metadata. |
| `terminal/` | Human PTY sessions and node-pty startup helpers. |
| `voice/` | xAI realtime voice bridge and read-aloud TTS calls. |
| `workspace/` | Root-scoped filesystem operations, search, ignore handling, and workspace change notifications. |
| `xai/` | xAI API-key storage and settings IPC (used by voice). |

When adding a new main-process module, prefer putting it in one of these folders
and name it by what it does inside that folder (`store.ts`, `session.ts`,
`search.ts`) instead of repeating a broad prefix in every filename.
