# 140 — search_replace failure loop observability

**Status:** Done (2026-05-27).

**Priority:** **Third** among **138–140** — when the remove-todo Work turn hit **`maxToolIterationsHit`**, it was unclear **how many** S&R failures occurred, whether **116** escalation fired, or if the model ignored the nudge. **137** plans generic iterative metrics; **140** specializes **edit-tool failure diagnostics** for harness debugging and dogfood comparisons.

**Design skill:** N/A.

## Why this story exists

| Question after dogfood | Answerable today? |
|------------------------|-------------------|
| How many `search_replace` failures on `script.js`? | Only via scattered activity rows |
| Did escalation nudge inject? | Must search message log |
| Did model retry S&R after escalation? | Not in turn trace |
| Why `maxToolIterationsHit`? | Trace has boolean, not reason enum |

Without structured data, **138**/**139** improvements cannot be validated across releases.

## Goals

### 1. Extend turn trace `harnessMetrics` (align with **137**)

Add to [`agent-turn-trace-contract.ts`](../../src/shared/agent-turn-trace-contract.ts) `harnessMetrics` (or nested `editToolMetrics`):

```ts
searchReplace?: {
  failuresByPath: Record<string, number>  // capped entries
  totalFailures: number
  escalationIssued: boolean
  escalationAtFailureCount?: number
  blockedAfterEscalationCount?: number  // story 138
  lastFailureReasons?: string[]  // max 4 snippets, e.g. "not_found"
}
maxIterationsReason?: 'search_replace_loop' | 'discovery_stall' | 'post_escalation_stall' | 'generic'
```

Populate in [`agent-runner.ts`](../../src/main/agent-runner.ts) from `searchReplaceFailuresByPath` and nudge flags.

### 2. Activity summary row on force-final / max iterations

When `shouldForceFinalForRepeatedEditFailures` or max iterations hit on iterative Work:

- Emit one **`done`** activity: “Harness: edit tool budget exhausted (N search_replace failures on script.js)” with link to escalation state — coordinate **134** tone (diagnostic, not alarmist).

### 3. Development log line

Single structured log when turn ends:

`editMetrics srFailures=4 escalation=true maxIterReason=search_replace_loop iterativeWorkEdit=true`

Gate on existing dev logging; no secrets.

### 4. Eval + checklist

- `behavior:trace_search_replace_failure_metrics` — fixture with 2 S&R failures → trace JSON includes `totalFailures >= 2` and `escalationIssued`.
- [`docs/harness-eval-checklist.md`](../../docs/harness-eval-checklist.md) — “S&R loop debug” steps using last trace file under `userData`.

## Scope

- [`src/shared/agent-turn-trace-contract.ts`](../../src/shared/agent-turn-trace-contract.ts) + tests
- [`src/main/agent-runner.ts`](../../src/main/agent-runner.ts) — accumulate + persist
- [`src/shared/agent-eval-tags.ts`](../../src/shared/agent-eval-tags.ts)
- [`src/main/agent-runner-evaluation.test.ts`](../../src/main/agent-runner-evaluation.test.ts)
- [`docs/harness-eval-checklist.md`](../../docs/harness-eval-checklist.md)
- Optional merge with **[137](137-iterative-work-edit-harness-observability.md)** in one PR if both backlog — document shared `harnessMetrics` shape in PR notes

## Non-goals

- User-facing “why so many steps” panel.
- Exporting full `old_string` / file bodies in traces (privacy/size).
- Changing failure thresholds (**138**).

## Dependencies

- **Builds on:** **[108](108-harness-eval-suite-per-model-regressions.md)** (traces), **[116](116-agent-edit-search-replace-escalation-nudge.md)**.
- **Best after:** **[138](138-iterative-work-search-replace-escalation.md)** — `blockedAfterEscalationCount` meaningful.
- **Overlaps:** **[137](137-iterative-work-edit-harness-observability.md)** — coordinate schema to avoid duplicate fields.

## Acceptance criteria

- [x] Completed turn with ≥2 S&R failures persists `harnessMetrics.searchReplace.totalFailures` in trace.
- [x] When escalation nudge fires, `escalationIssued: true` in trace.
- [x] When force-final due to S&R loop, `maxIterationsReason` is `search_replace_loop` (or documented enum).
- [x] Eval `behavior:trace_search_replace_failure_metrics` passes.
- [x] Dev log line present when harness debug logging enabled.
- [x] `npm run typecheck` and contract tests pass.

## Related

- **[138](138-iterative-work-search-replace-escalation.md)**
- **[137](137-iterative-work-edit-harness-observability.md)**
- **[116](116-agent-edit-search-replace-escalation-nudge.md)**

## Completion bookkeeping

When shipped: update **Status**, [`README.md`](../README.md) post-MVP table, [`docs/harness-roadmap.md`](../../docs/harness-roadmap.md), run **`npm run stories:html`**.
