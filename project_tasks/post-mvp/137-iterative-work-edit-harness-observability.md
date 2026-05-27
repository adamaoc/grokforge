# 137 — Iterative Work edit harness observability

**Status:** Done (2026-05-27).

**Priority:** **Third** among **135–137** — dogfood showed thrashy Work-mode edits that **eventually** succeeded; without metrics it is hard to tell whether **135**/**136** improved behavior or merely changed prompts. This story adds **trace + dev-visible summaries** so harness engineers can diagnose under-constrained iterative turns quickly.

**Design skill:** N/A; optional minimal renderer dev panel only if already patterned elsewhere — prefer trace file + logs.

## Why this story exists

Today [`AgentTurnTraceV1`](../../src/shared/agent-turn-trace-contract.ts) records `toolSteps`, `editProposalCreated`, and `maxToolIterationsHit` but **not**:

- Whether **`iterativeWorkEdit`** routing was active
- **Read-only vs edit** round counts
- Which **harness nudges** fired (discovery saturation, S&R escalation, scaffold, iterative thrash — post-**135**)
- Per-path **`search_replace`** count and **re-read** detection outcome
- **Time-to-proposal** (tool round index when first `edit_proposal` emitted)

When a Todo localStorage turn uses **6** tool rounds, we cannot answer from traces alone: “did iterative guidance apply?” or “which nudge failed to change behavior?”

## Goals

### 1. `harnessMetrics` on turn trace (schema v1 extension)

Extend [`agent-turn-trace-contract.ts`](../../src/shared/agent-turn-trace-contract.ts) with optional object (backward compatible):

```ts
harnessMetrics?: {
  iterativeWorkEdit?: boolean
  postPlanIncremental?: boolean
  toolRoundCount?: number
  readOnlyRounds?: number
  searchReplaceCountByPath?: Record<string, number>  // capped keys
  nudgesIssued?: string[]  // marker ids, max 12
  editProposalAtRound?: number
  stoppedAfterProposal?: boolean
  resolvedEditScope?: 'single_file' | 'few_files' | 'broad'  // from 136 when present
}
```

Populate in [`agent-runner.ts`](../../src/main/agent-runner.ts) at turn end (same path as trace persist **061**).

### 2. Development logging

When `logSelection` / existing dev harness logging is enabled:

- One line per turn: `iterativeWorkEdit=true rounds=5 proposal@round=4 nudges=[discovery_saturation, iterative_sr_consolidation]`
- Do **not** log file contents or API keys.

### 3. Eval assertion helper

In [`agent-eval-tags.ts`](../../src/shared/agent-eval-tags.ts), document tags that assert on `harnessMetrics` (used by **135** evals):

- `behavior:iterative_work_trace_metrics` — after localStorage fixture, trace shows `iterativeWorkEdit: true`, `editProposalAtRound <= 4`, `nudgesIssued` length bounded.

### 4. Harness checklist + field-report template

[`docs/harness-eval-checklist.md`](../../docs/harness-eval-checklist.md) — section **Iterative Work edits**:

1. Open last turn trace (Settings / dev path if exposed, or `userData/.../agent-traces/`).
2. Confirm `harnessMetrics.iterativeWorkEdit` and `editProposalAtRound`.
3. Compare before/after **135** on same Todo localStorage prompt.

Optional: one row in [`docs/field-reports/README.md`](../../docs/field-reports/README.md) pointing to metrics — only if checklist is insufficient.

## Scope

- [`src/shared/agent-turn-trace-contract.ts`](../../src/shared/agent-turn-trace-contract.ts) + contract tests
- [`src/main/agent-runner.ts`](../../src/main/agent-runner.ts) — accumulate metrics during loop
- [`src/main/agent-turn-trace-store.ts`](../../src/main/agent-turn-trace-store.ts) — persist if separate from runner
- [`src/shared/agent-eval-tags.ts`](../../src/shared/agent-eval-tags.ts)
- [`src/main/agent-runner-evaluation.test.ts`](../../src/main/agent-runner-evaluation.test.ts) — metrics assertions
- [`docs/harness-eval-checklist.md`](../../docs/harness-eval-checklist.md)
- Optional: [`src/main/main.ts`](../../src/main/main.ts) IPC `get-last-agent-turn-trace` already exists — verify renderer/types re-export

## Non-goals

- Full analytics dashboard or Datadog integration.
- User-facing “why so many steps?” UI (**125** activity clarity is separate).
- Changing receipt JSONL schema (**110**) unless a single optional `harnessSummary` string is trivial — prefer trace file.

## Dependencies

- **Builds on:** **[108](108-harness-eval-suite-per-model-regressions.md)** (traces), **[130](130-work-iterative-edit-harness.md)**.
- **Best after:** **[135](135-iterative-work-surgical-edit-enforcement.md)** — nudge marker list stabilizes; **136** optional field `resolvedEditScope`.

## Acceptance criteria

- [x] Completed iterative Work turn trace includes `harnessMetrics.iterativeWorkEdit: true` and `toolRoundCount`.
- [x] When **135** consolidation nudge fires, `nudgesIssued` contains agreed marker id.
- [x] Eval: `behavior:iterative_work_trace_metrics` passes against recording fixture.
- [x] Dev log line emitted when harness debug logging enabled (test via mock logger or env gate).
- [x] Harness checklist updated; `npm run typecheck` and contract tests pass.

## Related

- **[135](135-iterative-work-surgical-edit-enforcement.md)**
- **[136](136-iterative-edit-scope-and-combine-heuristics.md)**
- **[061](../061-agent-turn-trace-for-debugging.md)** — turn traces (if numbered)
- **[110](110-agent-turn-receipts-and-interrupted-boundaries.md)**

## Completion bookkeeping

When shipped: update **Status**, [`README.md`](../README.md) post-MVP table, [`docs/harness-roadmap.md`](../../docs/harness-roadmap.md), run **`npm run stories:html`**.
