# 167 — Post-plan incremental: nudge when first tool sample is empty

**Status:** Not started.

**Priority:** **High** — field report (2026-06-03, Todo App post-plan follow-up): executor turn with `postPlanIncremental: true` completed in ~14s with **`toolSteps: []`**, **`totalToolCharsAccumulated: 0`**, and a final answer that **described failed `read_file` / `edit` / `search_replace` attempts** from an earlier chat turn. Trace showed only `tool_sample` (zero tool calls) → `final_stream` — no harness intervention.

**Design skill:** N/A (harness loop + optional activity copy per [`.cursor/skills/styleguide-design/SKILL.md`](../../.cursor/skills/styleguide-design/SKILL.md)).

**Depends on:** **[120](120-post-plan-executor-routing-and-single-file-edits.md)** (post-plan incremental routing), **[152](152-failed-edit-final-answer-honesty-contract.md)** (honesty when edits fail), **[166](166-deprecate-search-replace-tool-alias.md)** (ensure `edit` is executable — separate allowlist fix; this story is the **empty first sample → premature final** path).

## Why this story exists

**120** routes short Work-mode follow-ups after a completed plan to **executor** + incremental harness copy. Today, when `shouldRoutePostPlanIncremental()` is true, `incrementalEditEnforcement` is also true (`iterativeWorkEdit || postPlanIncremental` in [`agent-runner.ts`](../../src/main/agent-runner.ts)).

On the **first** `tool_sample`, if the model returns **no** `tool_calls`, the runner skips the edit-intent nudge because:

```ts
const shouldNudgeForEditIntent = /* ... */ && !incrementalEditEnforcement
```

Then it falls through to `completeTurnWithFinalStream()` — **no tools run**, but the slim post-plan final contract still pressures a human summary. The model often **re-narrates failures from `threadSnapshot` / thread memory** instead of calling tools on disk state.

| Observed (trace `542d6928-…`) | Harness behavior |
|------------------------------|------------------|
| `toolSteps: []`, `outcome: completed` | Zero tools executed |
| `providerRounds`: `tool_sample` then `final_stream` only | No second tool round |
| `harnessMetrics.postPlanIncremental: true` | Incremental path active |
| Final text: “multiple read_file + edit attempts failed…” | Confusing vs trace (prior turn or confabulation) |

**Root cause:** post-plan incremental **disables** the same **edit-intent tool nudge** used on generic Work edit turns, without a **replacement** nudge when the first sample is empty.

## Goals

### 1. Do not finalize on empty first sample (post-plan incremental + edit intent)

In [`src/main/agent-runner.ts`](../../src/main/agent-runner.ts), when **all** of:

- `postPlanIncremental === true` (or document if `iterativeWorkEdit` should share the same rule),
- `isLikelyEditIntent(userText)` (existing heuristic),
- `!editProposalCreated`,
- first (or any?) `tool_sample` in the turn has `sampled.toolCalls.length === 0`,
- nudge not already issued this turn,

then **do not** call `completeTurnWithFinalStream()` immediately.

Instead inject **one** mid-turn user message (new builder in [`src/harness/policy/final-answer/final-answer-contract.ts`](../../src/harness/policy/final-answer/final-answer-contract.ts) or [`src/harness/plan/routing/post-plan-incremental.ts`](../../src/harness/plan/routing/post-plan-incremental.ts)) that:

- Requires **`read_file`** on the target file(s) from disk **this turn** (ignore stale chat prose about prior failures).
- Requires **`edit`** (preferred) or `propose_file_edits` for localized UI changes — not a `gf-plan` fence.
- Mentions `rawContent` / `contentHash` for `index.html` (or resolved scope from **136** `resolvedEditScope` when available).

Re-sample `tool_sample` (same pattern as `buildEditIntentToolNudge`).

### 2. Bounded retries

| Constant | Suggested default |
|----------|-------------------|
| Max empty-first-sample nudges per turn | **1** |
| Max extra tool rounds after nudge | **2** (reuse executor `maxToolRounds` budget) |

