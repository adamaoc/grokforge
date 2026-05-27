# GrokForge — agent and contributor guide

This document is for humans and for Cursor agents. Read it before making structural changes, touching IPC, or extending the desktop shell.

## What this project is

**GrokForge** is an Electron desktop app (voice-first, multi-root coding agent UX) built with **electron-vite**, **React 19**, **TypeScript**, **Tailwind CSS**, **Monaco Editor**, and **Zod** for the workspace manifest. The product vision (from `package.json`): a Grok-native agent surface with multi-root workspaces and native voice.

**Agent vs harness:** xAI **Grok** models provide intelligence; **this app is the harness** — tools, context, orchestration, review gates, and UI that turn a model into a coding agent. Read **[`docs/i-am-a-harness.md`](docs/i-am-a-harness.md)** before large agent-loop or prompt/tool changes (model vs harness, per-model tuning, context patterns, and a GrokForge-specific design checklist).

Early-stage note: core agent backends and many filesystem features are **stubbed or TODO**; Grok Voice uses a main-process WebSocket to xAI realtime with renderer mic/playback via IPC (`voice-realtime.ts`, story **013**).

## Repository layout

| Path | Role |
|------|------|
| `src/main/` | Electron **main** process: `BrowserWindow`, `ipcMain`, dialogs, FS I/O, Grok Voice WebSocket bridge (`voice-realtime.ts`). |
| `src/preload/` | **Preload** script: `contextBridge` exposes `window.electron` — the only sanctioned renderer → main API. |
| `src/renderer/` | Vite **renderer** (React UI): `index.html`, `src/main.tsx`, `src/App.tsx`, `src/components/*`. |
| `electron.vite.config.ts` | Build config: separate bundles for main, preload, renderer; renderer aliases `@`, `@components`, `@lib`. |
| `tsconfig.json` | Strict TS; path aliases `@/*`, `@main/*`, `@preload/*`. |

Compiled output lives under `dist/` (main, preload, renderer). Do not hand-edit generated files.

## Commands

- **`npm run dev`** — electron-vite dev (loads renderer from `http://localhost:5173` in development).
- **`npm run build`** — production build.
- **`npm run preview`** — preview production build.
- **`npm run start`** — run packaged `electron .` (expects built artifacts).
- **`npm run typecheck`** — `tsc --noEmit`.
- **`npm run lint`** — ESLint over `.ts` / `.tsx` (ensure config exists if the script fails).
- **`npm run test`** — Vitest unit tests (`src/**/*.test.ts`).
- **`npm run test:e2e`** — **Headless** smoke after a production build: runs **`npm run build`** then **Vitest** with `vitest.e2e.config.ts` (see `e2e/*.test.ts`) — verifies `dist/` output and terminal **policy** rules.
- **`npm run test:e2e:ui`** — Playwright + Electron UI E2E after a production build: launches `electron dist/main/main.js` against the built renderer with isolated temp `userData` and workspace fixtures.
- **`npm run test:e2e:ui:headed`** — same UI E2E suite in headed mode for local debugging.

## Runtime and dependency maintenance

- Develop and CI against **Node 22 LTS** with npm and `package-lock.json`.
- Before dependency/runtime upgrades, read **`docs/dependency-runtime-watchlist.md`**.
- High-attention packages include Electron, electron-vite/Vite, React, Monaco, Radix/shadcn primitives, Tailwind, TypeScript, Vitest/Playwright, markdown/sanitize packages, `ws`, and `zod`.
- Dependency changes should normally pass `typecheck`, unit tests, production build, Vitest E2E smoke, and Playwright/Electron UI E2E; document any exception in the story or PR notes.
- Treat Electron major upgrades as security/packaging reviews, especially around preload isolation, permissions, `safeStorage`, and production startup.

## Architecture rules

### Process boundaries

1. **Renderer must not use Node or Electron APIs directly.** Use `window.electron` from preload only.
2. **Main process** owns privileged operations (disk, native dialogs, future WebSockets to services).
3. **Preload** is the contract: add new capabilities by extending `electronAPI` in `preload.ts` and matching `ipcMain.handle` / `ipcMain.on` in `main.ts`.

### Workspace projects and manifest (app storage)

A GrokForge **project** is a stable **UUID** with a human **display name** and a **workspace manifest** persisted only under the app’s `userData` directory — **not** as `.grokproject.json` inside user folders.

