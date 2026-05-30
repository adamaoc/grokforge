# 146 — Pre-validation for edit proposals (lightweight syntax/format guard before diff review)

**Status:** **Done**.

**Priority:** High — early rejection of obviously bad proposals reduces user-visible garbage diffs and follow-up turns (directly addresses recent TaskBoard-style full-file failures).

**Design skill:** N/A (harness validation + runner path); `@styleguide-design` only if new rejection toast / error copy changes in renderer.

**Depends on:** **[060](060-agent-first-class-edit-proposals.md)** (propose_file_edits foundation), **[100](100-proposal-quality-auto-normalize.md)** (existing normalize), **[115](115-agent-edit-cascade-guard-after-search-replace-failures.md)** + **[124](124-greenfield-executor-code-quality-and-proposal-recovery.md)** (corrupt-content + proposal quality).

## Why this story exists

In recent dogfood (e.g. the TaskBoard App.tsx case and similar greenfield / post-plan execute runs), the model produced catastrophically crushed/minified `propose_file_edits` write_file payloads (one-line glued JS, orphan `)`, broken formatting, obviously invalid syntax). These passed the initial tool call, reached the diff review UI, and were shown to the user — forcing manual rejection + follow-up prompts.

Existing guards (`validateAgentEditProposal`, `isUnacceptableCrushedMarkdownProposal`, `assessProposalWriteContent` in `agent-edit-corrupt-content.ts`, shrink guard, post-normalize repair) catch many cases **after** the proposal object is built and sometimes after expensive work. There is no fast, cheap pre-filter right at proposal creation time that can reject obviously broken content **before** it is turned into a reviewable diff artifact and surfaced.

**Observed pain:**
- Bad proposal reaches the user in the diff pane.
- Model is not given a tight, immediate "this exact payload is invalid for reason X, re-read rawContent and produce clean multi-line" signal.
- Wasted context + user time.

The goal of this story is a narrow, fast pre-validation gate on the `propose_file_edits` path only.

## Goals

1. Introduce a lightweight, synchronous or near-synchronous validation step that runs on every `propose_file_edits` payload **before** it is turned into a persisted proposal / diff review.
2. Reject (with a clear, model-actionable error) when the proposed content exhibits obvious crushed formatting, glued statements, or basic syntax red flags for JS/TS/TSX/HTML (using existing heuristics + minimal new fast checks — no full parser yet).
3. Surface the rejection back to the model in the same turn (via tool result or immediate recovery nudge) so it can correct on the next attempt without the bad diff ever reaching the user.
4. Keep the check extremely cheap (regex + line heuristics + existing normalize passes) and only on the write_file op content.

## Narrow acceptance criteria

- [ ] A new or extended fast path (e.g. `preValidateWriteFileContent` or call inside `validateAgentEditProposal` before proposal creation) runs for every `write_file` operation in a `propose_file_edits` batch.
- [ ] Obvious crushed / one-line / glued / orphan-paren / obviously malformed JS/TSX/HTML in a proposed `content` field causes immediate rejection with a precise reason (e.g. "Crushed JS detected: 1 line, 47 statements glued — re-read rawContent and emit clean multi-line source with one statement per line").
- [ ] Rejected proposals never produce a diff review card for the user (the bad payload is dropped at the harness layer).
- [ ] The model receives the rejection + guidance in the tool result / recovery context within the same turn.
- [ ] No new heavy dependencies (no full TS compiler, no shadow FS, no LSP). Simple string + regex + reuse of `needsSourceLayoutRepair` / `hasGluedJavaScriptStatements` style checks only.
- [ ] Existing good proposals (clean multi-line, properly formatted) are unaffected (zero false positives on real clean code).
- [ ] `npm run typecheck` + relevant unit tests (`agent-edit-proposals.test.ts`, `agent-proposal-quality.test.ts`) pass; new fast-path covered by at least one unit test.

## Files / areas that should be touched (tight scope)

- `src/main/agent-edit-proposals.ts` — primary call site: insert the pre-validation right after parsing the batch but before `validateAgentEditProposal` / proposal object creation and event emission.
- `src/shared/agent-proposal-quality.ts` or `src/shared/agent-edit-corrupt-content.ts` — extend or add the narrow fast pre-check functions (keep new logic tiny).
- `src/shared/agent-file-content-normalize.ts` — reuse / extend existing layout repair detection if it helps the pre-filter (no new heavy reflow).
- `src/main/agent-tool-executor.ts` (or the edit path) — ensure rejection surfaces cleanly as a tool result error with guidance for the model.
- Test files: `src/main/agent-edit-proposals.test.ts` and/or `src/shared/agent-proposal-quality.test.ts` (add 1–2 fast synthetic cases for crushed JS/HTML payloads).

## What is explicitly out of scope

- Any full TypeScript / JS parsing, AST validation, or type checking (no acorn, typescript API, etc. in this story).
- Shadow workspace, on-disk temp copies, or running the code (that would be a later "real pre-apply eval" story).
- Changes to `search_replace` / new `edit` tool paths (this story is strictly `propose_file_edits` write_file only).
- UI changes to how rejections are shown to the *human* (beyond ensuring the bad diff never appears).
- Broad refactoring of the proposal pipeline or new event types.
- Plan-mode or greenfield-specific logic (keep it general to the proposal creation path).
- Performance measurements or caching beyond the absolute minimum.

## Related

- **[124](124-greenfield-executor-code-quality-and-proposal-recovery.md)** — previous proposal recovery and corrupt-content work (this is the "catch even earlier" follow-up).
- **[100](100-proposal-quality-auto-normalize.md)** — normalize/repair foundation.
- **[115](115-agent-edit-cascade-guard-after-search-replace-failures.md)**, **[133](133-greenfield-execute-quality-regression-guard.md)** — related quality gates.
- **[060](060-agent-first-class-edit-proposals.md)** — the proposal creation path this guards.

## Completion bookkeeping

When shipped or closed: update **Status**, [`README.md`](../README.md) post-MVP table (add 146), run **`npm run stories:html`**. Add a one-line note to [`docs/harness-eval-checklist.md`](../../docs/harness-eval-checklist.md) if manual verification steps change.