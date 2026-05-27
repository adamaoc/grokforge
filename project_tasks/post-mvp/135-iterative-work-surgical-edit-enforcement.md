# 135 — Iterative Work surgical edit enforcement (low-round, one proposal)

**Status:** Done (2026-05-26).

**Priority:** **First** among **135–137** — dogfood (2026-05-26, same Todo app, **Work mode**, “add localStorage persistence”) succeeded but felt **fragmented**: many tool rounds, collapsed activity steps, repeated **`search_replace`** across rounds, and a **read → edit → read** loop. Story **130** added routing + prompt copy (`WORK_ITERATIVE_EDIT_MARKER`, ≤2 read-only rounds, one proposal per turn) but **did not strongly constrain** runtime behavior — the model still thrashed until an `edit_proposal` appeared.

**Design skill:** N/A (harness); read [`.cursor/skills/styleguide-design/SKILL.md`](../../.cursor/skills/styleguide-design/SKILL.md) if activity titles change for edit-thrash nudges.

## Why this story exists

| Observed (Work mode, incremental feature) | **130** intent vs reality |
|-------------------------------------------|---------------------------|
| High tool-round count with multiple collapsed “Work tool round” steps | Executor **`maxToolRounds: 6`** unchanged for `iterativeWorkEdit` |
| Several incremental `search_replace` calls over multiple rounds | Prompt says prefer localized S&R or one proposal — **no mid-turn guard** when S&R repeats without merging |
| Read → edit → read on same path (indecisive) | `read_file` required before edit (**082**) but no “stop re-reading, commit proposal” nudge |
| “One proposal per turn” not felt by user | **`mergeAgentEditProposals`** composes in main, yet model keeps sampling tools after partial success |
| Discovery saturation at **2** read-only rounds fired weakly or late | Nudge is one-shot; model can return to read-only after first edit failure |

Routing into iterative Work (**129** / **130**) works; this story makes the harness **enforce** low-round, surgical editing — not only suggest it in static prompt text.

## Goals

### 1. Tighter turn budget for iterative Work

- When `iterativeWorkEdit === true`, cap tool iterations below default executor **6** (e.g. **4** via `resolveMaxToolIterationsForTurn` or profile override) — document tradeoff in PR (complex multi-file asks may need follow-up turn).
- After **`edit_proposal`** is emitted and at least one op accepted (or pending review), **stop further tool_sample rounds** on iterative Work turns unless a partial-batch rejection nudge is still required (**124**). Force final answer stream (mirror post-escalation cap pattern from **116**).

### 2. Mid-turn anti-thrash nudges (runner)

Add shared builders in [`agent-final-answer-contract.ts`](../../src/shared/agent-final-answer-contract.ts) (or new [`iterative-work-edit-guards.ts`](../../src/shared/iterative-work-edit-guards.ts)):

| Trigger | Nudge intent |
|---------|----------------|
| **≥2** `search_replace` on the **same path** this turn without `propose_file_edits` | Combine into one larger `old_string` or one `propose_file_edits` with full `rawContent` |
| **`read_file`** on path **P** after **`search_replace`** / edit on **P** in same turn (re-read loop) | Stop re-reading; finalize proposal or one corrective patch |
| **≥3** tool rounds with edits but **no** `edit_proposal` yet | “One proposal per turn” — use `propose_file_edits` now |
| Second **read-only-only** round **after** first edit tool attempt | Discovery saturation variant: “you already read; edit now” |

Each nudge: **once per kind per turn**, stable marker for eval (e.g. `ITERATIVE_EDIT_THRASH_NUDGE_MARKER`), brief activity title (coordinate **134** tone — “Harness: consolidate edits” not “conflict”).

### 3. Stronger harness copy (130 v2)

Extend [`WORK_ITERATIVE_EDIT_SECTIONS`](../../src/shared/agent-harness-profile.ts) in [`iterative-work-edit.ts`](../../src/shared/iterative-work-edit.ts):

- **localStorage / persistence / single-concern** features: prefer **one** `propose_file_edits` on `script.js` (or active file) after one `read_file` — not chained S&R across rounds.
- Explicit: **do not** call `read_file` again on a path you already edited this turn unless `search_replace` failed.
- Cross-link **116** escalation: after **2** S&R failures, full-file proposal is mandatory.

Bump marker comment to **harness 135** while keeping `WORK_ITERATIVE_EDIT_MARKER` stable for eval or add `WORK_SURGICAL_EDIT_MARKER` sub-line.

### 4. Eval fixtures