- **Store:** `src/main/app-project-store.ts` — `userData/workspace-projects/<projectId>/project.json` (record includes `displayName` + `manifest`). Chat log: `.../<projectId>/chat/thread.jsonl` (`src/main/chat-store.ts`).
- **Session:** `src/main/main.ts` keeps `currentProjectId` and `currentProject` (manifest) after **`open-project`** (folder picker → **new** stored project with that folder as the first root) or **`open-project-by-id`** (recents).
- **Schema:** `src/main/manifest.ts` (`GrokProjectManifestSchema` / `GrokProjectManifest`). When changing fields, update **Zod**, defaults in **`app-project-store.ts`** (`defaultManifestForFirstRoot` / `createStoredProject`), and renderer consumers. Renderer re-exports types via `src/renderer/src/types.ts` — keep manifest types **single-sourced** from `manifest.ts` where possible.
- **Roots:** v1 uses **absolute** paths per machine. Agent reads/writes and context files resolve under **`manifest.roots` only** (see `agent-context.ts` — no separate “manifest parent directory” base).

### Model routing (`manifest.models`)

GrokForge resolves **which xAI model id** to use through `getModelForIntent()` in `src/shared/model-router.ts` (re-exported by `src/main/model-router.ts` for main-side compatibility). Product intents map one-to-one to manifest keys via `MODEL_INTENT_MANIFEST_KEYS`: `chat_default` → `models.default` (default agent thread), `planning` → `models.planning`, `execution` → `models.execution`, `reasoning` → `models.reasoning`, and `voice` → `models.voice` (used by `voice-realtime.ts` and voice UI so future voice work does not re-read `manifest.models` ad hoc). The renderer re-exports this helper from `src/renderer/src/types.ts`. Optional `{ logSelection: true }` logs the resolved pair in development when recording an actual outbound choice (e.g. sending chat).

### UI stack

- Tailwind utility classes, dark zinc palette; highlight accent is user-selectable (**Fern**, **Frost**, **Flame** plus five “More” themes) via **Settings → Appearance**, persisted in renderer `localStorage` (`grokforge.accent`) and applied as `data-accent` on `html` with CSS variables in `src/renderer/src/index.css` (`--gf-accent`, `--primary`, `--ring`). Default **Fern** matches `#00ff9f` / `#00cc7a` on `:root`.
- Icons: `lucide-react`. Motion: `framer-motion`. Toasts: `sonner`.
- Code editing: `@monaco-editor/react` in `EditorPane.tsx`.

## Extending the app (checklist)

1. **IPC**: add handler in `src/main/main.ts`, expose in `src/preload/preload.ts`, call from renderer with optional thin wrapper hook.
2. **Types**: share renderer-facing DTOs via `src/shared/` when preload/main/renderer all need them. The preload bridge shape is checked by `src/shared/preload-api-contract.ts`; keep `src/preload/preload.ts` satisfying that contract.
3. **Security**: keep `contextIsolation: true` and `nodeIntegration: false` unless you have a documented exception; validate all IPC payloads on the main side for production paths.
4. **Agent file writes (scoped):** **`agent-tool-batch`** applies structured `write_file` operations only under **`manifest.roots`**, rejects **`manifest.ignore`** paths, and records one undo snapshot per batch; **`agent-undo-last-batch`** restores it. Implementation **`src/main/agent-tools.ts`**; DTOs **`src/shared/agent-tool-contract.ts`** / Zod parse **`src/shared/agent-tool-schema.ts`**. Renderer: **Settings → Agent file writes** (`grokforge.agentWritesMode` in `localStorage`) and **`ChatThread`** apply / auto-apply UX.

### Agent chat tool loop (`agent-chat-*`, story **034**)

The normal text chat path now goes through **`agent-chat-start`** instead of the renderer assembling raw chat-completion messages. The main-process runner (`src/main/agent-runner.ts`) builds the system prompt, adds active UI context, runs lexical retrieval, exposes xAI Chat Completions function tools, executes allowed tool calls, and streams only the final assistant text back to the renderer. **Program index:** **[`docs/harness-roadmap.md`](docs/harness-roadmap.md)** (dual-model strategy, shipped stories **102–114**, debt retrospective, eval links). Harness design depth: **[`docs/i-am-a-harness.md`](docs/i-am-a-harness.md)**.

**Default model ids (dual-model harness):** new projects use **`grok-build-0.1`** for `chat_default` / `execution` and **`grok-4.3`** for `planning` on purpose — per-model harness profiles (**[103](project_tasks/post-mvp/103-agent-harness-per-model-profiles.md)**), not a single generic prompt. Legacy slug **`grok-code-fast-1`** still maps to the same fast profile and redirects to build at the API. Shared defaults: **`DUAL_MODEL_FALLBACKS`** in `src/shared/model-router.ts`; profile keys via **`resolveHarnessProfileKey`** in `src/shared/agent-harness-profile-contract.ts`. **121** adds optional **`reasoning_effort`** on Grok 4.3 turns via **`resolveReasoningEffort`** in `src/shared/agent-reasoning-effort.ts`. **102** emits **`turn_started.routing`** `{ modelIntent, modelId, harnessProfileKey, agentProfileId, reasoningEffort? }` and persists it on turn traces; xAI catalog notes: [`docs/harness-102-xai-investigation.md`](docs/harness-102-xai-investigation.md). See **[121](project_tasks/post-mvp/121-xai-model-catalog-and-api-sync.md)**, **[102](project_tasks/post-mvp/102-dual-model-manifest-and-harness-foundation.md)**, and **[`docs/harness-roadmap.md`](docs/harness-roadmap.md)**.

