# 144 — Consolidate incremental Work edit policy

**Status:** Done (2026-05-27).

**Design skill:** N/A (harness only).

**Depends on:** **130–140** (done). Does not change routing (**120** / **130**) or validation/cascade guards.

## Why this story exists

Stories **130–140** added overlapping mechanisms for incremental Work edits: static prompt appendices (**130**, **135**, **139**), scope mid-turn nudges (**136**), thrash mid-turn nudges (**135**), turn-start pre-sample (**139**), tool description overrides, and runtime caps that applied only when `iterativeWorkEdit` — not on the **post-plan incremental** golden path (`postPlanIncremental`).

Dogfood showed tool thrashing and stacked harness rows even after cleanup. Root cause: **policy sprawl** across files, not missing routing.

## Goals

1. **One policy module** — [`src/shared/incremental-work-edit-policy.ts`](../src/shared/incremental-work-edit-policy.ts): enforcement flag, constants, merged harness sections, single mid-turn nudge picker (`commit_proposal` | `stop_reread`).
2. **Remove** turn-start pre-sample nudge, tool description overrides, scope mid-turn nudges, and four-kind thrash picker.
3. **Shared enforcement** — `incrementalEditEnforcement = iterativeWorkEdit || postPlanIncremental`: 4-round cap, stop-after-proposal, discovery saturation at 2 rounds, per-round tracking.
4. **Slim runner** — one mid-turn gate in [`agent-runner.ts`](../src/main/agent-runner.ts); pass `iterativeWorkEdit: incrementalEditEnforcement` to existing S&R escalation helpers only.

## Non-goals

- `resolveAgentTurnRouting`, `shouldRouteIterativeWorkExecutor`, `shouldRoutePostPlanIncremental`
- `validateAgentEditProposal`, corrupt content, merge, cascade guard thresholds
- Plan mode, approve-and-run, greenfield/scaffold flows
- Broad `agent-runner.ts` / `ChatThread.tsx` refactors
- New harness markers or eval tags

## Scope

- [`src/shared/incremental-work-edit-policy.ts`](../src/shared/incremental-work-edit-policy.ts) *(new)*
- [`src/shared/iterative-work-edit-guards.ts`](../src/shared/iterative-work-edit-guards.ts) — round cap only
- [`src/shared/iterative-work-edit.ts`](../src/shared/iterative-work-edit.ts) — remove pre-sample API
- [`src/shared/iterative-edit-scope.ts`](../src/shared/iterative-edit-scope.ts) — turn-start scope only
- [`src/shared/agent-harness-profile.ts`](../src/shared/agent-harness-profile.ts)
- [`src/main/agent-runner.ts`](../src/main/agent-runner.ts)
- [`src/shared/agent-harness-metrics.ts`](../src/shared/agent-harness-metrics.ts)
- Tests + [`docs/harness-eval-checklist.md`](../docs/harness-eval-checklist.md) note

## Acceptance criteria

- [x] `pickIterativeThrashNudge` / `pickIterativeScopeShapeNudge` and pre-sample removed; `pickIncrementalEditMidTurnNudge` only.
- [x] Merged iterative appendix when `iterativeWorkEdit`; no separate 139 S&R section array; no new markers.
- [x] `postPlanIncremental` gets same 4-round cap and stop-after-proposal (partial-batch exception preserved).
- [x] At most one incremental mid-turn nudge per turn (`stop_reread` → `commit_proposal`).
- [x] Merged copy prefers `propose_file_edits` after one `read_file` for persistence/localized/single-file scope.
- [x] `npm run test:agent-eval` green; post-plan stop-after-proposal eval added.
- [x] Harness checklist note for Todo post-plan enforcement.

## Regression risk

| Risk | Mitigation |
|------|------------|
| Post-plan stops too early | Same rule as **135**; partial-batch exception |
| Eval marker churn | Keep `WORK_ITERATIVE_EDIT_MARKER`, `ITERATIVE_EDIT_THRASH_NUDGE_MARKER` in nudge body |
| Runner touch | Minimal diff: `incrementalEditEnforcement` + delete branches |

## Related

- **[130](130-work-iterative-edit-harness.md)** routing, **[135](135-iterative-work-surgical-edit-enforcement.md)** caps, **[136](136-iterative-edit-scope-and-combine-heuristics.md)** scope, **[138–140](138-iterative-work-search-replace-escalation.md)** S&R escalation

## Completion bookkeeping

When shipped: update [`README.md`](../README.md) post-MVP table, [`docs/harness-roadmap.md`](../docs/harness-roadmap.md), run **`npm run stories:html`**.
