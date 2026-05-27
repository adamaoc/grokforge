# 138 — Iterative Work search_replace escalation (fail fast, switch strategy)

**Status:** Done (2026-05-27).

**Priority:** **First** among **138–140** — dogfood (2026-05-26, Work mode, “add remove todo button” on existing Todo app): multiple **`search_replace`** attempts on **`script.js`**, several failures, model **kept retrying** similar patches, only **late** fallback to **`propose_file_edits`**, an **oversized** final proposal, and **`maxToolIterationsHit`**. Story **116** added global escalation at **≥2** failures per path and force-final at **6** total failures — but iterative Work turns still **burn the full executor budget** before recovery feels clean.

**Design skill:** N/A (harness); optional activity copy per [`.cursor/skills/styleguide-design/SKILL.md`](../../.cursor/skills/styleguide-design/SKILL.md).

## Why this story exists

| Observed (“remove todo” button) | Current harness (**116** / **130**) |
|---------------------------------|-------------------------------------|
| Many `search_replace` rounds on one file | Escalation nudge fires once at 2 failures; model may **ignore** and retry S&R |
| Same `old_string` class of errors | No **hard stop** on further `search_replace` for that path after escalation |
| Late `propose_file_edits` with full file | Nudge asks for full `rawContent` but does not require **minimal** diff for localized UI |
| `maxToolIterationsHit` | **6** failures + **2** post-escalation rounds still allows thrash on `iterativeWorkEdit` |
| Small localized ask | Same thresholds as large refactors — no **iterative Work** profile |

**130** / **135** target round count and one proposal per turn; **138** owns **`search_replace` failure → strategy switch** on **`iterativeWorkEdit`** turns specifically.

## Goals

### 1. Stricter thresholds when `iterativeWorkEdit`

In [`agent-edit-cascade-guard.ts`](../../src/shared/agent-edit-cascade-guard.ts) (or [`iterative-work-edit.ts`](../../src/shared/iterative-work-edit.ts)):

| Constant | Default (**116**) | Iterative Work |
|----------|-------------------|----------------|
| Failures before escalation nudge | **2** per path | **1** per path (or **2** with identical error signature — see below) |
| Total failures before force-final | **6** | **3** (tunable) |
| Post-escalation tool rounds | **2** | **1** — next sample must be `propose_file_edits` or final |

`shouldInjectSearchReplaceEscalation` gains optional `{ iterativeWorkEdit: boolean }`.

### 2. Post-escalation: block or reject repeat `search_replace`

After `searchReplaceEscalationNudgeIssued` on an iterative turn:

- **Soft guard (preferred):** tool result for `search_replace` on paths at escalation threshold returns `ok: false` with reason: “GrokForge blocked further search_replace — use propose_file_edits with rawContent from read_file.”
- **Runner:** do not count blocked calls toward successful edit progress; do count toward force-final if model disobeys **twice**.

Optional: allow **one** more S&R only if `contentHash` matches fresh `read_file` in the same round (document if too complex — start with hard block).

### 3. Escalation nudge v2 for iterative Work

Extend [`buildSearchReplaceEscalationNudge`](../../src/shared/agent-final-answer-contract.ts):

- **`iterativeWorkEdit: true`** branch (beyond existing `brief`):
  - “Small UI change (button, handler, CSS class): one **`propose_file_edits`** with **full** `script.js` from `rawContent`, changing **only** the remove-handler block — do not rewrite unrelated todo logic.”
  - Forbid another `search_replace` on this path this turn.
- Marker stable for eval: keep `EDIT_SEARCH_REPLACE_ESCALATION_MARKER`; add sub-line `Harness: iterative search_replace escalation 138`.

### 4. Minimal full-file proposal hint (validation-adjacent)

When escalating on **`.js`** / **`.html`** under iterative Work, inject harness line (not validator change): proposal should preserve unchanged functions; **115** shrink guard still applies — goal is **correct complete file**, not stub.