**Canonical turn routing (story 097):** `resolveAgentTurnRouting()` in `src/shared/agent-turn-routing.ts` is the single source of truth in main. The renderer `model` field on `agent-chat-start` is a **hint only**; xAI calls use `routing.modelId`. Dev logs note when hint ≠ canonical. After **`turn_started`**, composer and context-strip badges use **`turn_started.routing`** (`liveTurnRouting` in `ChatThread`); pre-turn previews use `nextSendModelIntent` only. Full model-intent + profile matrix: comment block in **`agent-turn-routing.ts`**.

**Model intent** (`resolveAgentChatModelIntent` precedence):

1. `isApprovedPlanAutoRun` → `execution` (story **069** approve-and-run).
2. Explicit `modelIntent` from composer chip (works in **both** fast and plan mode).
3. Else `chatMode === 'plan'` → `planning`.
4. Else → `chat_default`.

**Agent profile** (`resolveAgentProfileId` — behavior axis, independent of chip):

| Condition | `agentProfileId` | Tools sent to xAI |
| --- | --- | --- |
| `chatMode === 'plan'` | `planner` | `read_only` only |
| `isApprovedPlanAutoRun` or `modelIntent === 'execution'` (fast) | `executor` | full toolset |
| Default fast chat | `default` | full toolset |

Example: Plan mode + Fast chip → **planner** profile + `models.default` model id. Plan mode + planning chip → planner + `models.planning`.

**Agent profiles (phase toolsets, story 104):** toolsets in `src/shared/agent-toolset.ts`; main filters the xAI `tools` array per turn (`filterToolDefinitionsForProfile` in `agent-workspace-tools.ts`).

**V1 tools:** **`workspace_index`**, **`list_directory`**, **`read_file`**, **`search_workspace`**, **`run_command`**, **`propose_file_edits`**, and (parent turns only) **`spawn_subagent`**. Read/search tool execution lives in **`src/main/agent-workspace-tools.ts`** and is root-scoped, ignore-aware, capped, cancellable, and excludes likely secret files such as `.env`, private keys, and credential-looking names. **`run_command`** is a guarded one-shot request with policy checks and explicit user approval; it is not a PTY and does not write into human terminal sessions. **`propose_file_edits`** creates a first-class pending diff review (the only write path for new agent turns). Legacy **`grokforge-agent-tools`** fences in old chat threads are stripped from display only and are **not** applied.

**Migration (114):** Models must call **`propose_file_edits`** (or **`search_replace`**) for disk changes. Fenced JSON at the end of assistant messages is no longer parsed or applied.

**Edit cascade guard (story **115**):** Per turn, main counts failed **`search_replace`** per file. After **≥2** failures on a path, **`propose_file_edits`** / S&R-derived **`write_file`** that would shrink the file by **>50%** (lines or chars) is **rejected** unless the user asked for a full rewrite (`src/shared/agent-edit-cascade-guard.ts`, enforced in **`validateAgentEditProposal`**). **Exception:** small **markdown/plain text** (≤64 lines, `.md`/`.txt`/…) — shrink guard is skipped so section-style doc edits can still produce a reviewable diff (user should still send full `rawContent`). **`search_replace`** “not found” errors include a **`rawContent`** hint.

**Proposal quality (markdown):** `normalizeAgentWriteFileContent` reflows glued one-line markdown (`# Title ## Section - bullet`); crushed stubs that stay one line after normalize are **rejected** at validation (`src/shared/agent-proposal-quality.ts`).

**Search/replace escalation (story **116**):** After **≥2** failures on a path with no edit proposal yet, main injects one mid-turn user nudge (`buildSearchReplaceEscalationNudge` in `src/shared/agent-final-answer-contract.ts`) to stop guessed `search_replace`, re-read **`rawContent`**, and use **`propose_file_edits`** with complete file text. If the model still fails, main forces final answer after **2** post-nudge tool rounds or **6** total S&R failures (avoids long “thinking” stalls). Final-answer contract and max-iteration hints forbid claiming disk writes when edit tools failed; renderer toasts catch “Updated `*.md`” without a proposal (`assistant-disk-claim-heuristic.ts`). Optional line-number prefix strip on `old_string` in `src/shared/agent-search-replace.ts`.

