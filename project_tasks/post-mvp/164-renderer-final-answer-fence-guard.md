# 164 — Renderer final-answer fence guard (enforce 152 when model disobeys)

**Status:** Done (2026-05-30).

**Priority:** High — contract-only honesty (**152**) still allows large pasted HTML in live TaskBoard runs.

**Design skill:** `@styleguide-design` — collapsed/stripped fallback presentation must match chat tokens and honesty UX from **119** / **155**.

**Depends on:** **[152](152-failed-edit-final-answer-honesty-contract.md)**, **[151](151-stop-repeated-same-path-proposal-failures.md)**, **[119](119-agent-turn-ui-honesty-and-activity-compaction.md)**, **[155](155-compact-visible-edit-failure-ui.md)**.

## Why this story exists

**152** adds `FAILED_EDIT_FINAL_ANSWER_HONESTY_MARKER` and caps to the **system** final-answer contract:

- No full replacement file in final answer.
- Optional unapplied snippet ≤30 lines / 2000 chars.

Live dogfood (TaskBoard, 2026-05-30) still streamed multi-line fenced HTML with copy like “Here’s your complete single-file prototype…” while every `propose_file_edits` failed.

Renderer already toasts via `assistantReplyClaimsEditSuccessDespiteNoProposal` in `assistant-disk-claim-heuristic.ts`, but **does not truncate or replace** the streamed assistant body. Users must infer from red tool rows that the code block was never applied.

## Goal

When a turn ends with **failed edit activities**, **no accepted proposal**, and the assistant reply contains an **oversized fenced code fallback**, the renderer should **enforce** honesty at display time — not rely on the model obeying the contract.

## Agent planning — read before coding

Load **`@styleguide-design`** (`.cursor/skills/styleguide-design/SKILL.md`) before UI work.

Load **`.cursor/rules/agent-harness-engineering.mdc`**.

**Required reading (in order):**

1. [`docs/i-am-a-harness.md`](../../docs/i-am-a-harness.md) — review layer, human trust.
2. [`docs/harness-roadmap.md`](../../docs/harness-roadmap.md) — activity honesty wave (**119**, **152**).
3. [`docs/field-reports/README.md`](../../docs/field-reports/README.md) — dogfood comparison UX expectations.
4. **[152](152-failed-edit-final-answer-honesty-contract.md)** — contract caps and markers.
5. **[155](155-compact-visible-edit-failure-ui.md)** — compact failure presentation patterns.

**Code anchors:**

- `src/renderer/src/lib/assistant-disk-claim-heuristic.ts` — `assistantReplyContainsLargeCodeFallback`, `assistantReplyClaimsCompletedArtifact`, `turnHadFailedEditActivities`.
- `src/shared/agent-activity-display.ts` — `turnHadFailedEditActivities`, compact failure rows.
- `src/renderer/src/components/ChatThread.tsx` — where final assistant messages render; turn completion / `editProposalCreated` state.
- `src/shared/agent-final-answer-contract.ts` — `FAILED_EDIT_FINAL_ANSWER_MAX_REFERENCE_LINES`, `FAILED_EDIT_FINAL_ANSWER_MAX_REFERENCE_CHARS`.
- Tests: `src/renderer/src/lib/assistant-disk-claim-heuristic.test.ts`.

**Research task:** Trace how `ChatThread` knows `editProposalCreated` and activity list at stream end (turn trace vs live activities). Prefer using the same signals **152** toasts already use.

## Narrow acceptance criteria

- [x] Pure function (renderer or shared) e.g. `sanitizeFailedEditFinalAnswer(text, context)` that:
  - Returns text unchanged on happy path (proposal created or no edit failures).
  - When `hadEditFailures && !editProposalCreated`: strips or replaces fenced blocks exceeding **152** caps with honest summary placeholder (e.g. “Code block removed — edit tools did not succeed; nothing was written to disk.”).
  - Preserves small fenced snippets under caps if labeled as unapplied reference (optional v1: strip all fences on failed-create turns for simplicity — document choice).
- [x] `ChatThread` (or markdown renderer wrapper) applies sanitizer to **displayed** assistant content for completed turns matching failure context.
- [x] Existing toast from `assistantReplyClaimsEditSuccessDespiteNoProposal` still fires (don’t duplicate annoyingly — coordinate copy).
- [x] Unit tests mirror **156** bad fallback example (`Here is your complete single-file HTML prototype…` + large fence) → sanitized output.
- [x] No main-process change required for v1 (renderer-only enforcement acceptable).
- [x] `npm run typecheck` + `npm run test` pass.

## Suggested implementation notes

- Prefer **display-time** sanitization over mutating persisted chat thread JSON (honest archive: optional future story to persist sanitized form).
- Match **155** tone: short, factual, link user to “Last agent turn trace” or failure issue card if present.
- Do not strip fences when user explicitly asked for code explanation-only turn with no edit intent (guard with `isLikelyEditIntent` or `editProposalCreated` / failed activity presence).
- Consider `CREATION_INCREMENTAL_RECOVERY_HONESTY_MARKER` turns same as **152** failed-edit path.

## Files / areas that should be touched (tight scope)

- `src/renderer/src/lib/assistant-disk-claim-heuristic.ts` — extend or sibling `assistant-final-answer-sanitize.ts`.
- `src/renderer/src/components/ChatThread.tsx` — apply on render or on turn `done`.
- Tests for sanitizer + one ChatThread integration test if patterns exist.
- Optional shared re-export in `src/shared/` only if main and renderer both need caps (prefer importing constants from `agent-final-answer-contract.ts` via renderer types path).

## What is explicitly out of scope

- Blocking xAI stream mid-flight (post-hoc display only for v1).
- Changing `buildFinalAnswerContract` text (**152** already done).
- Auto-retry turns from UI.
- Plan-mode missing-plan toast (**099**).

## Related

- **[152](152-failed-edit-final-answer-honesty-contract.md)** — contract this story enforces in UI.
- **[163](163-direct-work-taskboard-greenfield-eval.md)** — eval can assert sanitized display if test harness supports renderer unit tests only.

## Completion bookkeeping

When shipped or closed: update **Status**, [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
