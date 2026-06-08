# GrokForge - Agent And Contributor Guide

This document is for humans and coding agents. Read it before making structural
changes, touching IPC, or extending the desktop shell.

## What This Project Is

**GrokForge** is an Electron desktop app for a voice-first, multi-root coding
agent UX. It uses **electron-vite**, **React 19**, **TypeScript**, **Tailwind
CSS**, **Monaco Editor**, and **Zod** for the workspace manifest.

Grok models provide intelligence; this app is the harness: tools, context,
orchestration, review gates, storage, and UI that turn a model into a coding
agent. Read [`docs/i-am-a-harness.md`](docs/i-am-a-harness.md) before large
agent-loop, prompt, tool, or model-routing changes.

Text agent chat enters through `src/main/agent/runner.ts` and the minimal
harness under `src/harness/`. Grok Voice uses a main-process realtime WebSocket
in `src/main/voice/realtime.ts`; renderer code only captures mic audio and plays
audio/events through preload IPC.

## Repository Layout

| Path | Role |
| --- | --- |
| `src/main/` | Electron main process: window lifecycle, capability IPC modules, privileged IO, xAI calls. See `src/main/README.md`. |
| `src/preload/` | `contextBridge` contract exposing `window.electron`; the only sanctioned renderer -> main API. |
| `src/renderer/` | Vite React UI: app shell, chat thread, file tree, editor, terminal, settings. |
| `src/harness/` | Current minimal text-agent runtime. See `src/harness/README.md`. |
| `src/harness-support/` | Legacy/compatibility agent helpers still used by support modules and renderer adapters. Do not add new renderer deep imports here. |
| `src/shared/` | Process-safe contracts and DTOs. See `src/shared/README.md`. |
| `dist/` | Generated build output. Do not hand-edit. |

## Commands

- `npm run dev` - electron-vite dev.
- `npm run build` - production build.
- `npm run preview` - preview production build.
- `npm run start` - run `electron .` after a build.
- `npm run typecheck` - TypeScript checks for renderer/main/preload.
- `npm run lint` - ESLint over `.ts` / `.tsx` when config is present.
- `npm run test` - Vitest unit tests.
- `npm run test:e2e` - production build plus headless smoke tests.
- `npm run test:e2e:ui` - Playwright + Electron UI E2E against built output.
- `npm run test:e2e:ui:headed` - headed UI E2E for local debugging.

Develop and CI against **Node 22 LTS** with npm and `package-lock.json`. Before
dependency/runtime upgrades, read `docs/dependency-runtime-watchlist.md`.
Dependency changes should normally pass typecheck, unit tests, production build,
headless E2E smoke, and Electron UI E2E.

## Process Boundaries

1. Renderer code must not use Node or Electron APIs directly. Use
   `window.electron` from preload only.
2. Main owns privileged operations: disk, native dialogs, PTY sessions, xAI
   network calls, key storage, and workspace mutation.
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
manifest persisted under Electron `userData`, never as `.grokproject.json`
inside user folders.

- Project store: `src/main/project/store.ts`.
- Recent project store: `src/main/project/recent-store.ts`.
- Manifest schema: `src/main/project/manifest.ts`.
- Chat log: `userData/workspace-projects/<projectId>/chat/thread.jsonl`, via
  `src/main/chat/store.ts`.
- Project session state: `currentProjectId` and `currentProject` live in
  `src/main/main.ts` and are updated by project IPC.

Manifest roots are absolute paths for the current machine. Agent and app file
reads/writes must resolve under `manifest.roots` and respect `manifest.ignore`
where applicable.

## Main IPC Capabilities

Main-process capability folders own their own registration modules:

| Capability | Registration |
| --- | --- |
| App/window helpers | `src/main/app/register-ipc.ts` |
| Project and recents | `src/main/project/register-ipc.ts` |
| Workspace filesystem/search | `src/main/workspace/register-ipc.ts` |
| Chat persistence and plan metadata | `src/main/chat/register-ipc.ts` |
| Agent support write/apply/history IPC | `src/main/agent/register-ipc.ts` |
| Agent chat stream | `src/main/agent/runner.ts` |
| Git status/diff | `src/main/git/register-ipc.ts` |
| Human PTY terminal | `src/main/terminal/register-ipc.ts` |
| Voice and TTS | `src/main/voice/register-ipc.ts` |
| xAI key settings | `src/main/xai/register-ipc.ts` |

When adding an IPC surface, prefer a small dependency object with only the state
that handler needs. Do not pass a generic "everything app state" bag.

## Renderer Boundaries

Renderer-facing DTOs should come from `src/shared/` when they cross preload,
main, renderer, or harness boundaries. Active renderer components should import
legacy agent contracts through `src/renderer/src/lib/legacy-agent/`, which is a
named compatibility facade over `src/harness-support/`.