**Subagents (story **112**):** **`spawn_subagent`** runs a bounded read-only **explorer** child session (`src/main/agent-subagent-runner.ts`) — max **5** tool rounds, model from **`models.planning`** (optional arg **`reasoning`**), no nested spawn. Child transcript: **`userData/workspace-projects/<projectId>/agent-sessions/<childSessionId>.jsonl`** (`src/main/agent-session-store.ts`). Parent receives compact JSON **`{ summary, filesRead[], searchHits[] }`** (default **&lt; 4k** chars). UI: **`phase: 'subagent'`** event + collapsible **`SubagentActivityBlock`** in **`ChatThread`**. **`default`** / **`executor`** profiles only; **`sessionDepth: 'child'`** blocks recursion.

**IPC/events:** preload exposes **`agentChatCapabilities`**, **`agentChatStart`**, **`agentChatCancel`**, and **`onAgentChatEvent`**. Events include turn start, compact activity rows, subagent blocks, final chunks, done, error, and cancelled. `ChatThread` sends `activeRootId`, active file path, open tab dirty flags, and chat mode (`fast` / `plan`) with each turn.

**Plan approve → execute (story **069**):** **Approve and run** sends `isApprovedPlanAutoRun: true` plus fast `chatMode` and `modelIntent: 'execution'`. Main always resolves **`models.execution`** and **executor** profile (`resolveAgentTurnRouting` in `src/shared/agent-turn-routing.ts`). Multiple `propose_file_edits` / **`search_replace`** calls in the same turn are **merged** in main (`mergeAgentEditProposals` in `src/shared/agent-edit-proposal-merge.ts`) before each `edit_proposal` event so the renderer shows one combined diff review. **Same-path composition:** successive edits on one path within a turn chain in order via `findAccumulatedWriteForPath` + `resolveSearchReplaceToWriteBatch` (`baseContent`); merge replaces the prior op with the composed `write_file` while **`expectedContentHash`** stays the turn-start disk baseline from `read_file`. **Edit-intent guard:** fast-mode turns where the user text looks like file edits but the first tool sample returns zero calls get one harness nudge (`buildEditIntentToolNudge` in `src/shared/agent-final-answer-contract.ts`) and a re-sample before final stream; the renderer toasts when the final answer claims a diff/proposal without edit tool results (`assistantReplyClaimsEditOutcomeWithoutTool`). Auto-apply mode applies the merged batch once when the turn completes. Phase stepper / live model badges: story **098**.

**Greenfield workspaces (story **101**):** `isGreenfieldWorkspace()` in **`src/shared/workspace-greenfield.ts`** (index stats + retrieval count). When true in Plan mode, **`grok_4_3`** gets `GREENFIELD_PLAN_SECTIONS` via `buildHarnessTurnPromptSections()` in **`src/shared/agent-harness-profile.ts`** (marker `GREENFIELD_HARNESS_MARKER` for eval/tests). Approve-and-run injects **`EXECUTOR_FROM_PLAN_SECTIONS`** (+ **`GREENFIELD_EXECUTE_BOOTSTRAP_SECTIONS`** when empty) on **`grok_code_fast`**; detailed read/edit rules stay in **`AGENT_TOOL_LOOP_SHARED`**. Changing heuristics or appendix text requires updating **`workspace-greenfield.test.ts`**, **`agent-harness-profile.test.ts`**, and the light marker check in **`agent-runner-evaluation.test.ts`**.

**Turn snapshots (story **105**):** Before each xAI call in a turn, main builds an immutable **`AgentTurnSnapshot`** (`src/shared/agent-turn-snapshot.ts`, `buildTurnSnapshot` in `src/main/agent-turn-snapshot-builder.ts`) with frozen model/profile routing, tool defs, active context, and message split (`systemMessages` + `messagesForProvider`). **`agent-chat-model-transport.ts`** accepts only **`AgentProviderRequest`** derived via `providerRequestFromSnapshot()`. **Tool-sample** rounds use profile-scoped **`max_tokens`** via `resolveAgentChatSampleMaxTokens()` (executor **16384** — legacy **1200** caps truncated full-file `propose_file_edits`; completeness is enforced by validation, not a one-file-per-call workflow rule). Turn traces (**061**) store capped **`providerRounds`** metadata (no full message bodies). Changing snapshot shape or trace summaries requires updating **`agent-turn-snapshot.test.ts`**, **`agent-turn-snapshot-builder.test.ts`**, and **`agent-runner-evaluation.test.ts`**.

