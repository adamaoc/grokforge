# 046 — Agent proposed edits diff review

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` before changing chat pending-file-update UI, diff review surfaces, approval buttons, or Monaco diff shell.

## Why this story exists

Today, agent file writes appear as a “Pending file updates” list in `ChatThread`. The user can apply all, but cannot inspect a real diff before applying. This is risky: `write_file` operations are full-file replacements, and users need a trustworthy review step before letting the agent touch disk.

This story connects structured agent write proposals to the real diff system from **045**.

## Current state

- Assistant replies can include hidden structured `write_file` blocks.
- Renderer parses them into a pending batch.
- Pending panel lists file paths and root preflight state.
- User can apply all or discard.
- No actual diff is shown.
- `agent-tool-batch` writes full file contents under root guard and ignore rules.

## Summary

When the assistant proposes file edits, build a `DiffSession` from proposed writes and existing disk contents. Let the user review the diff before applying.

## Flow

1. Assistant response completes.
2. `ChatThread` parses pending write batch.
3. Renderer preflights paths against roots.
4. User clicks “Review diff.”
5. Renderer/main reads current disk contents for applicable paths.
6. App opens `DiffSession` in editor column.
7. User reviews.
8. User can apply all valid writes, discard, or return to chat.

## Important correctness detail

Original content should be read as close to review/apply time as possible. If the file changes after the diff is opened but before apply, the app should eventually warn or rebuild the diff. This can be fully hardened in **047**.

## UI requirements

- Pending panel should show:
  - Review diff
  - Apply all
  - Discard
- Diff session should show:
  - source: agent proposal
  - file count
  - created/modified labels
  - root grouping
  - apply/discard buttons
- Do not show raw JSON tool blocks to the user.

## Non-goals

- Do not implement per-hunk apply here.
- Do not implement partial file edits here.
- Do not add new model tool schema here.
- Do not solve terminal/tool-loop approval; see **034**.

## Acceptance criteria

- [x] Pending agent write batches can open a real diff review.
- [x] Existing files show original vs proposed content.
- [x] New files show empty original vs proposed content.
- [x] Diff review can apply or discard the pending batch.
- [x] Skipped/outside-root paths are not silently included.
- [x] Apply behavior remains guarded by main-process root/ignore checks.

## Key files

- `src/renderer/src/components/ChatThread.tsx`
- `src/renderer/src/components/EditorPane.tsx`
- `src/renderer/src/components/DiffEditorPane.tsx`
- `src/shared/agent-tool-contract.ts`
- `src/shared/diff-session-contract.ts`
- `src/main/agent-tools.ts`
