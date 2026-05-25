# 116 — Agent edits: search_replace failure escalation nudge

**Status:** Done (2026-05-20).

**Design skill:** N/A (harness enforcement in main/shared); renderer toast copy only.

## Why this story exists

Field report (TaskBoard `docs/overview.md`, 2026-05-20): the model failed **`search_replace`** many times (`old_string was not found`), exhausted the tool budget, **`propose_file_edits`** left no reviewable diff, and the final answer still claimed the file was updated. Story **115** blocked destructive full-file rewrites after repeated failures but did not **guide recovery** or surface honest UX.

## Goals

1. After **≥2** `search_replace` failures on a path in one turn (and no successful edit proposal), inject **one** mid-turn harness user message: stop retrying guessed `old_string`; re-read `rawContent`; use `propose_file_edits` with complete file text for small/localized changes.
2. When edit tools still fail at turn end, strengthen **final answer contract** and **max-iteration hint** so the model must not claim disk writes.
3. Renderer toast heuristic catches **“Updated `*.md`”** without a proposal.
4. Optional: strip read_file line-number prefixes from `old_string` when every line matches the display format and the stripped string matches exactly once.
5. **Stall guard:** After the escalation nudge, at most **2** more tool rounds; or **6** total `search_replace` failures in the turn — then force final answer (avoids long “Grok is thinking…” with only errors).

## Non-goals

- Weakening **115** cascade thresholds.
- Fuzzy or whitespace-normalized `search_replace`.
- Raising global `AGENT_TOOL_MAX_ITERATIONS`.

## Scope

- [`src/shared/agent-final-answer-contract.ts`](../../src/shared/agent-final-answer-contract.ts) — escalation nudge + `editToolsFailed` contract
- [`src/shared/agent-edit-cascade-guard.ts`](../../src/shared/agent-edit-cascade-guard.ts) — `shouldInjectSearchReplaceEscalation` helper
- [`src/main/agent-runner.ts`](../../src/main/agent-runner.ts) — inject nudge; pass failure state to final stream
- [`src/main/agent-runner-evaluation.test.ts`](../../src/main/agent-runner-evaluation.test.ts) — escalation recovery eval
- [`src/renderer/src/lib/assistant-disk-claim-heuristic.ts`](../../src/renderer/src/lib/assistant-disk-claim-heuristic.ts) — toast patterns
- [`src/shared/agent-search-replace.ts`](../../src/shared/agent-search-replace.ts) — optional line-number strip
- [`src/main/agent-search-replace-tool.ts`](../../src/main/agent-search-replace-tool.ts) — apply strip before patch

## Acceptance criteria

- [x] After ≥2 S&R failures on a path, exactly one escalation user message is injected before the next tool sample.
- [x] Eval proves marker appears and a subsequent successful `propose_file_edits` is possible in the same turn.
- [x] Final contract + max-hint forbid false “updated on disk” when `editToolsFailed`.
- [x] Renderer toast covers “Updated `*.md`” without proposal.
- [x] **115** destructive guard unchanged.
- [x] `npm run typecheck`, `npm run test`, `npm run test:agent-eval` pass.

## Related stories

- **[115](115-agent-edit-cascade-guard-after-search-replace-failures.md)**, **[092](092-agent-edit-failure-self-correction.md)**, **[085](085-agent-search-replace-tool.md)**

## Completion bookkeeping

When shipped: update this **Status**, [`README.md`](../README.md) post-MVP table, [`docs/harness-roadmap.md`](../../docs/harness-roadmap.md), run **`npm run stories:html`**.