**Tool execution context (story **106**):** Every v1 agent tool handler receives **`AgentToolExecutionContext`** (`src/shared/agent-tool-execution-context.ts`) built per tool call via **`buildAgentToolExecutionContext`** in `src/main/agent-tool-execution-context-builder.ts` — `snapshotId` (from the active **105** snapshot), `toolCallId`, `activityId`, abort, manifest/roots, read-registry views, throttled **`emitProgress`**, **`recordPathRead`**, and **`askCommandApproval`**. Dispatch is centralized in **`executeAgentToolCall`** (`src/main/agent-tool-executor.ts`); workspace tools use **`executeWorkspaceTool`**, commands **`executeRunCommandTool`**, edits **`validateAgentEditProposal`**. Changing context fields or callbacks requires updating **`agent-tool-execution-context.test.ts`**, **`agent-workspace-tools.test.ts`**, and **`agent-tool-executor.test.ts`**.

**Context offload (story **107**):** After each tool call, **`applyToolResultOffload`** (`src/main/agent-tool-result-offload.ts`) may replace oversized tool JSON (>12k UTF-8 bytes or ~3k estimated tokens per **`src/shared/agent-context-offload.ts`**) with a compact pointer; full text is stored under **`userData/workspace-projects/<projectId>/agent-offload/<streamId>/<toolCallId>.txt`** via **`src/main/agent-offload-store.ts`** (main process only — not workspace roots). Provider history and **039** `totalToolChars` count **pointer** size only; **`buildContextBudgetReport`** adds **`toolResultOffloadedOriginalChars`**. The model can recover blobs with **`read_file`** on the absolute `offloadPath` in the pointer (scoped read, like chat staging). Stale offload files are pruned (~7 days) at turn start. Changing thresholds or pointer shape requires updating **`agent-context-offload.test.ts`**, **`agent-tool-result-offload.test.ts`**, and **`agent-turn-snapshot-budget.test.ts`**.

**Turn receipts and interrupted boundaries (story **110**):** Each agent turn appends durable receipts to **`userData/workspace-projects/<projectId>/chat/turn-receipts.jsonl`** (`src/main/agent-turn-receipt-store.ts`, schema in **`src/shared/agent-turn-receipt-contract.ts`**). Lifecycle in **`src/main/agent-turn-receipt-lifecycle.ts`**: `in_progress` at **`turn_started`**, terminal line on **`completed`** / **`cancelled`** / **`error`** / **`interrupted`**. Orphan last line `in_progress` (crash) is treated as **`interrupted`** on the next turn; main injects a bounded recovery system block via **`consumeTurnRecoveryHint`** in **`buildInitialMessages`**. **`before-quit`** calls **`flushActiveAgentTurnReceiptsAsInterruptedForApp`** (no xAI stream resume). Tool activity UI adds **`interrupted`** status (amber) distinct from user **cancelled**. Changing receipt shape requires updating **`agent-turn-receipt-contract.test.ts`**, **`agent-turn-receipt-store.test.ts`**, and **`agent-turn-receipt-lifecycle.test.ts`**.

**Harness eval suite (story **108** / **063**):** Deterministic agent-loop regressions live in **`src/main/agent-runner-evaluation.test.ts`** with **`createRecordingTransport`** (`src/main/agent-eval-recording-transport.ts`) and **`setupEvalTurn`** (`src/main/agent-eval-fixtures.ts`); tags in **`src/shared/agent-eval-tags.ts`**. Run focused checks with **`npm run test:agent-eval`**. Changing **`agent-harness-profile.ts`**, **`agent-profile.ts`**, **`agent-turn-routing.ts`**, or **`agent-final-answer-contract.ts`** requires updating eval tests. Manual dual-model smoke: **[`docs/harness-eval-checklist.md`](docs/harness-eval-checklist.md)**.

**Plan mode final answer (story **099**):** Before streaming the final reply, main appends `buildFinalAnswerContract` from `src/shared/agent-final-answer-contract.ts`. When `chatMode === 'plan'`, that contract uses **`GF_PLAN_OUTPUT_CONTRACT`** / `buildGfPlanFinalAnswerContract()` in **`src/shared/gf-plan-contract.ts`** (same schema text as the Plan-mode tool-loop block from `buildGfPlanToolLoopBlock()`). It requires **`gf-plan`** and forbids edit-fence / `propose_file_edits` on the same turn (so “create/build” user text no longer triggers the fast-mode edit contract). The renderer toasts if the turn ends without a valid plan.

