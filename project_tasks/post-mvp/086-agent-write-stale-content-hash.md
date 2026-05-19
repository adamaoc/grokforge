# 086 — Agent edits: stale file hash on write

**Status:** Done (2026-05-18).

**Design skill:** N/A (main + optional renderer message).

## Why this story exists

Story **047** compares **review-time** `expectedOriginalContent` when the user applies. Models can still propose writes from a **stale read** earlier in the turn or from a previous message. Requiring a **content hash** (or hash of read result) on `write_file` / `search_replace` closes race windows and forces re-read after external edits.

## Goals

1. `read_file` tool result includes a stable **`contentHash`** (e.g. SHA-256 of normalized UTF-8) for the slice or full file read.
2. `write_file` / `search_replace` / `propose_file_edits` must include **`expectedContentHash`** (or per-op field) matching the hash from the read used to author the edit.
3. On propose/apply: if disk hash ≠ expected → reject with “File changed since read; call `read_file` again.”
4. Align with existing **047** `expectedOriginalContent` at apply time—avoid duplicate conflicting checks; document order of validation.

## Scope

- Main: hash helper in `src/shared/` or `src/main/`, wire through workspace tools and `agent-edit-proposals.ts`.
- Renderer: surface stale conflict in apply toast (may already exist for 047—extend messages).

## Acceptance criteria

- [x] Hash computed on read; required on write proposals for existing files.
- [x] Mismatch blocks proposal or apply with clear error.
- [x] Unit tests: unchanged file passes; modified file fails until re-read.
- [x] `npm run typecheck` passes.

## Implementation notes

- `read_file` JSON includes `contentHash` + `contentHashScope: full_file` (hash is always the full on-disk file, not the line slice).
- Turn registry stores path → hash; propose validation accepts `expectedContentHash` on the op or falls back to the same-turn read registry.
- Apply order in `agent-tools.ts`: **086** `expectedContentHash` first, then **047** `expectedOriginalContent`.
- Renderer `reviewPendingBatch` sets `expectedContentHash` via `compute-agent-content-hash` IPC at review open.

## Related stories

- **[047](../047-diff-apply-discard-and-conflict-safety.md)**.
- **[082](082-agent-edit-require-read-before-write.md)**.

## Completion bookkeeping

Marked **086** done; [`README.md`](../README.md) post-MVP table updated; **`npm run stories:html`** run.
