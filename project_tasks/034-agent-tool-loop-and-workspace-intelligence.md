# 034 — Agent tool loop and workspace intelligence

**Status:** Done — V1 read/search agent loop implemented. Command autonomy, first-class edit tools, summaries, embeddings, and watcher refresh remain deferred to follow-up stories.

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` before changing chat, context, tool-call, settings, approval, or activity UI.

## Summary

Make GrokForge feel like an agent that genuinely understands the current project instead of a chat model with a static prompt. Build a main-process tool loop that lets the model inspect the workspace, retrieve relevant files, run allowed commands, and then produce grounded answers or file edits. Pair that with a persistent app-side project memory/index stored under `userData`, not inside user workspaces.

Story **034** builds on the first lightweight implementation where `buildChatSystemPrompt()` includes a bounded, ignore-aware workspace index. That index helps the model see structure, but it is intentionally only a map. This story turns that map into usable agent cognition.

## Problem

The app already has rich project information:

- Stable app-side project records and manifests.
- Multi-root workspace paths.
- Ignore rules.
- Directory/file IPC.
- Workspace search.
- Terminal command execution.
- Agent write batches.
- Chat persistence.

But the chat model currently receives only a bounded system prompt plus chat history. It cannot independently call `read-file`, `search-workspace`, `read-directory`, or `run-command` while reasoning. The renderer can use those IPC APIs, but the model cannot. This makes the assistant overconfident, path-guessy, and weak at “what are we looking at?” moments.

## Goals

- Add a main-process agent runner that can execute a bounded tool loop before sending the final assistant answer to the renderer.
- Give the model safe, explicit tools for workspace inspection and project actions.
- Add retrieval so the app automatically finds relevant files for each user request.
- Include active UI context: selected/open file, active root, visible tabs, and pending file changes.
- Persist compact project intelligence under GrokForge `userData`.
- Keep all privileged operations in the main process and all tool results scoped to `manifest.roots`.
- Preserve current write safety: structured write batches, ignore checks, undo snapshots, and user confirmation/auto-apply settings.

## Non-goals

- Do not build a full sandbox against malicious local users. Terminal remains trusted-developer tooling.
- Do not store generated index files in user repositories unless the user explicitly asks.
- Do not require embeddings for the first version of retrieval.
- Do not expose raw API keys or privileged filesystem access to the renderer.

## Architecture

### Main-process agent runner

Add a new module, likely `src/main/agent-runner.ts`, that owns chat execution.

Current flow:

1. Renderer builds messages.
2. Renderer invokes `grok-stream-start`.
3. Main streams one model response.

Target flow:

1. Renderer invokes `agent-chat-start` with `{ streamId, model, userText, threadSnapshot, activeContext }`.
2. Main builds system prompt and retrieval context.
3. Main sends model request with tool definitions.
4. If model requests tools, main validates and executes them.
5. Main appends tool results and continues the loop.
6. Main streams final assistant answer to renderer.
7. Renderer parses structured write blocks the same way it does today.

Keep `grok-stream-start` as a lower-level streaming primitive or replace it gradually once `agent-chat-start` is stable.

### Tool schema

Define shared contracts under `src/shared/agent-tool-call-contract.ts` or similar. Tool calls should be small, typed, and validated with Zod in main.

Initial tools:

- `list_directory`
  - Input: `{ path: string }`
  - Uses existing root guard and ignore rules.
  - Returns sorted entries with `{ name, path, isDirectory }`.

- `read_file`
  - Input: `{ path: string, startLine?: number, maxLines?: number }`
  - Root-scoped.
  - Skips or truncates large/binary files.
  - Includes line numbers in returned text.

- `search_workspace`
  - Input: `{ query: string, caseSensitive?: boolean, regex?: boolean }`
  - Reuses story 016 search implementation.
  - Returns capped rows and truncation status.

- `workspace_index`
  - Input: `{ refresh?: boolean }`
  - Returns current bounded index summary from app memory.

- `run_command`
  - Input: existing `RunCommandRequest`.
  - Uses story 017 policy.
  - Destructive commands require explicit renderer approval before execution.
  - Consider disabled by default for model autonomy until UX is clear.

- `propose_file_edits`
  - Prefer keeping writes as final structured `write_file` blocks at first.
  - Later this can become a first-class tool that returns pending writes to the UI without hiding JSON in chat.

### Loop limits

Hard caps are required:

- Max tool iterations per user turn, e.g. 8.
- Max total tool result chars, e.g. 80k.
- Max single file read chars, e.g. 40k.
- Max search result rows, reuse story 016 caps or lower for agent calls.
- Max wall-clock duration, e.g. 120 seconds.
- User cancel aborts active model request and active tools.

If limits are hit, the model should receive a concise “limit reached” tool result and produce a best-effort answer.

### Active UI context

The renderer should send a safe, non-secret active context snapshot:

- `activeRootId`
- `openTabs`: paths and dirty flags
- `activeFilePath`
- `selectedTreePath`
- optional current editor selection text
- pending write batch paths, if any
- current chat mode: fast/plan

This should be included separately from the persistent workspace index so “this file” and “the open README” become meaningful.

### Retrieval before the model responds

Before the first model call, run a cheap retrieval pass:

1. Extract likely filenames, symbols, route names, package names, and user-mentioned path fragments from the prompt.
2. Search path/index metadata first.
3. Use `search_workspace` for high-signal terms.
4. Include a compact “Relevant workspace context” section with paths and small excerpts.

Start with lexical retrieval:

- filename/path scoring
- exact phrase search
- extension/type boosts
- package/config boosts
- open-file boost
- recently edited/opened boost

Embeddings can come later as a separate story.

### Persistent project memory

Store generated intelligence under app project storage:

`userData/workspace-projects/<projectId>/index/`

Suggested files:

- `workspace-index.json`
- `package-summary.json`
- `architecture-summary.md`
- `routes-and-entrypoints.json`
- `last-indexed.json`

Index refresh triggers:

- project open
- manual “Refresh project intelligence”
- after successful agent write batch
- after file tree mutation
- optional debounce after file watcher events

Do not block opening a project on indexing. Show stale-but-usable status in the UI.

### File watching

Add optional watcher support after the core loop works:

- Watch roots with ignore-aware filtering.
- Debounce changes.
- Mark index stale.
- Refresh important summaries opportunistically.
- Avoid recursive watcher assumptions that break across platforms.

### UX

Add a compact activity surface in the chat thread:

- “Searching workspace…”
- “Reading `src/main/main.ts`…”
- “Running `npm test`…” with approval when needed.
- Collapsible tool transcript for debugging.

Do not flood normal chat with raw tool logs. Keep final answers clean, but let users inspect the trail.

Settings:

- Agent autonomy level:
  - Ask before tools
  - Auto-read/search only
  - Auto-read/search/run safe commands
- Terminal command approvals remain explicit for destructive operations.
- “Refresh project intelligence” command.
- Index status: fresh/stale/indexing/failed.

### Security and boundaries

- Main process owns all tool execution.
- Renderer never gets broad filesystem capabilities beyond existing IPC contracts.
- Every filesystem tool must validate paths against `manifest.roots`.
- Every filesystem tool must honor `manifest.ignore`.
- Never include `.env` contents, API keys, or obvious secret files in automatic retrieval.
- Redact likely secrets from tool results.
- Keep `contextIsolation: true` and `nodeIntegration: false`.

### Streaming protocol

Extend the stream event payloads or add new events:

- `agent-turn-started`
- `agent-tool-started`
- `agent-tool-result`
- `agent-tool-error`
- `agent-final-chunk`
- `agent-turn-done`
- `agent-turn-cancelled`

The renderer should continue showing assistant text as it streams. Tool progress appears as compact status rows above or below the in-progress assistant message.

### Testing

Unit tests:

- Tool schemas reject malformed input.
- Path guards reject outside-root paths.
- Ignore rules apply to every tool.
- `read_file` truncates and line-numbers correctly.
- Retrieval ranks open/mentioned files above unrelated files.
- Loop stops at iteration and char limits.
- Destructive commands require acknowledgement.
- Tool errors are returned to the model without crashing the turn.

Integration tests:

- A prompt asking “where is the app entrypoint?” triggers index/search/read and answers with real paths.
- A prompt asking to edit a nested file produces a pending write under the correct root.
- Cancellation aborts a turn with in-flight search/read/model call.

E2E smoke:

- Production build still launches.
- Chat can answer a simple project-structure question from the index.
- No Node/Electron APIs leak into renderer.

## Acceptance criteria

- [x] Chat answers can use real project paths and files after using read/search tools, not only guesses.
- [x] The model can inspect directory listings and file contents through main-process tools.
- [x] Tool calls are capped, cancellable, root-scoped, and ignore-aware.
- [x] Active editor/tab/root context is included in each agent turn.
- [x] Retrieval provides relevant files/excerpts before the first response.
- [x] Project intelligence is persisted under app `userData`, not user workspace folders.
- [x] Users can see concise tool activity and inspect details when needed.
- [x] Existing structured file write and undo behavior continues to work.
- [x] Tests cover path safety, limits, and read/search tool behavior.

## Implementation notes

- Added `agent-chat-*` IPC and `agent-chat-event` streaming events. The renderer now sends `userText`, a bounded `threadSnapshot`, and active context instead of assembling a raw model message list.
- Added `src/main/agent-runner.ts` for the xAI Chat Completions tool loop. V1 allows only `workspace_index`, `list_directory`, `read_file`, and `search_workspace`; command execution is intentionally excluded.
- Added `src/main/agent-workspace-tools.ts` with Zod validation, root guards, ignore checks, likely-secret filtering, file/read/search caps, lexical retrieval, and active-context formatting.
- Added `src/main/agent-index-store.ts`, persisting compact workspace index metadata under `userData/workspace-projects/<projectId>/index/workspace-index.json`.
- `ChatThread` now shows compact agent activity rows and keeps existing structured `grokforge-agent-tools` write proposal/apply/undo behavior.
- Verified with `npm run test`, `npm run typecheck`, and `npm run build`.

## Key files

- `src/main/agent-context.ts`
- `src/main/agent-runner.ts` (new)
- `src/main/workspace-search.ts`
- `src/main/run-command.ts`
- `src/main/agent-tools.ts`
- `src/preload/preload.ts`
- `src/shared/*agent*contract*.ts`
- `src/renderer/src/components/ChatThread.tsx`
- `src/renderer/src/types.ts`

## Completion bookkeeping

When this story ships: update its **Status** line, the progress table in [`README.md`](README.md), and run **`npm run stories:html`** at the repo root so [`stories.html`](stories.html) stays in sync.
