# Main Process Layout

`main.ts` stays at the root because it is the Electron entrypoint configured by
`electron.vite.config.ts`. Keep it focused on window lifecycle, IPC registration,
and app-level coordination.

Everything else in this folder should live under the capability it serves:

| Folder | Purpose |
| --- | --- |
| `agent/` | Main-process bridge for the current minimal harness turn runner and agent-adjacent helpers. |
| `chat/` | Chat thread persistence and attachment staging under app `userData`. |
| `git/` | Git status and diff-session reads for workspace roots. |
| `project/` | Workspace manifest schema, stored project records, and recent-project metadata. |
| `terminal/` | Human PTY sessions and node-pty startup helpers. |
| `voice/` | xAI realtime voice bridge and read-aloud TTS calls. |
| `workspace/` | Root-scoped filesystem operations, search, ignore handling, and workspace change notifications. |
| `xai/` | xAI API transport helpers, stream parsing, DTOs, and API-key storage. |
| `legacy/` | Regression tests or compatibility coverage for legacy harness-support behavior. |

When adding a new main-process module, prefer putting it in one of these folders
and name it by what it does inside that folder (`store.ts`, `session.ts`,
`search.ts`) instead of repeating a broad prefix in every filename.
