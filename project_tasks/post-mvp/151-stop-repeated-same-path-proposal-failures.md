# 151 — Stop repeated same-path proposal failures

**Status:** Done (2026-05-30).

**Priority:** Critical — prevents failed prototype/file-creation turns from burning all tool rounds and then degrading into misleading fallback output.

**Design skill:** N/A (main-process runner loop control).

**Depends on:** **[149](149-improved-recovery-loop-after-rejected-proposals.md)**, **[147](147-stronger-anti-crush-and-formatting-enforcement.md)**, **[140](140-search-replace-failure-loop-observability.md)**.

## Why this story exists

The TaskBoard prototype run repeatedly attempted `propose_file_edits` for the same new path after validation rejected the payload as malformed or crushed. The harness issued a recovery nudge, but the model kept retrying the same failure shape until `maxToolIterationsHit`.

When a turn has no accepted proposal, continuing the same-path loop wastes latency, pollutes the visible activity stream, and increases the chance that the final answer will drift into an un-applied or partial pasted artifact.

## Goal

Track rejected edit proposals by path and failure class during a turn. After a small threshold, stop normal retry sampling for that path and force either a constrained recovery path or an honest final failure.

## Acceptance criteria

- [x] `agent-runner` tracks same-path proposal rejections, including malformed schema failures when the intended path can be recovered from the tool payload.
- [x] After 2-3 rejected proposal attempts for the same path with no accepted proposal, the turn stops normal retry loops for that path.
- [x] The forced path cannot produce a success-style final answer; it must say no file was created or changed unless an `ok: true` edit proposal was received.
- [x] Trace metadata records the forced stop reason so future dogfood runs are easy to diagnose.
- [x] Existing successful proposal flows are unchanged.

## Suggested implementation notes

- Prefer reusing existing failure counters where possible instead of adding a separate parallel state machine.
- Treat new-file prototype requests as high-risk for this guard because there is no existing disk file to salvage.
- Keep the threshold configurable as a local constant in the runner or shared policy module.

## Completion bookkeeping

When shipped or closed: update **Status**, [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
