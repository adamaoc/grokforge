# 145 — Intermittent plan not appearing in UI until project restart

**Status:** Post-MVP backlog.

**Design skill:** `@styleguide-design` if plan card / stepper UX changes; otherwise N/A (reliability / state sync).

**Depends on:** **[109](109-rpi-plan-artifacts-on-disk.md)** (plans persist on disk), **[098](098-planning-mode-execute-ux-polish.md)** (plan card + phase stepper), **[069](../069-plan-approve-auto-agent-turn.md)** (approve-and-run lifecycle).

## Why this story exists

After a plan **finishes executing successfully**, the UI **sometimes** does not show the completed plan or updated plan status until the user **leaves the project and re-opens it**. This occurs roughly **1 in 10** times during dogfood (Plan → Approve and run → execute completes).

**Observed behavior:**

- The plan is **correctly created and stored on disk** (`userData/workspace-projects/<projectId>/plans/…` per **109**).
- The **renderer / chat thread** does not reflect the completed state (plan card, status badge, or “done” phase) until a **full project reload**.
- This appears to be a **frontend state synchronization** issue rather than a backend or harness failure — execution and persistence succeed; only the in-session UI is stale.

**Priority:** Reliability / trust — users may think execute failed or the plan was lost when it is actually on disk.

## Repro notes (from report)

| Item | Detail |
| --- | --- |
| Flow | Plan mode → valid `gf-plan` → Approve and run → execute turn completes without error |
| Symptom | Plan card / status stuck in `executing`, `approved`, or missing; disk has final `plan.json` |
| Workaround | Switch project (recent picker) and re-open same project |
| Frequency | ~1 in 10 (intermittent) |
| Backend | Plan artifact and chat persistence appear correct after reload |

## Hypotheses (for implementers)

1. **Plan interaction state not updated on `agent-chat` `done`** — `plan-interaction-storage.ts` / `usePlanExecuteLifecycle` miss a terminal transition when events arrive out of order or after a race.
2. **`planId` not re-fetched after execute** — `get-stored-plan-for-message` or equivalent IPC not called (or result ignored) when the execute turn ends; UI still binds to pre-run snapshot.
3. **Chat thread message list vs plan card desync** — assistant line has `planId` but `PlanModeCard` props derive from stale local state not invalidated on turn completion.
4. **Background / unmount edge (**070**)** — project switch or partial unmount drops a late `done` handler; less likely if repro happens without leaving the app.
5. **Supersede / status IPC gap** — main updates `plan.json` `status` on disk but renderer never receives a push or polling refresh after approve-and-run.

## Goals

1. **Identify root cause** — trace plan UI state from approve-and-run through `executing` → `done`; document race or missing invalidation in story file or PR.
2. **Fix** — plan status and completed plan content reliably appear in the UI when execute finishes, **without** project restart.
3. **Guard** — regression note or targeted test if a deterministic hook exists (e.g. lifecycle reducer, IPC mock); otherwise document manual repro checklist in PR.

## Non-goals

- Changing `gf-plan` schema, harness routing, or execute-turn prompts.
- New plan-on-disk layout (**109** is done).
- Full chat thread rewrite (**141**).

## Scope (candidate)

- [`src/renderer/src/components/ChatThread.tsx`](../../src/renderer/src/components/ChatThread.tsx) — agent event handlers, plan binding on turn end
- [`src/renderer/src/components/PlanModeCard.tsx`](../../src/renderer/src/components/PlanModeCard.tsx) — displayed status vs stored plan
- [`src/renderer/src/hooks/usePlanExecuteLifecycle.ts`](../../src/renderer/src/hooks/usePlanExecuteLifecycle.ts) — phase transitions
- [`src/renderer/src/lib/plan-interaction-storage.ts`](../../src/renderer/src/lib/plan-interaction-storage.ts) — persisted per-plan UI phase
- [`src/main/agent-plan-store.ts`](../../src/main/agent-plan-store.ts) — confirm when `status` is written vs when renderer is notified (read-only unless IPC gap found)
- IPC: **`get-stored-plan-for-message`**, **`set-stored-plan-status`**, chat append / `planId` return paths

## Acceptance criteria

- [ ] Root cause documented (this file updated or PR description) with the failing transition (e.g. missing `done` handler, stale `planId`, no refetch).
- [ ] After approve-and-run completes successfully, plan card and status show **completed / done** (or equivalent **098** terminal state) **without** re-opening the project — verified across multiple consecutive runs.
- [ ] Disk state and UI state stay consistent: reloading the project is not required to see the same plan the user would see after restart.
- [ ] Regression: unit test for lifecycle reducer / storage transition **or** manual checklist added to [`docs/harness-eval-checklist.md`](../../docs/harness-eval-checklist.md) § plan UX if automation is impractical.
- [ ] `npm run typecheck` and `npm run test` pass.

## Related

- **[118](118-work-vs-plan-mode-and-conversation-lifecycle.md)** — Work/Plan lifecycle and trust surfaces
- **[099](099-plan-mode-final-contract-and-toast.md)** — plan validation toasts (distinct from post-execute sync)
- **[117](117-renderer-black-screen-on-macos-resume.md)** — other intermittent renderer stability

## Completion bookkeeping

When shipped or closed: update **Status**, [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