**RPI plan artifacts (story **109**):** Valid **`gf-plan`** assistant lines persist durable artifacts under app data only: **`userData/workspace-projects/<projectId>/plans/<planId>/plan.json`** + **`plan.md`** (`src/main/agent-plan-store.ts`, schema in **`src/shared/agent-plan-artifact.ts`**). **`appendChatMessage`** / **`appendChatMessageForProject`** upsert on assistant append and may return **`planId`**. Lifecycle: **`pending`** on create; **`approved`** when the user approves (**`set-stored-plan-status`** IPC); **`superseded`** when a new user message supersedes pending plans (**`mark-stored-plans-superseded`**). **Approve and run** (**069**) passes **`approvedPlanId`** + **`approvedPlanMessageId`** on **`agentChatStart`**; main injects a compact approved-plan system block (summary + absolute `plan.json` path) instead of duplicating full plan JSON in the synthetic user line (**`buildApprovedPlanExecuteUserText`**). The model can **`read_file`** plan paths via **`isPathUnderProjectAgentPlans`** (same security model as offload/staging). Renderer: **`get-stored-plan-for-message`**, plan id in **`PlanModeCard`**, **`planId`** on plan interaction state.

**Project intelligence storage:** compact workspace index metadata is stored under app data only: **`userData/workspace-projects/<projectId>/index/workspace-index.json`** via **`src/main/agent-index-store.ts`**. It refreshes on project open, `workspace_index({ refresh: true })`, and debounced app-driven filesystem mutations.

### Recent projects (picker, stories **020** / **030**)

MRU list lives in **`src/main/recent-projects-store.ts`** under the app `userData` directory (store version **2** — entries keyed by **`projectId`**). **IPC:** **`get-recent-projects`** returns sanitized entries; **`remove-recent-project`** `{ projectId }` drops one MRU row only (does not delete app project storage); **`delete-project`** `{ projectId }` removes **`workspace-projects/<id>/`** and the MRU row; **`update-recent-picker-name`** `{ projectId, displayName }` updates MRU **and** canonical name in **`app-project-store`** (`manifest.name` kept in sync). After changes, main sends **`recent-projects-changed`** on `webContents` with the updated list.

### Workspace text search (`search-workspace`, story **016**)

The main process walks every `manifest.roots` directory tree and skips paths using **`shouldIgnoreFsEntry()`** from `ignore-globs.ts` (same rules as directory listings / story **006**), so ignored trees such as **`node_modules`** are not scanned.

Hard caps and DTO types live in **`src/shared/workspace-search-contract.ts`** (re-exported from `src/renderer/src/types.ts` for UI copy). The main implementation is **`src/main/workspace-search.ts`** — the renderer must never import that file (it pulls `node:fs`); only the shared contract. Limits: **512 KiB** max per file read, **500** match rows returned, **100,000** files visited per search, **200** characters max query length. Files whose first ~8 KiB contain a **NUL** byte are treated as binary and skipped.

**IPC:** **`search-workspace`** `{ query, caseSensitive?, regex? }` returns `{ ok, results, truncated, filesScanned, cancelled? }` or `{ ok: false, error }`. **`search-workspace-cancel`** aborts the current run via **`AbortController`** (async cooperative cancellation in the main thread only—no worker threads). Progress updates use **`search-workspace-progress`** on the main window’s `webContents`.

### Terminal: PTY sessions (`terminal-session-*`, story **050**) and agent guarded commands (story **017** / **059**)

**Human interactive terminal:** Contract in **`src/shared/terminal-session-contract.ts`**. Main runs **`node-pty`** sessions; the renderer uses **`@xterm/xterm`** (`TerminalEmulator.tsx`). **IPC:** **`terminal-session-start`** `{ rootId, cols, rows, shell? }`, **`terminal-session-input`**, **`terminal-session-resize`**, **`terminal-session-kill`**. Events: **`terminal-session-data`**, **`terminal-session-exit`**, **`terminal-session-error`**. Sessions start in the selected workspace root cwd, use a terminal-oriented sanitized env (`TERM=xterm-256color`, `GROKFORGE_TERMINAL=1`, etc.), and do not inject xAI keys. Project switch, window close, or app quit kills live sessions. Renderer tabs can hide/show without killing sessions; explicit close/kill ends a session. Terminal links use safe renderer-side handling: web links go through `openExternalUrl`, and `path:line[:column]` file links open only when resolved under a workspace root.

**Agent one-shot commands (not PTY):** Types and caps live in **`src/shared/run-command-contract.ts`**. **`src/main/run-command.ts`** runs **`child_process.spawn`** with **`shell: true`**, **`cwd`** = resolved manifest root for `rootId`, and the same small **sanitized env allowlist** as the historical guarded runner. **`src/main/run-command-policy.ts`** applies catastrophic blocks, soft-risk acknowledgement, network/install classification, and diagnostic tiers (**126**). The **renderer has no `run-command` IPC**; only **`src/main/agent-runner.ts`** calls **`runCommandInRootForAgent`** after **`agent-command-approval-respond`** when the user approves a model `run_command` tool request. Inline **`AgentCommandApprovalCard`** shows command, root, purpose, timeout, and policy tier; soft-risk commands require an explicit checkbox before Approve. Combined UTF-8 capture is capped at **`RUN_COMMAND_MAX_OUTPUT_CHARS`** (~256k); timeout kills the process (SIGTERM then SIGKILL). After successful scaffold/install commands, main refreshes **`workspace_index`** so new files appear without manual reload (**126**).