If the model still returns zero tool calls after the nudge, allow final stream but append honesty guidance: **no edit tools ran this turn** — do not claim prior-turn failures as this-turn outcomes (align **152** `not_attempted` vs `failed`).

### 3. Trace / metrics

Extend [`agent-turn-trace-contract.ts`](../../src/shared/agent-turn-trace-contract.ts) / [`turn-trace-builder.ts`](../../src/harness/logger/turn-trace-builder.ts) `harnessMetrics` (optional, backward compatible):

- `postPlanEmptyToolSampleNudgeIssued?: boolean`
- `postPlanEmptyToolSampleRecovered?: boolean` (true if a later round produced `edit_proposal` or successful edit tool)

Emit a compact harness activity row when the nudge fires (story **119** style).

### 4. Final-answer contract alignment

When `postPlanIncremental` and **this turn** has `editAttemptOutcome: 'not_attempted'` (no tool failures in scratch maps), slim final contract must **not** invite a paragraph summarizing “failed edit attempts” unless thread memory explicitly documents **this** turn’s tool results.

Add marker string for evals (e.g. `POST_PLAN_EMPTY_SAMPLE_NUDGE_MARKER`) in post-plan appendix module.

## Non-goals

- Changing **`shouldRoutePostPlanIncremental`** heuristics in [`post-plan-incremental.ts`](../../src/harness/plan/routing/post-plan-incremental.ts) (length cap, replan detection).
- Replacing thread trim (`threadSnapshotLimit: 24`) — may tune in a follow-up if nudge alone is insufficient.
- Forcing tools on non-edit chit-chat after a plan exists.

## Scope (files)

- [`src/main/agent-runner.ts`](../../src/main/agent-runner.ts) — empty `toolCalls` branch (~1782–1826)
- [`src/harness/plan/routing/post-plan-incremental.ts`](../../src/harness/plan/routing/post-plan-incremental.ts) — nudge copy + stable marker
- [`src/harness/policy/final-answer/final-answer-contract.ts`](../../src/harness/policy/final-answer/final-answer-contract.ts) — `not_attempted` + post-plan final honesty
- [`src/shared/agent-eval-tags.ts`](../../src/shared/agent-eval-tags.ts) + [`src/main/agent-runner-evaluation.test.ts`](../../src/main/agent-runner-evaluation.test.ts)
- [`src/harness/tools/TOOLS.md`](../../src/harness/tools/TOOLS.md) — one-line “post-plan must not zero-tool finalize” note (optional)

## Acceptance criteria

- [ ] Eval: completed plan exists + short edit user text + mock transport returns **zero** tool calls on first sample → harness injects post-plan empty-sample nudge → **second** sample includes `read_file` or `edit` / `propose_file_edits`.
- [ ] Eval: after nudge, trace records `toolSteps.length >= 1` OR explicit `postPlanEmptyToolSampleNudgeIssued` with final `not_attempted` honesty (no “failed S&R this turn” when none ran).
- [ ] Manual: Todo App post-plan follow-up (“change add button…”) does not complete in &lt;15s with empty `toolSteps` unless user cancels.
- [ ] `npm run test` and focused `npm run test:agent-eval` for new tag pass.

## Suggested implementation order

1. Nudge builder + agent-runner branch (smallest behavior fix).
2. Trace metric + activity row.
3. Final-contract / honesty tweak for `not_attempted` post-plan finals.
4. Eval tag + regression test.

## Related stories

- **[120](120-post-plan-executor-routing-and-single-file-edits.md)** — introduced post-plan incremental routing.
- **[130](130-work-iterative-edit-harness.md)** / **[135](135-iterative-work-surgical-edit-enforcement.md)** — iterative Work also sets `incrementalEditEnforcement`; decide whether empty-first-sample nudge applies to **`iterativeWorkEdit`** only, **`postPlanIncremental`** only, or both.
- **[152](152-failed-edit-final-answer-honesty-contract.md)** — distinguish `not_attempted` vs `failed` in final copy.
- **[166](166-deprecate-search-replace-tool-alias.md)** — tool surface cleanup (orthogonal).

## Completion bookkeeping

When implemented: mark **167** **Done**, update [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
