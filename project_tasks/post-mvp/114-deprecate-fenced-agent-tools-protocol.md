# 114 — Deprecate fenced `grokforge-agent-tools` write protocol

**Status:** Post-MVP backlog.

**Design skill:** N/A (renderer may remove parser UI).

**Depends on:** **[108](108-harness-eval-suite-per-model-regressions.md)** (prove tool path covers former fence cases).

## Why this story exists

**060** made `propose_file_edits` primary but kept **fenced JSON** at end of assistant messages for compatibility. Two write paths duplicate validation (**082**, **086**, **100**) and confuse the harness.

## Goals

### 1. Telemetry / detection (v1)

- Log when fence parser activates (dev counter).
- If zero usage in manual testing for N weeks, proceed to removal.

### 2. Removal (v2 in same story or follow-up PR)

- Remove fence parsing from `ChatThread` / main proposal path.
- Remove fence instructions from harness profiles (**103**) and `buildFinalAnswerContract` fast mode.
- Keep migration note in `AGENTS.md` for one release.

### 3. Tests

- Delete fence-specific tests; ensure `propose_file_edits` tests cover write flows.

## Non-goals

- Removing user-authored fences in old persisted threads (ignore gracefully).

## Acceptance criteria

- [ ] Documented deprecation notice in changelog/docs.
- [ ] No new turns can apply writes via fence (after removal phase).
- [ ] `npm run test` pass without fence fixtures.

## Related stories

- **[060](../060-agent-first-class-edit-proposals.md)**, **[103](103-agent-harness-per-model-profiles.md)**.

## Completion bookkeeping

When implemented: mark **114** done, update [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
