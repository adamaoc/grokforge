# GrokForge - Agent And Contributor Guide

This document is for humans and coding agents. Read it before making structural
changes, touching IPC, or extending the desktop shell.

## What This Project Is

**GrokForge** is an Electron desktop workspace for coding agents. It uses
**electron-vite**, **React 19**, **TypeScript**, **Tailwind CSS**, **Monaco
Editor**, and **Zod** for the workspace manifest.

Chat turns run on a **coding agent the user already has installed and signed in
to** (their own subscription), driven over the Agent Client Protocol (ACP):
**Grok Build** (`grok agent stdio`) or **Claude Code** (via the bundled
`@agentclientprotocol/claude-agent-acp` adapter around the user's own `claude`
CLI). GrokForge is the workspace around the agent: project folders, edit
review, per-turn checkpoints and undo, editor, git, terminal, voice, and
storage. See [`docs/coding-agents.md`](docs/coding-agents.md).

Agent chat enters through `src/main/agent/runner.ts`, which hands turns to
`src/main/acp/`. Grok Voice uses a main-process realtime WebSocket in
`src/main/voice/realtime.ts`; renderer code only captures mic audio and plays
audio/events through preload IPC. Voice and read-aloud are the only features
that need an xAI API key.

## Repository Layout

| Path | Role |
| --- | --- |
| `src/main/` | Electron main process: window lifecycle, capability IPC modules, privileged IO, agent processes. See `src/main/README.md`. |
| `src/preload/` | `contextBridge` contract exposing `window.electron`; the only sanctioned renderer -> main API. |
| `src/renderer/` | Vite React UI: app shell, chat thread, file tree, editor, terminal, settings. |
| `src/shared/` | Process-safe contracts and DTOs. See `src/shared/README.md`. |
| `e2e/`, `e2e-ui/` | Build smoke tests and Playwright + Electron UI tests (scripted mock ACP agent). |
| `dist/` | Generated build output. Do not hand-edit. |

## Commands

- `npm run dev` - electron-vite dev.
- `npm run build` - production build.
- `npm run preview` - preview production build.
- `npm run start` - run `electron .` after a build.
- `npm run typecheck` - TypeScript checks for renderer/main/preload.
- `npm run lint` - ESLint over `.ts` / `.tsx`.
- `npm run test` - Vitest unit tests.
- `npm run test:e2e` - production build plus headless smoke tests.
- `npm run test:e2e:ui` - Playwright + Electron UI E2E against built output
  (on Linux without a display, run under `xvfb-run -a`).
- `npm run test:e2e:ui:headed` - headed UI E2E for local debugging.

CI (`.github/workflows/ci.yml`) runs typecheck, lint, unit tests, the build
smoke test, and the Electron UI suite on every PR.

Develop and CI against **Node 22 LTS** with npm and `package-lock.json`. Before
dependency/runtime upgrades, read `docs/dependency-runtime-watchlist.md`.
Dependency changes should normally pass typecheck, unit tests, production build,
headless E2E smoke, and Electron UI E2E.

## Process Boundaries

1. Renderer code must not use Node or Electron APIs directly. Use
   `window.electron` from preload only.
2. Main owns privileged operations: disk, native dialogs, PTY sessions, agent
   processes, xAI network calls, key storage, and workspace mutation.
3. Preload is the bridge contract. Add or change APIs in
   `src/preload/preload.ts` and keep
   `src/shared/bridge/preload-api-contract.ts` passing.
4. Register IPC handlers in the relevant `src/main/<capability>/register-ipc.ts`
   file, not in a monolithic `main.ts` block. Keep `src/main/main.ts` focused on
   app/window lifecycle and capability registration.
5. Validate IPC payloads on the main side for production paths. Keep
   `contextIsolation: true` and `nodeIntegration: false`.

## Workspace Projects

A GrokForge project is a stable UUID with a display name and a workspace
manifest persisted under Electron `userData`, never inside user folders.

- Project store: `src/main/project/store.ts`.
- Recent project store: `src/main/project/recent-store.ts`.
- Manifest schema: `src/main/project/manifest.ts`.
- Chat log: `userData/workspace-projects/<projectId>/chat/thread.jsonl`, via
  `src/main/chat/store.ts`.
- Turn checkpoints: `userData/workspace-projects/<projectId>/checkpoints/<rootId>.git`
  (shadow git repos; see `src/main/checkpoints/`).
- Project session state: `currentProjectId` and `currentProject` live in
  `src/main/main.ts` and are updated by project IPC.

Manifest roots are absolute paths for the current machine. File reads/writes
made for the agent must resolve under `manifest.roots` and respect
`manifest.ignore` where applicable.

## Main IPC Capabilities

Main-process capability folders own their own registration modules:

| Capability | Registration |
| --- | --- |
| App/window helpers | `src/main/app/register-ipc.ts` |
| Project and recents | `src/main/project/register-ipc.ts` |
| Workspace filesystem/search | `src/main/workspace/register-ipc.ts` |
| Chat persistence and attachments | `src/main/chat/register-ipc.ts` |
| Agent chat stream | `src/main/agent/runner.ts` |
| Agent approvals | `src/main/agent/approval.ts` |
| Coding-agent providers (ACP) | `src/main/acp/register-ipc.ts`; turns via `src/main/acp/chat-turn.ts` |
| Turn checkpoints (diff / revert) | `src/main/checkpoints/register-ipc.ts` |
| Git status/diff | `src/main/git/register-ipc.ts` |
| Human PTY terminal | `src/main/terminal/register-ipc.ts` |
| Voice and TTS | `src/main/voice/register-ipc.ts` |
| xAI key settings | `src/main/xai/register-ipc.ts` |

When adding an IPC surface, prefer a small dependency object with only the state
that handler needs. Do not pass a generic "everything app state" bag.

## Renderer Boundaries

Renderer-facing DTOs come from `src/shared/` when they cross preload, main, or
renderer boundaries. Do not add renderer imports from `src/main/` (other than
type-only manifest/store types already re-exported by `src/renderer/src/types.ts`),
Node builtins, or Electron packages.

The chat thread lives under `src/renderer/src/components/chat-thread/`:
`use-agent-turn.ts` (live turn), `use-chat-thread-persistence.ts`,
`ChatControlsBar.tsx`, `AgentActivityList.tsx`, `TurnChangesCard.tsx`. Keep new
chat pieces in that folder rather than growing `ChatThread.tsx`. The workspace
shell is `components/workspace/`; Settings is `components/settings/`.

## Agent Chat

Text chat uses `agent-chat-start`, `agent-chat-cancel`, and `onAgentChatEvent`
through preload. The renderer sends user text, recent thread messages, and
lightweight context (active file, open tabs, attachments, editor selection, Work
or Plan mode, review mode). Main picks the agent and talks ACP.

Current durable rules:

- File writes the agent makes through GrokForge are root-scoped and
  ignore-aware; reads are root-scoped.
- In "Review edits" mode the agent asks before each edit and the user sees the
  diff; in "Auto-accept" edits are allowed, but commands and deletes always ask.
- Every turn is checkpointed; the reply carries a changes card that can revert
  files or undo the whole turn. Do not bypass `src/main/checkpoints/`.
- Plan mode uses the agent's own plan mode when it has one.
- GrokForge does not handle agent credentials; each CLI signs in itself.

## Workspace Search, Git, And Terminal

Workspace search lives in `src/main/workspace/search.ts` with DTOs in
`src/shared/workspace/search-contract.ts`. The renderer must use preload and
shared contracts only.

Git status and diff sessions live in `src/main/git/service.ts`. Git discovery is
root-scoped, shallow, ignore-aware, and driven by the Git CLI.

Human terminal sessions use `node-pty` in `src/main/terminal/session.ts` and
`@xterm/xterm` in the renderer. Terminal sessions are human tooling; agents run
commands in their own process after the user approves them, never through the
PTY.

Agent commands are trusted-developer tooling, not a sandbox. Approved command
strings can chain shell operations, so do not frame approvals as containment
against malicious users or models.

## xAI API Key And Voice

Voice realtime and read-aloud call xAI from the Electron main process so the API
key never ships to the renderer as plaintext. Renderer code only sees masked
status via IPC.

Resolution order:

1. In-app key saved from Settings → Voice, encrypted with Electron `safeStorage`
   under userData (`src/main/xai/key-store.ts`).
2. `XAI_API_KEY`.
3. `GROKFORGE_XAI_API_KEY`.

Optional endpoint overrides: `GROKFORGE_XAI_REALTIME_URL`, `GROKFORGE_XAI_TTS_URL`.

Voice realtime IPC is registered in `src/main/voice/register-ipc.ts`. The main
process opens the realtime WebSocket, the renderer sends PCM16 chunks with
`voice-audio-chunk`, and main forwards xAI events as `voice-realtime-event`.
"Continue in agent chat" hands the voice conversation to the coding agent.

## Known Simplifications

- The main window loads `ELECTRON_RENDERER_URL` in dev and
  `dist/renderer/index.html` otherwise.
- `save-manifest` persists through `src/main/project/store.ts`, not user
  workspace folders.
- Voice uses server VAD; `voice.defaultVoiceMode: off` disables the mic control.
- The agent choice is app-wide (not per project) for now.

Prefer incremental PR-sized changes and preserve existing UX layout unless the
task is explicitly a redesign.

## Design Guidance

- External coding agents (ACP), review model, checkpoints: `docs/coding-agents.md`.
- Dependency/runtime watchlist: `docs/dependency-runtime-watchlist.md`.
- UI/design consistency: `.cursor/skills/styleguide-design/SKILL.md` when
  working in Cursor.
- `docs/i-am-a-harness.md`, `docs/harness-*.md`, and `docs/field-reports/`
  describe the original built-in Grok API agent loop (removed). They remain as
  history and design background.

Historical `GFAPP-###` story ids in commits and docs came from a local task
tracker that is no longer used; there is no task-tracking API to call.

## Git And Cursor

- Prefer focused commits.
- Run `npm run typecheck` before pushing substantive TypeScript changes.
- Project-specific AI rules live in `.cursor/rules/*.mdc`; this file is the
  narrative overview agents should read first.