**Command harness (126):** Executor / default profiles should call **`run_command`** when an approved plan or user text implies install, scaffold, git init, or verify (`npm install`, `npm create`, `npm run typecheck`, etc.) — not hand-rolled `package.json` alone. Mid-turn **`buildPlanVerifyCommandNudge`** fires when verify/install intent was sampled with zero `run_command`. Final-answer contract forbids claiming install/verify success when commands failed or were rejected. **Velocity temperament never auto-runs commands** — only file proposals auto-apply (**118**). Planner profile stays read-only (no `run_command` on planning turns).

This is **not** a full shell jail: even agent-requested strings can chain `cd` outside cwd—treat as **trusted-developer tooling**, not containment against malicious models or users.

Terminal sessions are trusted human tooling, not a model autonomy surface. Agents must not drive PTY input; they use the guarded spawn path above after explicit approval.

### Git status per root (`git-status`, stories **015** / **031**)

`git-status` returns a root-scoped summary for the repository that contains a workspace root, or for shallow nested repositories below that root. This supports projects where the GrokForge root is a broad parent folder and the actual repo lives in a child folder (for example `jobsboard-generic/www-ijobsboard`). `root.git` is treated as a legacy/default hint, not the only way a root can show a git badge.

The main process uses the Git CLI (`git` on PATH), caps nested repository discovery to a shallow bounded scan, and respects `manifest.ignore` while scanning children. Renderer behavior: sidebar badges auto-refresh on project/root changes and after app-driven file writes/mutations; each root row also has a per-root refresh affordance. `git_unavailable` should be surfaced once clearly, not hidden only in a tooltip.

## xAI Grok API key (main process only)

Streaming chat, voice realtime, and read-aloud call xAI from the **Electron main** process so the API key **never** ships to the renderer as plaintext. The renderer only sees **masked hints** and status via IPC (`get-xai-key-status`); paste/save goes through **`set-xai-api-key`**; **`clear-xai-api-key`** removes the in-app copy.

### Resolution order (chat, voice, TTS)

1. **In-app key** saved from **Settings** (encrypted with Electron **`safeStorage`** under the app’s `userData` directory — see `src/main/xai-key-store.ts`). When present and decryptable, it **overrides** environment variables.
2. Otherwise **`XAI_API_KEY`**, then **`GROKFORGE_XAI_API_KEY`** from the main process environment (e.g. `.env` for local dev via `import 'dotenv/config'` in `src/main/main.ts`).

Removing the saved key restores env-only behavior. **Do not commit `.env`** (see `.gitignore`).

### Threat model and limitations

- Treat stored keys like other desktop secrets: **anyone who can run code as the same OS user** can potentially read them (same class of risk as browser saved passwords, not a jail against malware).
- On some **Linux** hosts, `safeStorage.isEncryptionAvailable()` may be **false**; saving from Settings then fails — use env vars until OS key storage is available.
- Keys are **not logged** by GrokForge; IPC does not return the full secret after save.

### Environment and URLs