Coordinate **124** — do not weaken corrupt-content rejection.

### 5. Eval fixtures

- `behavior:iterative_work_sr_fail_fast_escalate`: mock 1× S&R fail on `script.js` → escalation nudge before round 3.
- `behavior:iterative_work_sr_blocked_after_escalate`: post-nudge S&R → blocked tool result; model samples `propose_file_edits`.
- `behavior:iterative_work_sr_no_max_iterations`: “remove todo button” fixture → turn completes without `maxToolIterationsHit` when recording transport cooperates.
- Regression: **116** eval on non-iterative path unchanged (threshold **2**).

## Scope

- [`src/shared/agent-edit-cascade-guard.ts`](../../src/shared/agent-edit-cascade-guard.ts) — iterative thresholds helpers
- [`src/shared/agent-final-answer-contract.ts`](../../src/shared/agent-final-answer-contract.ts) — escalation copy
- [`src/main/agent-runner.ts`](../../src/main/agent-runner.ts) — pass `iterativeWorkEdit`, block repeat S&R, force-final thresholds
- [`src/main/agent-search-replace-tool.ts`](../../src/main/agent-search-replace-tool.ts) — blocked-after-escalation result (or guard in executor wrapper)
- [`src/main/agent-tool-executor.ts`](../../src/main/agent-tool-executor.ts) — if block lives in dispatch layer
- [`src/main/agent-runner-evaluation.test.ts`](../../src/main/agent-runner-evaluation.test.ts)
- [`src/shared/agent-edit-cascade-guard.test.ts`](../../src/shared/agent-edit-cascade-guard.test.ts)

## Non-goals

- Fuzzy / whitespace-normalized matching (**116** non-goal).
- Removing **115** shrink cascade.
- Replacing all iterative S&R with full-file proposals (**139** improves first-attempt success).
- General **135** round caps (reference; implement together if one PR).

## Risks

| Risk | Mitigation |
|------|------------|
| **Legitimate second S&R after re-read** | Allow one S&R after new `read_file` in same turn **before** escalation only |
| **False block on non-iterative** | Gate all new logic on `harnessCtx.iterativeWorkEdit` |
| **Regression on markdown S&R** | Eval non-iterative **116** fixture |

## Dependencies

- **Builds on:** **[116](116-agent-edit-search-replace-escalation-nudge.md)**, **[115](115-agent-edit-cascade-guard-after-search-replace-failures.md)**, **[130](130-work-iterative-edit-harness.md)**, **[085](085-agent-search-replace-tool.md)**.
- **Complements:** **[135](135-iterative-work-surgical-edit-enforcement.md)**, **[136](136-iterative-edit-scope-and-combine-heuristics.md)**.
- **Informs:** **[140](140-search-replace-failure-loop-observability.md)**.

## Acceptance criteria

- [x] Eval: iterative Work + 1 S&R failure on `script.js` → escalation nudge injected (iterative threshold).
- [x] Eval: post-escalation S&R on same path → blocked or rejected with harness reason; next successful path is `propose_file_edits`.
- [x] Eval: iterative fixture completes without `maxToolIterationsHit` when model follows nudge (recording transport).
- [x] Eval: non-iterative turn still escalates at **2** failures (**116** regression).
- [ ] Manual: “add remove todo button” → user sees escalation activity **before** long S&R streak; one reviewable proposal without iteration cap toast.
- [x] `npm run test:agent-eval` and `npm run typecheck` clean.

## Related

- **[116](116-agent-edit-search-replace-escalation-nudge.md)** — global escalation (shipped)
- **[135](135-iterative-work-surgical-edit-enforcement.md)** — low-round enforcement
- **[130](130-work-iterative-edit-harness.md)**
- Dogfood: remove-todo button Work-mode run (2026-05-26)

## Completion bookkeeping

When shipped: update **Status**, [`README.md`](../README.md) post-MVP table, [`docs/harness-roadmap.md`](../../docs/harness-roadmap.md), run **`npm run stories:html`**.
