# 117 — Renderer black screen on macOS app resume

**Status:** Post-MVP backlog.

**Design skill:** N/A (stability / Electron shell); minor renderer recovery UI if pursued (`@styleguide-design`).

## Why this story exists

**Field report (2026-05-25):** During a **Plan mode** harness test (todo-app greenfield flow), planning looked healthy until the user **tabbed away** from GrokForge (macOS app switcher). On return the window was a **solid black screen** (`backgroundColor` `#0a0a0a` in `main.ts`). **Cmd+R did nothing.** **Force Quit** was required to exit.

This is **not** harness logic failure — likely **renderer crash, hang, or GPU compositor failure** while a long agent turn may still have been running in main (**070**).

**Priority:** Defer until reproducible or blocking daily harness work. Harness program (**102–116**) stays the focus.

## Repro notes (from report)

| Item | Detail |
| --- | --- |
| Phase | Plan mode, planning turn in progress |
| Trigger | macOS app switch away, then return |
| Recovery tried | Cmd+R — no effect |
| Exit | Force Quit |
| Diff open? | Unknown — if yes, see known `setDiffSessionActions` loop in `ChatThread.tsx` (~1908) |

## Hypotheses (for implementers)

1. **Renderer process gone / hung** — no root `ErrorBoundary`, no `webContents.on('render-process-gone')` reload in `main.ts`.
2. **React render loop** — prior black screen from infinite `setDiffSessionActions` when diff review callbacks were effect deps (`ChatThread.tsx` comment ~1906–1908).
3. **IPC + UI storm while backgrounded** — `final_chunk` + `ReactMarkdown` + tool activity updates during long plan/stream; burst on resume.
4. **Dev-only** — Vite dev server disconnect if using `npm run dev`.
5. **macOS GPU layer** — Chromium fails to repaint after resume (sometimes fixed by resize; Cmd+R would not help).

## Goals (when picked up)

1. **Reproduce** reliably (dev vs `npm start` / packaged; plan-only vs diff open; turn still running vs idle).
2. **Observe** — Terminal launch logs, Console.app crash reports, detached DevTools console.
3. **Recover gracefully** — detect renderer death and offer **Reload window** (and log last `streamId` / phase if agent turn was active).
4. **Prevent** where possible — root error boundary; avoid diff-session action loops; optional throttle/defer heavy chat markdown while `document.hidden`.

## Non-goals

- Blocking harness **102–116** follow-ups or eval work.
- Full performance audit of chat streaming (unless repro points there).

## Scope (candidate)

- [`src/main/main.ts`](../../src/main/main.ts) — `render-process-gone`, optional `unresponsive` handling
- [`src/renderer/src/main.tsx`](../../src/renderer/src/main.tsx) — root error boundary + recovery affordance
- [`src/renderer/src/components/ChatThread.tsx`](../../src/renderer/src/components/ChatThread.tsx) — audit diff-session `onUpdateDiffSessionActions` effects; stream/markdown cost while hidden
- [`src/renderer/src/App.tsx`](../../src/renderer/src/App.tsx) — `backgroundColor` vs empty root

## Acceptance criteria

- [ ] Repro steps documented in this file or PR notes (or marked **Closed** if cannot reproduce after N attempts).
- [ ] After simulated/killed renderer, user gets **Reload** (or auto-reload with toast) instead of permanent black screen.
- [ ] Root uncaught render errors show in-app fallback, not blank `#0a0a0a`.
- [ ] No regression: `npm run typecheck`, `npm run test`; manual smoke on macOS resume during in-flight plan turn.

## Related

- **[070](../070-background-agent-chat-and-dashboard-activity.md)** — agent turn continues in main when UI unmounts; persistence may survive renderer death
- **[116](116-agent-edit-search-replace-escalation-nudge.md)** — last harness story before this backlog item

## Completion bookkeeping

When shipped or closed: update **Status**, [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