- Tag `behavior:iterative_work_localstorage_low_rounds`: vanilla Todo tree + “add localStorage” → recording transport asserts ≤**4** tool_sample rounds and exactly **one** `edit_proposal` event (or merged proposal once).
- Tag `behavior:iterative_work_sr_consolidation_nudge`: mock 2× S&R same path → one thrash nudge injected.
- Regression: `routing:iterative_work_no_replan` (**130**) still passes.

## Scope

- [`src/shared/iterative-work-edit.ts`](../../src/shared/iterative-work-edit.ts) — optional scope classifier hooks (or defer detail to **136**)
- [`src/shared/agent-harness-profile.ts`](../../src/shared/agent-harness-profile.ts) — strengthened sections
- [`src/shared/agent-final-answer-contract.ts`](../../src/shared/agent-final-answer-contract.ts) — new nudges + slim final contract when proposal exists
- [`src/main/agent-runner.ts`](../../src/main/agent-runner.ts) — per-turn counters (reads/edits per path), early exit after proposal, nudge injection, max iterations
- [`src/shared/agent-profile.ts`](../../src/shared/agent-profile.ts) — optional `maxToolRounds` when iterative (if not handled only in runner)
- [`src/main/agent-runner-evaluation.test.ts`](../../src/main/agent-runner-evaluation.test.ts)
- [`src/shared/iterative-work-edit.test.ts`](../../src/shared/iterative-work-edit.test.ts)

## Non-goals

- Replacing **`search_replace`** with always full-file rewrite (localized patches remain valid).
- Greenfield Plan → Execute (**131–134**).
- Changing **120** post-plan incremental routing.
- Renderer activity compaction redesign (**119** / **125**) — only titles for new nudge rows.

## Risks

| Risk | Mitigation |
|------|------------|
| **Legitimate multi-file features need >4 rounds** | Cap applies only `iterativeWorkEdit`; user can send follow-up turn; eval uses single-file localStorage |
| **Early stop before partial-batch retry** | Exception when `turnProposalAccum.rejected.length > 0` and retry nudge not yet issued |
| **Over-nudging** | One nudge per kind; prefer strongest single nudge when multiple triggers fire |

## Dependencies

- **Builds on:** **[130](130-work-iterative-edit-harness.md)**, **[129](129-iterative-work-stability-populated-workspaces.md)**, **[116](116-agent-edit-search-replace-escalation-nudge.md)**, **[124](124-greenfield-executor-code-quality-and-proposal-recovery.md)**, **[069](../069-plan-approve-auto-agent-turn.md)** (proposal merge).
- **Complements:** **[136](136-iterative-edit-scope-and-combine-heuristics.md)** (when to prefer single proposal).
- **Informs:** **[137](137-iterative-work-edit-harness-observability.md)** (metrics for thrash).

## Suggested eval / manual tags

| Tag | Intent |
|-----|--------|
| `behavior:iterative_work_localstorage_low_rounds` | localStorage ask → bounded rounds + one proposal |
| `behavior:iterative_work_sr_consolidation_nudge` | 2× S&R same path → consolidation nudge |
| `behavior:iterative_work_stop_after_proposal` | Proposal emitted → no further tool_sample |
| `routing:iterative_work_no_replan` | *(regression)* **130** |

## Acceptance criteria

### Enforcement

- [ ] Eval: iterative Work + “add localStorage” (static Todo fixture) → **≤4** tool_sample rounds and **one** `edit_proposal` phase (merged ops count as one).
- [ ] Eval: after mock `edit_proposal` success on iterative turn → **no** additional tool_sample in same turn (unless partial-batch rejection path).
- [ ] Eval: 2× `search_replace` same path → exactly one consolidation nudge with agreed marker.

### Prompt / routing regression

- [ ] Eval: non-greenfield edit message → still **executor** + iterative marker (**130**).
- [ ] Eval: post-plan “add button” → **no** iterative thrash nudges (**120**).

### Manual

- [ ] Work mode on Todo app: localStorage feature → user sees **fewer** collapsed tool rounds than pre-135 dogfood; one combined diff review.
- [ ] `npm run test:agent-eval` and `npm run typecheck` clean.

## Related

- **[130](130-work-iterative-edit-harness.md)** — routing + appendix (shipped)
- **[129](129-iterative-work-stability-populated-workspaces.md)** — populated workspace stability
- **[120](120-post-plan-executor-routing-and-single-file-edits.md)**
- **[116](116-agent-edit-search-replace-escalation-nudge.md)**
- Field report: Todo app Work-mode localStorage run (2026-05-26)

## Completion bookkeeping

When shipped: update **Status**, [`README.md`](../README.md) post-MVP table, [`docs/harness-roadmap.md`](../../docs/harness-roadmap.md), run **`npm run stories:html`**.
