# 115 — Agent edits: cascade guard after search_replace failures

**Status:** Done (2026-05-19).

**Design skill:** N/A (harness enforcement in main/shared).

## Why this story exists

Field report (ToDoApp `index.html`, 2026-05-19): the model failed **`search_replace`** five times (`old_string was not found`), then **`propose_file_edits`** with a full-file rewrite that removed ~56% of lines. Safety warnings appeared in the UI, but the harness still created a reviewable proposal. Prompt-only minimal-change guidance (**083**) did not prevent this.

## Goals

1. Track per-path **`search_replace` failures** within a single agent turn.
2. **Reject** `propose_file_edits` / successful-path `search_replace` → `write_file` when:
   - the path has ≥2 failures this turn, and
   - the proposal would **dramatically shrink** the file (>50% lines or chars), unless the user asked for a full rewrite.
3. Enrich **not found** errors with `rawContent` guidance and a short `old_string` preview.

## Scope

- [`src/shared/agent-edit-cascade-guard.ts`](../../src/shared/agent-edit-cascade-guard.ts) — pure guard + tests
- [`src/shared/agent-search-replace.ts`](../../src/shared/agent-search-replace.ts) — not-found message helper
- [`src/main/agent-edit-proposals.ts`](../../src/main/agent-edit-proposals.ts) — guard during validation
- [`src/main/agent-tool-executor.ts`](../../src/main/agent-tool-executor.ts) — failure counting + turn state
- [`src/main/agent-runner.ts`](../../src/main/agent-runner.ts) — pass `userText` + failure map

## Acceptance criteria

- [x] ToDoApp-style fixture: 2+ S&R failures + destructive full write → proposal rejected with cascade reason.
- [x] Full-rewrite user intent bypasses the guard.
- [x] `npm run typecheck` and `npm run test` pass.

## Related stories

- **[083](083-agent-edit-prompting-minimal-change.md)**, **[084](084-agent-edit-pre-apply-safety-warnings.md)**, **[085](085-agent-search-replace-tool.md)**, **[092](092-agent-edit-failure-self-correction.md)**

## Completion bookkeeping

When shipped: update this **Status**, [`README.md`](../README.md) post-MVP table, [`docs/harness-roadmap.md`](../../docs/harness-roadmap.md), run **`npm run stories:html`**.
