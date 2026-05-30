# 163 — Direct Work TaskBoard greenfield eval (156 sibling)

**Status:** Done (2026-05-30).

**Priority:** Medium — locks the **actual dogfood path** (Work mode, empty folder, no plan) that **156** does not cover.

**Design skill:** N/A (eval fixtures + trace assertions).

**Depends on:** **[156](156-taskboard-prototype-failure-regression-eval.md)**, **[160](160-html-normalize-before-prevalidate.md)**, **[161](161-greenfield-work-bootstrap-prompt-appendix.md)**, **[162](162-single-file-html-creation-recovery-exception.md)**.

## Why this story exists

**156** simulates TaskBoard failure on the **approve-and-run** path:

- `isApprovedPlanAutoRun: true`
- seeded `gf-plan` artifact
- `modelIntent: 'execution'`

The 2026-05-30 dogfood repro used **Work mode directly** on an empty `TaskBoard` root with user text like:

> I want to get a design prototype for a taskboard … Keep this all as 1 single html file

That path skips:

- `GREENFIELD_EXECUTE_BOOTSTRAP_SECTIONS` (pre-**161**)
- `executeFromApprovedPlan` routing
- plan artifact context

We need a deterministic eval so prompt, validation, and recovery changes for **160–162** do not regress — and so we can assert **happy path** acceptance when repair + prompts work.

## Goal

Add focused `agent-runner-evaluation` scenarios for **direct Work greenfield** single-file HTML TaskBoard creation — covering both **failure honesty** (baseline) and **accepted proposal** (after **160+** fixes).

## Agent planning — read before coding

Load **`.cursor/rules/agent-harness-engineering.mdc`**.

**Required reading (in order):**

1. [`docs/harness-roadmap.md`](../../docs/harness-roadmap.md) — eval program (**108**, **063**).
2. [`docs/harness-eval-checklist.md`](../../docs/harness-eval-checklist.md) — manual smoke patterns.
3. [`docs/i-am-a-harness.md`](../../docs/i-am-a-harness.md) — § observability, turn traces.
4. [`docs/research/agentic-coding-harnesses.md`](../../docs/research/agentic-coding-harnesses.md) — § eval / regression patterns (T3 event normalization lessons).
5. **[156](156-taskboard-prototype-failure-regression-eval.md)** — copy fixture structure; **do not** duplicate approve-and-run-only assertions.

**Code anchors:**

- `src/main/agent-runner-evaluation.test.ts` — **156** test block (~line 1705).
- `src/main/agent-eval-fixtures.ts` — `TASKBOARD_PROTOTYPE_USER_PROMPT`, `staticTodoCrushedIndexHtml`, `taskBoardPrototypePlan`.
- `src/shared/agent-eval-tags.ts` — add distinct tag e.g. `dogfood:taskboard_work_direct`.
- `src/main/agent-eval-recording-transport.ts`, `setupEvalTurn` patterns from **108**.

**Before writing tests:** Read turn trace fields written on failure (`harnessMetrics.maxIterationsReason`, `nudgesIssued`, `proposalRejectionsByPath`) in `src/shared/agent-harness-metrics.ts` and **140**.

## Narrow acceptance criteria

### Scenario A — failure honesty (baseline until fixes land)

- [x] New eval tag constant documented in `agent-eval-tags.ts`.
- [x] Fixture: empty workspace, `chatMode: 'fast'`, **no** `isApprovedPlanAutoRun`, user text = original TaskBoard single-file prompt (preserve verbatim in fixture comment).
- [x] Transport simulates ≥2 crushed/malformed `propose_file_edits` on `index.html` (reuse `staticTodoCrushedIndexHtml` / variants).
- [x] Assertions:
  - `editProposalCreated === false`
  - `creation_incremental_recovery` nudge issued when integrity failures threshold met
  - force-final or proposal rejection loop metadata present
  - final answer contract includes **152** / **153** honesty markers when applicable
  - no giant pasted fallback in streamed final chunks (same caps as **156**)
  - system prompt includes **161** marker when that story is done (conditional assertion or separate eval case)

### Scenario B — happy path (enable after **160** / **162**)

- [x] Second eval (or parameterized case): model sends crushed HTML once, then valid multi-line HTML (or normalize-repaired content accepted on first try after **160**).
- [x] Assertions: `editProposalCreated === true`, exactly one `edit_proposal` event, no force-final for rejection loop.
- [x] Tag e.g. `dogfood:taskboard_work_direct_success`.

### General

- [x] `npm run test:agent-eval` passes; new tests discoverable by tag grep.
- [x] No live xAI calls — recording transport only.

## Suggested implementation notes

- Split Scenario A and B into separate `it()` blocks for clearer failure signals.
- Use `createEventSink` + `assistantReplyClaimsEditSuccessDespiteNoProposal` from **152** renderer heuristic tests pattern (import shared helper).
- Document in fixture header: screenshot repro date, mode=Work, empty root.
- If **160** changes rejection counts, update Scenario A expectations (e.g. fewer rounds before accept in Scenario B).

## Files / areas that should be touched (tight scope)

- `src/main/agent-runner-evaluation.test.ts`
- `src/main/agent-eval-fixtures.ts` — direct Work user prompt constant if different from plan summary text.
- `src/shared/agent-eval-tags.ts`
- Optional one-line add to `docs/harness-eval-checklist.md`

## What is explicitly out of scope

- Playwright UI E2E.
- Live API dogfood runs (manual checklist only).
- Changing validation or prompt logic (covered by **160–162**).

## Related

- **[156](156-taskboard-prototype-failure-regression-eval.md)** — approve-and-run sibling; keep both.
- **[108](108-harness-eval-suite-per-model-regressions.md)** — eval program parent.

## Completion bookkeeping

When shipped or closed: update **Status**, [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**. Update [`docs/harness-eval-checklist.md`](../../docs/harness-eval-checklist.md) with direct Work TaskBoard repro steps.
