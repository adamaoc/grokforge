# 152 — Failed edit final-answer honesty contract

**Status:** Done (2026-05-30).

**Priority:** Critical — prevents turns with rejected edit tools from ending with pasted partial files or implied success.

**Design skill:** N/A (final-answer contract and runner state).

**Depends on:** **[151](151-stop-repeated-same-path-proposal-failures.md)**, **[149](149-improved-recovery-loop-after-rejected-proposals.md)**, **[119](119-agent-turn-ui-honesty-and-activity-compaction.md)**.

## Why this story exists

In the TaskBoard prototype run, every edit proposal failed and `editProposalCreated` stayed `false`, but the assistant still produced a large "complete single-file HTML" block in the final response. The screenshots show the result was not applied and was not reliably complete.

For GrokForge, a failed write path should end honestly. The user should not need to infer from red tool rows that the final answer is only a fallback blob.

## Goal

Strengthen final-answer contracts and runner inputs so a turn with failed edit tools and no accepted proposal cannot present a large generated file as if it solved the request.

## Acceptance criteria

- [x] `buildFinalAnswerContract` receives enough failure context to distinguish "no edit attempted" from "edit attempted and rejected."
- [x] If edit tools failed and no accepted proposal exists, the final answer must plainly say no file was created or changed.
- [x] Large pasted file fallbacks are forbidden for failed file-creation/edit turns unless explicitly labeled as unapplied reference text and kept below a small cap.
- [x] Assistant disk-success claim heuristics catch "complete file" / "created file" phrasing when `editProposalCreated` is false and edit failures occurred.
- [x] Regression coverage proves the TaskBoard-style turn cannot end with an implied applied artifact (151 eval + contract tests; full TaskBoard fixture deferred to **156**).

## Suggested implementation notes

- Build on existing honesty appendices in `agent-final-answer-contract.ts`.
- Include rejected path names in the final contract when available so the model can be specific without guessing.
- Keep the user-facing final answer short: reason, no write occurred, and next suggested retry.

## Completion bookkeeping

When shipped or closed: update **Status**, [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