Do not add new active renderer imports directly from:

- `src/main/`
- `src/harness-support/`
- Node builtins
- Electron packages

The renderer chat thread has feature-local helpers under
`src/renderer/src/components/chat-thread/`. Keep new chat render pieces,
proposal flow, stream event handling, and persistence/lifecycle code in that
folder instead of growing `ChatThread.tsx`.

## Agent Chat And Harness

Text chat uses `agent-chat-start`, `agent-chat-cancel`, and
`onAgentChatEvent` through preload. The renderer sends user text plus lightweight
turn context: selected root, active file, open-tab dirty flags, chat mode
(`fast` or `plan`), and optional model intent. Main resolves the actual model,
profile, tools, and provider request.

Current durable rules:

- Workspace reads and writes are root-scoped and ignore-aware.
- Agent file edits become reviewable proposals; do not apply legacy fenced JSON
  from assistant messages.
- `run_command` is a guarded one-shot command path with user approval, separate
  from human PTY terminal sessions.
- Plan mode produces structured `gf-plan` content; approving a plan starts an
  execution turn with execution routing and reviewable proposals.
- Activity rows, subagent blocks, failed-edit summaries, and routing badges are
  renderer display concerns backed by shared or legacy compatibility contracts.

Model routing defaults and profile helpers currently live in
`src/harness-support/routing/` and related compatibility modules. Renderer code
should access them via `src/renderer/src/lib/legacy-agent/routing.ts`.

Compatibility-only harness behavior and old deterministic regression coverage
live under `src/harness-support/`, `src/main/legacy/__tests__/`, and
`src/shared/legacy/__tests__/`. When rebuilding a legacy behavior for the
minimal harness, prefer a small new shared contract over moving old helpers back
unchanged.

## Workspace Search, Git, And Terminal

Workspace search lives in `src/main/workspace/search.ts` with DTOs in
`src/shared/workspace/search-contract.ts`. The renderer must use preload and
shared contracts only; it must not import main workspace implementation code.

Git status and diff sessions live in `src/main/git/service.ts`. Git discovery is
root-scoped, shallow, ignore-aware, and driven by the Git CLI.

Human terminal sessions use `node-pty` in `src/main/terminal/session.ts` and
`@xterm/xterm` in the renderer. Terminal sessions are trusted human tooling, not
a model autonomy surface. Agents must not drive PTY input; they use the guarded
command path after explicit approval.

Agent commands are trusted-developer tooling, not a full shell jail. Even
approved command strings can chain shell operations, so do not frame this as
containment against malicious users or models.

## xAI API Key And Voice

Streaming chat, voice realtime, and read-aloud call xAI from the Electron main
process so the API key never ships to the renderer as plaintext. Renderer code
only sees masked status via IPC.

Resolution order:

1. In-app key saved from Settings, encrypted with Electron `safeStorage` under
   userData (`src/main/xai/key-store.ts`).
2. `XAI_API_KEY`.
3. `GROKFORGE_XAI_API_KEY`.

Optional endpoint overrides:

- `GROKFORGE_XAI_CHAT_COMPLETIONS_URL`
- `GROKFORGE_XAI_REALTIME_URL`
- `GROKFORGE_XAI_TTS_URL`

Voice realtime IPC is registered in `src/main/voice/register-ipc.ts`. The main
process opens the realtime WebSocket, renderer sends PCM16 chunks with
`voice-audio-chunk`, and main forwards xAI events as `voice-realtime-event`.
Read aloud uses `tts-read-aloud` and plays returned audio locally in the
renderer.

## Known Simplifications

- The main window loads `ELECTRON_RENDERER_URL` in dev and
  `dist/renderer/index.html` otherwise.
- `save-manifest` persists through `src/main/project/store.ts`, not user
  workspace folders.
- Voice uses server VAD; `voice.defaultVoiceMode: off` disables the mic control
  in the UI.
- Some plan/proposal/routing compatibility helpers still live under
  `src/harness-support/`; active renderer access is centralized under
  `src/renderer/src/lib/legacy-agent/`.

Prefer incremental PR-sized changes and preserve existing UX layout unless the
task is explicitly a redesign.

## Project Tasks And Design Guidance

- Harness concepts and patterns: `docs/i-am-a-harness.md`.
- Harness roadmap and historical program context: `docs/harness-roadmap.md`.
- Dependency/runtime watchlist: `docs/dependency-runtime-watchlist.md`.
- Backlog and stories: `project_tasks/`.
- UI/design consistency: `.cursor/skills/styleguide-design/SKILL.md` when
  working in Cursor.

## Git And Cursor

- Prefer focused commits.
- Run `npm run typecheck` before pushing substantive TypeScript changes.
- Project-specific AI rules live in `.cursor/rules/*.mdc`; this file is the
  narrative overview agents should read first.
