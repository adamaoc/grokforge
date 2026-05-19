# 096 — Applied edit history and per-file revert

**Status:** Done (2026-05-18).

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` if adding history UI (`@styleguide-design`).

## Why this story exists

**047** / **`agent-undo-last-batch`** restore the **last** successful agent batch only. Users want **lightweight history**: see recent applied proposals and revert a specific file or batch without digging in git.

## Goals

1. Persist a bounded log of applied batches (timestamp, paths, optional proposal summary)—app storage only.
2. UI: “Recent agent writes” in Settings or sidebar with **Revert** per batch (reuse undo snapshot chain or store per-file before content).
3. Coordinate with git: copy should say revert is GrokForge-local undo, not `git revert`.

## Non-goals

- Full Time Machine / per-keystroke editor history.
- Replacing git as source of truth.

## Acceptance criteria

- [ ] User can view last N applied agent batches for current project.
- [ ] User can revert at least the most recent batch after undo window expires (if undo is one-deep, history enables older revert via stored snapshots).
- [ ] `npm run typecheck` passes.

## Related stories

- **[047](../047-diff-apply-discard-and-conflict-safety.md)**, **[060](../060-agent-first-class-edit-proposals.md)**.

## Completion bookkeeping

When implemented: mark **096** done, update [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
