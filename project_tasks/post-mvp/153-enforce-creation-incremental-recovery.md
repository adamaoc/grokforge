# 153 — Enforce creation incremental recovery

**Status:** Done (2026-05-30).

**Priority:** High — turns the existing creation recovery nudge into an enforceable path instead of advice the model can ignore.

**Design skill:** N/A (edit proposal validation and runner recovery policy).

**Depends on:** **[151](151-stop-repeated-same-path-proposal-failures.md)**, **[124](124-greenfield-executor-code-quality-and-proposal-recovery.md)**, **[149](149-improved-recovery-loop-after-rejected-proposals.md)**.

## Why this story exists

GrokForge already emits `creation_incremental_recovery` after repeated integrity rejections on a new path. In the TaskBoard prototype run, that nudge fired, but the next attempts were still large full-file proposals that failed the same crushed-content validation.

Recovery should change the allowed shape of the next edit attempt.

## Goal

After creation incremental recovery fires for a path, reject or block another large full-file bootstrap attempt unless it is a small, clean scaffold. The model should either create a minimal viable file first, then extend incrementally, or end honestly.

## Acceptance criteria

- [x] Recovery state is tracked per creation path after `buildCreationIncrementalRecoveryNudge` is issued.
- [x] Post-recovery full-file creation proposals above a conservative size threshold are rejected with a specific "minimal scaffold required" reason.
- [x] A small, well-formatted scaffold proposal remains allowed.
- [x] Once a scaffold proposal is accepted, subsequent incremental extension can proceed through normal edit paths.
- [x] The final-answer contract includes the recovery requirement if the model reaches final stream without complying.

## Suggested implementation notes

- Keep the first version simple: line/character thresholds plus same-path state are enough.
- Do not weaken anti-crush validation to make recovery pass.
- Coordinate with story **151** so forced stop and enforced recovery do not fight each other.

## Completion bookkeeping

When shipped or closed: update **Status**, [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
