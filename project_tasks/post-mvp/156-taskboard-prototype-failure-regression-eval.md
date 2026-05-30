# 156 — TaskBoard prototype failure regression eval

**Status:** Done (2026-05-30).

**Priority:** Medium — locks the observed dogfood failure into the harness eval suite so it does not regress.

**Design skill:** N/A (evaluation fixtures and trace assertions).

**Depends on:** **[151](151-stop-repeated-same-path-proposal-failures.md)**, **[152](152-failed-edit-final-answer-honesty-contract.md)**, **[153](153-enforce-creation-incremental-recovery.md)**.

## Why this story exists

The TaskBoard run is a crisp repro: empty workspace, request a single-file HTML prototype, repeated malformed/crushed proposals, `creation_incremental_recovery` fires, no accepted edit proposal, final answer pastes an incomplete-looking file.

This should become a deterministic regression so future prompt, validation, or runner changes preserve the intended failure behavior.

## Goal

Add a focused eval that simulates repeated failed prototype creation and asserts the harness ends in one of two acceptable states: an accepted proposal, or an honest no-write failure. It must never end with a claimed completed file when no proposal was accepted.

## Acceptance criteria

- [x] Add an `agent-runner-evaluation` scenario based on the TaskBoard single-file HTML prompt.
- [x] The fixture simulates at least one malformed create proposal and repeated crushed-content proposal failures.
- [x] Assertions cover `editProposalCreated`, forced stop/recovery metadata, final-answer constraints, and absence of success claims.
- [x] The test verifies no giant pasted fallback is streamed after failed write attempts.
- [x] The eval tag/name makes this easy to find from future dogfood trace reports.

## Suggested implementation notes

- Use `createRecordingTransport` so the failure sequence is deterministic.
- Prefer asserting final-answer contract inputs and trace metadata over brittle exact prose.
- Include the original prompt text in the fixture comments for traceability.

## Completion bookkeeping

When shipped or closed: update **Status**, [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
