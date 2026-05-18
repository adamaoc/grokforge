# 070 — Background agent chat and dashboard activity

**Status:** Done (v1: lifted agent activity + `append-chat-message-for-project`; thread survives dashboard navigation; welcome MRU activity indicator).

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` before changing dashboard cards, global chrome, or chat layout (`@styleguide-design`).

## Why this story exists

Today, starting an **agent turn** or **streaming chat** and then **navigating away** from the project workspace (for example back to the **recent projects dashboard**) tends to **cut off** the turn: the UI may unmount (`ChatThread` uses a `key` tied to `workspaceProjectId`), listeners detach, or the user loses visibility while main-process work may still be running or may be torn down inconsistently.

Users expect long-running agent work to behave like other desktop tools: **continue in the background** and show **trustworthy status** from the home surface.

## Current behavior (hypotheses for implementers to verify)

- `ChatThread` in `App.tsx` is mounted inside `ProjectWorkspaceShell` with `key={workspaceProjectId ?? project.name}`, which **remounts** the thread when the project identity changes and can reset local streaming state when the shell is not mounted.
- Agent events arrive via `webContents.send('agent-chat-event', …)` to the **focused BrowserWindow** (`setAgentChatTargetWindow` in main). If the renderer stops listening or the window focus model changes, events may be dropped from the user’s perspective.
- `activeTurns` in `src/main/agent-runner.ts` is keyed by `streamId`; lifecycle may assume a single visible chat surface per window.

Document actual findings in the PR and adjust acceptance criteria if the root cause differs.

## Goals

1. **Background execution:** An in-flight **agent chat turn** (tool loop + streaming final) continues to completion when the user leaves the project view, **without** spurious cancel unless the user explicitly cancels or a timeout fires.
2. **Reattachment:** When the user returns to the same project, the thread UI reflects the **completed or in-progress** turn (buffered deltas or persisted assistant line), not a silent failure.
3. **Dashboard visibility:** On the **recent projects / dashboard** view, each **project card** shows a **compact activity indicator** when that project has background work (e.g. pulsing dot, “Agent running…”, spinner with label). Optional: a **global** indicator in the app header if multiple projects could run (future); v1 can be **per-card** only if only one project can run at a time.
4. **Explicit cancel:** User can still **cancel** from wherever the product exposes cancel (thread or a minimal floating control); cancel must propagate to main `agent-chat-cancel` as today.

## Scope

### Main process

- **`src/main/agent-runner.ts`**, **`src/main/main.ts`**: Ensure `targetWindow` / `agent-chat-event` routing supports **subscription from dashboard** or a **durable event bus** (e.g. broadcast to `BrowserWindow` that is current, or queue per `projectId` until a listener attaches).
- Consider **`get-recent-projects`** enrichment or a new IPC **`get-projects-with-active-agent`** returning `{ projectId, phase, label }[]` with strict caps and no secrets.
- **Persistence:** Completed turns already append to `thread.jsonl`; verify **partial streams** on navigate-away either flush incrementally or recover on reopen (coordinate with **071** if scroll/restore touches the same surfaces).

### Renderer

- **`src/renderer/src/App.tsx`**: Route transitions between dashboard and `ProjectWorkspaceShell` must not **abort** agent work by default.
- **`src/renderer/src/components/ChatThread.tsx`**: Detach/unmount behavior vs streaming subscriptions; possibly lift **stream listener** to `App` or a **project-scoped provider** that survives route changes.
- **Dashboard / recent project cards:** whichever component renders MRU list (from `get-recent-projects` + `recent-projects-changed`), add the **activity badge** and polling or event subscription.

### Preload / contract

- Extend **`preload.ts`** and **`preload-api-contract`** only if new IPC is required; keep DTOs small and typed.

## UX direction

- **Per project card:** small **status chip** — idle / **agent running** / **voice** (if applicable) with accessible `aria-busy` / `aria-live` polite updates.
- Avoid noisy animations; respect **reduced motion** (story **066** alignment).
- Do not show raw model prompts or tool JSON on the card.

## Non-goals (v1)

- Running **simultaneous** agent turns across **multiple** projects in one window unless already supported; if not, document “one active turn per window” and still show **which** project owns it on the dashboard.
- Full **notification center** or OS notifications.

## Testing

- Manual: start agent turn → navigate to dashboard → wait for completion → re-enter project → transcript matches expected.
- Manual: same path but **cancel** from dashboard affordance (if provided) or from returned thread.
- **`npm run typecheck`**; add **Vitest** for any pure helpers (e.g. reducer for “active projects” state) if extracted.

## Acceptance criteria

- [x] Leaving the project view during an agent turn does **not** silently truncate the turn; assistant content ends in **done**, **error**, or **cancelled** consistently with main events.
- [x] Returning to the project shows the **final or in-progress** assistant message state without requiring a resend.
- [x] Dashboard project cards show a **clear visual indicator** when that project has active agent work (or global rule documented if only one project is active).
- [x] No API keys, file contents, or tool payloads appear on dashboard cards.
- [x] `npm run typecheck` passes.

## Related stories

- **[066](066-launch-loading-and-project-transition-states.md)** — loading/transition polish on the same navigation paths.
- **[064](064-launch-welcome-empty-state-and-command-affordances.md)** — avoid visual conflict with empty-state CTAs on dashboard.
- **[056](056-dashboard-review-and-project-picker-redesign-plan.md)** — if dashboard layout is being redesigned, coordinate badge placement.

## Completion bookkeeping

When done: mark **070** done in this file, update `project_tasks/README.md`, run **`npm run stories:html`**.