- **Primary env var:** `XAI_API_KEY` (see [xAI API docs](https://docs.x.ai/docs/guides/chat)).
- **Alias:** `GROKFORGE_XAI_API_KEY` if you prefer a project-specific name.
- **Optional:** `GROKFORGE_XAI_CHAT_COMPLETIONS_URL` — defaults to `https://api.x.ai/v1/chat/completions`.
- **Local dev:** copy `.env.example` to `.env` in the repo root if you prefer env-based keys during development.

### Grok Voice realtime (same API key as chat)

**Architecture (story 113):** Voice is the realtime **I/O + instructions** layer (`voice-realtime.ts`). Typed **`agent-chat-start`** is the **tool harness** (profiles, toolsets, subagents). Voice does **not** run workspace tools; **Continue in agent chat** hands off via **`buildVoiceHandoffUserText`** in [`src/shared/voice-agent-handoff.ts`](src/shared/voice-agent-handoff.ts) with tool-first exploration rules shared with text chat ([`HARNESS_CROSS_SURFACE_EXPLORE_RULES`](src/shared/agent-harness-profile.ts)).

The **Voice Agent** WebSocket runs in the **main** process only: `wss://api.x.ai/v1/realtime?model=<voice model id>` with `Authorization: Bearer` from the **resolved** API key (Settings store or env — same pattern as streaming chat in **009** — never ship the key to the renderer). Session instructions: `buildChatSystemPrompt(manifest)` + **`buildVoiceHarnessAppendix(resolveHarnessProfileKey(getModelForIntent(manifest, 'voice')))`**. Optional **`GROKFORGE_XAI_REALTIME_URL`** overrides the WebSocket base (no trailing slash; default `wss://api.x.ai/v1/realtime`). IPC: **`voice-session-start`** / **`voice-session-stop`**, renderer sends PCM16 chunks with **`voice-audio-chunk`**; main forwards xAI JSON events as **`voice-realtime-event`**.

**Thread summary caps:** IPC accepts up to **12k** chars ([`VOICE_SESSION_START_THREAD_SUMMARY_MAX`](src/shared/voice-session-contract.ts)); renderer ref and main inject use **10k** effective ([`VOICE_THREAD_SUMMARY_EFFECTIVE_MAX`](src/shared/voice-session-contract.ts)).

**Reliability (026):** Mic capture uses an **AudioWorklet** (24 kHz PCM16, resampled in the hook if the OS forces a different `AudioContext` rate). The main process registers a **`media` permission** handler so packaged builds can show the OS mic prompt. On **macOS**, users may need to allow the app under **System Settings → Privacy & Security → Microphone**; denied access surfaces an explicit toast. **Windows** should follow the same code path; treat mic + headset choice as user-managed if audio is inaudible. **Voice transcripts** (user + assistant) are appended to the visible chat thread for verification when audio is off or hard to hear.

**Read aloud (027):** Chat **read aloud** uses xAI **POST /v1/tts** from the main process (same resolved API key; never sent to the renderer). Optional **`GROKFORGE_XAI_TTS_URL`** overrides the HTTP endpoint (default `https://api.x.ai/v1/tts`). IPC: **`tts-read-aloud`**. The renderer plays returned audio via a blob URL; **stop** is local playback cancel (no extra server call).

## Known simplifications (do not assume “done”)

- The main window loads the **Vite dev URL** only when **`ELECTRON_RENDERER_URL`** is set (electron-vite `dev`). Otherwise it loads **`dist/renderer/index.html`**. This keeps **`npm start`** / Playwright / unpackaged `electron dist/main/main.js` on the built renderer without guessing from `app.isPackaged` alone.
- **`save-manifest`** persists the current manifest via **`saveManifestForProject(currentProjectId, …)`** in **`app-project-store.ts`** (not to user workspace folders).
- Voice pipeline uses **server VAD** for turns; **`voice.defaultVoiceMode: off`** disables the mic control in the UI; **`push-to-talk`** still shares the same realtime pipeline until dedicated PTT UX lands.
- Comments in `main.ts` / `preload.ts` list planned handlers where features are still stubbed (if any remain).

When implementing those features, prefer **incremental PR-sized changes** and preserve the existing UX layout unless explicitly redesigning.

## Project tasks and design skill

- **Harness concepts & patterns:** [`docs/i-am-a-harness.md`](docs/i-am-a-harness.md) — agent vs model, research notes, GrokForge synthesis checklist. **When adjusting the agent loop:** read the [implementation reference](docs/i-am-a-harness.md#implementation-reference-opencode-hermes-pi-t3) section first.
- **Dogfood comparisons (Codex / Cursor / GrokForge ToDoApp):** [`docs/field-reports/README.md`](docs/field-reports/README.md) and [`docs/field-reports/agent-harness-comparison.html`](docs/field-reports/agent-harness-comparison.html).
- **Harness engineering (stability, validation, lifecycle):** Cursor rule [`.cursor/rules/agent-harness-engineering.mdc`](.cursor/rules/agent-harness-engineering.mdc) — auto-attached when editing agent harness code, plan/execute UX, or harness docs.
- **Harness codebase comparison (OpenCode, Hermes, Pi, T3):** [`docs/research/agentic-coding-harnesses.md`](docs/research/agentic-coding-harnesses.md) — full inspection report (2026-05-19).
- **Backlog / stories:** `project_tasks/` — numbered markdown files in implementation order; see `project_tasks/README.md` for the index. Post-MVP specs live under `project_tasks/post-mvp/` (e.g. harness wave **102–114**).
- **Story status bookkeeping:** Cursor project skill **`.cursor/skills/update-project-tasks/SKILL.md`** (invoke as `@update-project-tasks`). When a story ships or status changes, update the story file + `project_tasks/README.md` + run **`npm run stories:html`** — see the skill for exact status strings.
- **UI and design consistency:** Cursor project skill **`.cursor/skills/styleguide-design/SKILL.md`** (invoke as `@styleguide-design` in Cursor). Every `project_tasks` story references it where renderer or UX is involved; follow it for tokens, component size/reuse, and shadcn usage.

## Git and Cursor

- Prefer focused commits; run `typecheck` before pushing substantive TS changes.
- Project-specific AI rules live in **`.cursor/rules/*.mdc`**; this file is the narrative overview agents should read first.
