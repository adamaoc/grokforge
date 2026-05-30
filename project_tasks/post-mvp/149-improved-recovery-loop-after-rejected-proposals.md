# 149 — Improved recovery loop after rejected proposals (clearer, directed feedback + loop prevention)

**Status:** Done (2026-05-30).

**Priority:** High — closes the loop on the most painful recent failure mode (TaskBoard + similar crushed proposal sessions where the model entered repeated rejection + weak recovery cycles).

**Design skill:** N/A (harness recovery messaging and runner loop control); `@styleguide-design` only for any new model-facing rejection copy.

**Depends on:** **[124](124-greenfield-executor-code-quality-and-proposal-recovery.md)**, **[134](134-harness-conflict-recovery-activity-honesty.md)**, **[092](092-agent-edit-failure-self-correction.md)**, **[116](116-agent-edit-search-replace-escalation-nudge.md)**, **[138](138-iterative-work-search-replace-escalation.md)**, **[140](140-search-replace-failure-loop-observability.md)**.

## Why this story exists

When a `propose_file_edits` (or `search_replace`) is rejected — crushed, too destructive (shrink guard), validation failure, partial batch, etc. — the feedback the model receives is often too generic or too weak. 

Recent TaskBoard-style runs showed:
- Model receives "Edit proposal failed: crushed" or a shrink-stub reason.
- It then either retries almost the identical bad payload, or escalates to an even larger full-file rewrite that also fails.
- Or it gives up and claims success in the final answer even though the proposal was never accepted.
- The turn either loops on the same file or ends in a degraded state (user sees partial or broken results).

Existing mechanisms (escalation nudges after 2 failures, partial-batch honesty, creation recovery, `buildSearchReplaceEscalationNudge`, `buildHarnessEditRecoveryBrief`) exist but are not consistent enough, not specific enough about *what the model should do on the very next attempt*, and do not always prevent the model from claiming disk success when no valid proposal was produced.

## Goals

1. Make every rejection carry a tight, actionable, "what to do on the next tool round" instruction (e.g. "Re-read the exact section with startLine/maxLines from `rawContent`. Then produce **one** clean, properly formatted full replacement for *only* the rejected path using the `edit` tool or a minimal `propose_file_edits` — do not rewrite unrelated code.").
2. Add or strengthen per-turn guards so the same file cannot be the source of >2–3 rejections without forcing a final answer or a very narrow recovery path.
3. Ensure final-answer contracts and runner logic forbid the model from claiming "the file was updated" or "the plan step is complete" when the last proposal for that path was rejected.
4. Make the recovery path for the two most common cases (crushed formatting + destructive shrink) extremely directive and consistent.

## Narrow acceptance criteria

- [x] Every rejection path (crushed, shrink, corrupt, partial batch, validation) produces a recovery message that tells the model (a) why it was rejected, (b) the single recommended next action (re-read + targeted `edit` vs clean minimal full replacement), and (c) "do not claim success until you receive an `ok: true` tool result".
- [x] A per-file rejection counter (or reuse/enhance of existing failure counts) in the turn state limits repeated attempts on the same rejected path within one turn; after the limit the runner injects a strong final guidance or forces final answer.
- [x] Final-answer contract sections (edit-intent, post-plan, Work iterative, greenfield execute) contain explicit "if your last proposal on path X was rejected, you may not claim the change succeeded" language.
- [x] In a repro scenario (intentionally bad proposal → rejection → recovery), the model receives directed guidance and either produces a clean follow-up or honestly reports the remaining work instead of claiming victory.
- [x] No change to successful happy-path proposals.
- [x] Relevant tests (runner evaluation, final-answer contract tests, proposal tests) updated; `npm run typecheck` + `npm run test` pass.

## Files / areas that should be touched (tight scope)

- `src/shared/agent-final-answer-contract.ts` — `buildSearchReplaceEscalationNudge`, `buildHarnessEditRecoveryBrief`, `buildCreationIncrementalRecoveryNudge`, `buildPartialBatchProposalNudge`, `buildCrushedJavaScriptProposalNudge`, and the various appendix builders.
- `src/main/agent-runner.ts` — the places that decide to inject recovery nudges and the logic that prevents "success" claims after rejection (around edit proposal handling and final answer construction).
- `src/shared/agent-edit-failure-context.ts` and/or `src/shared/agent-regenerate-proposal.ts` — failure context and regenerate guidance.
- `src/main/agent-tool-executor.ts` — if richer rejection payloads need to be shaped for the model.
- Test files: `src/shared/agent-final-answer-contract.test.ts`, `src/main/agent-runner-evaluation.test.ts` (use or extend existing failure tags).

## What is explicitly out of scope

- Redesign of the entire edit proposal / merge / accumulation system (keep the existing batch + merge behavior).
- New UI surfaces for the human (this is about model-facing recovery messaging and loop control).
- Changes to the underlying validation rules themselves (**146** and **147** cover pre-validation and anti-crush).
- Incremental editing routing strategy (**148**).
- Adding new tool calls or major changes to how proposals are stored.

## Related

- **[124](124-greenfield-executor-code-quality-and-proposal-recovery.md)**, **[134](134-harness-conflict-recovery-activity-honesty.md)**, **[092](092-agent-edit-failure-self-correction.md)** — the recovery ancestors this makes more reliable.
- **[115](115-agent-edit-cascade-guard-after-search-replace-failures.md)** + **[116](116-agent-edit-search-replace-escalation-nudge.md)**, **[138](138-iterative-work-search-replace-escalation.md)**, **[140](140-search-replace-failure-loop-observability.md)** — failure counting and escalation siblings.
- **[144](144-consolidate-incremental-work-edit-policy.md)** — the policy that this recovery guidance must stay consistent with.

## Completion bookkeeping

When shipped or closed: update **Status**, [`README.md`](../README.md) post-MVP table (add 149), run **`npm run stories:html`**. Consider a one-line addition to [`docs/harness-eval-checklist.md`](../../docs/harness-eval-checklist.md) § proposal recovery if the manual repro steps change.