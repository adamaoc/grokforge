# 134 — Harness conflict recovery activity honesty

**Status:** Done (2026-05-26).

**Priority:** **Fourth** among **131–134** — complements **131** (fewer false conflicts) by making **remaining** harness interventions understandable when recovery succeeds. Dogfood noted **internal conflict markers** during plan execution that feel alarming even when the turn completes successfully (proposal merged, files valid).

**Design skill:** Read [`.cursor/skills/styleguide-design/SKILL.md`](../../.cursor/skills/styleguide-design/SKILL.md) for activity row titles, subtitles, and toast tone (`@styleguide-design`).

## Why this story exists

**119** improved merged-proposal and retrieval honesty; **128** added scaffold-strategy nudges with activity title **`Harness: scaffold strategy conflict`**. Other mid-turn interventions use similar patterns:

| Marker / activity | When it fires | User perception when recovery works |
|-----------------|---------------|-------------------------------------|
| `Harness: scaffold strategy conflict` | **128** hybrid / edits-before-cli | “Something broke” though next sample may comply |
| `Harness: search_replace escalation` (**116**) | Repeated S&R failures | Long “thinking” then success — unclear that harness helped |
| `SCAFFOLD_STRATEGY_HONESTY_MARKER` in final answer | After conflict nudge | Assistant may **apologize for conflict** even when proposal is fine |
| `POST_SCAFFOLD_VERIFICATION_HONESTY_MARKER` | CLI succeeded, reads incomplete | May overstate risk if user only needed static files |

Goal: **distinguish intervention vs failure** — show what the harness did, collapse or soften copy when the turn **recovers**, and avoid final-answer guilt when `edit_proposal` succeeded after a nudge.

## Goals

### 1. Activity row semantics (renderer + shared display)

- Introduce shared helpers in [`agent-activity-display.ts`](../../src/shared/agent-activity-display.ts) (or extend existing) for harness intervention rows:
  - **Kind:** `correction` | `blocked` | `info`
  - **Title:** outcome-oriented (e.g. “Scaffold routing: CLI first” vs “Scaffold strategy conflict”)
  - **Subtitle:** one line — what happens next (“Model will re-sample tools”)
- When a nudge is followed by a **compliant** tool sample in the same turn, update the earlier activity row to **`done`** with subtitle **“Corrected on retry”** (or roll up per **119** compaction rules).

### 2. Final-answer contract: recovery-aware honesty

In [`agent-final-answer-contract.ts`](../../src/shared/agent-final-answer-contract.ts):

- **`scaffoldStrategyHonestyAppendix`**: if `scaffoldStrategyConflictIssued` but `editProposalCreated` and command not failed, use **short** appendix (“Harness redirected tool order; review the proposal below”) — not “CLI scaffold is not complete” when static file-bootstrap succeeded without CLI.
- **`scaffoldStrategyConflictIssued` + successful recovery**: omit alarmist language; do not require the model to mention “conflict” to the user.
- Align **116** escalation marker behavior: if escalation nudge fired then `propose_file_edits` succeeded, final answer should not claim S&R is the only path.

### 3. Runner state for recovery

In [`agent-runner.ts`](../../src/main/agent-runner.ts), track per turn:

- `scaffoldStrategyNudgeIssued` + **subsequent sample complied** → `scaffoldStrategyRecovered = true`
- Pass recovery flags into `buildFinalAnswerContract` and activity `emitActivity` updates.

### 4. Tests

- Unit: display helper maps **128** nudge → `correction` kind.
- Eval: hybrid nudge → second sample CLI-only → final system contract does **not** include “Do not claim scaffold ready” when CLI mock succeeded and proposal exists (fixture in **128** suite, extended).

## Scope

- [`src/shared/agent-activity-display.ts`](../../src/shared/agent-activity-display.ts)
- [`src/shared/agent-final-answer-contract.ts`](../../src/shared/agent-final-answer-contract.ts) + tests
- [`src/main/agent-runner.ts`](../../src/main/agent-runner.ts) — recovery flags, activity updates
- [`src/renderer/src/components/AgentTurnToolActivityList.tsx`](../../src/renderer/src/components/AgentTurnToolActivityList.tsx) — render kind/subtitle if not already generic
- [`src/main/agent-runner-evaluation.test.ts`](../../src/main/agent-runner-evaluation.test.ts) — recovery contract tag
- Optional: [`src/renderer/src/lib/plan-execute-outcome.ts`](../../src/renderer/src/lib/plan-execute-outcome.ts) — align pending CLI + recovered messaging (**123**)

## Non-goals

- Removing mid-turn nudges entirely.
- Changing when nudges fire (**131** owns false positives).
- Full activity timeline redesign (**125**).
- New IPC events.

## Risks

| Risk | Mitigation |
|------|------------|
| **Hiding real failures** | Keep strong honesty when `commandToolsFailed` or no `edit_proposal` |
| **Over-updating activities** | Only patch rows in the active turn buffer |
| **Regression on hybrid eval** | **128** `behavior:scaffold_hybrid_nudge` still expects nudge; assert recovered final copy only in recovery fixture |

## Dependencies

- **Builds on:** **[119](119-agent-turn-ui-honesty-and-activity-compaction.md)**, **[128](128-greenfield-scaffold-strategy-routing.md)**, **[116](116-agent-edit-search-replace-escalation-nudge.md)**, **[123](123-plan-execute-review-follow-ups.md)**.
- **Best after:** **[131](131-greenfield-scaffold-conflict-warning-hygiene.md)** — fewer spurious conflicts means recovery copy is tested on real interventions only.

## Suggested eval / manual tags

| Tag | Intent |
|-----|--------|
| `behavior:scaffold_conflict_recovered_final_contract` | Nudge → compliant resample → final contract soft honesty |
| `behavior:scaffold_conflict_unrecovered_honesty` | Nudge → still hybrid → strong honesty remains |

## Acceptance criteria

- [x] Activity: after scaffold strategy nudge + compliant retry, user sees **correction** framing (title/subtitle), not only “conflict”.
- [x] Eval: recovery fixture — `SCAFFOLD_STRATEGY_HONESTY_MARKER` appendix does not tell user scaffold is incomplete when `edit_proposal` exists and strategy was `file_bootstrap`.
- [x] Eval: unrecovered hybrid — strong honesty appendix still present (**128** regression).
- [x] Manual: greenfield execute with one harness correction → assistant final message does not prominently apologize for “conflict” when diff review is ready.
- [x] `npm run typecheck` and targeted tests pass.

## Related

- **[119](119-agent-turn-ui-honesty-and-activity-compaction.md)**
- **[128](128-greenfield-scaffold-strategy-routing.md)**
- **[131](131-greenfield-scaffold-conflict-warning-hygiene.md)**
- **[125](125-agent-turn-activity-clarity-and-chat-vertical-space.md)**

## Completion bookkeeping

When shipped: update **Status**, [`README.md`](../README.md) post-MVP table, [`docs/harness-roadmap.md`](../../docs/harness-roadmap.md), run **`npm run stories:html`**.
