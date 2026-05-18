# 047 — Diff apply/discard and conflict safety

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` before changing apply/discard buttons, conflict warnings, destructive confirmations, or diff review layout.

## Why this story exists

Showing diffs is only half of a review system. Users also need confidence that applying a reviewed diff writes what they saw, does not overwrite newer disk changes by accident, and can be backed out when possible.

This story hardens the apply/discard semantics after **046** introduces agent diff review.

## Summary

Add conflict detection and safer apply/discard behavior for diff sessions, especially agent-proposed write batches.

## Goals

- Detect if original file content changed after diff review was opened.
- Warn before overwriting changed files.
- Keep discard simple and reliable.
- Preserve existing undo snapshot behavior for applied agent batches.
- Surface partial apply failures clearly.
- Keep write semantics main-process-owned.

## Conflict detection options

Preferred:

- When building a `DiffSession`, compute for each original file a content hash, or mtime + size, or both.
- When applying, main re-reads file metadata/content and compares.
- If changed, return a structured conflict result.

Conflict UI:

- “File changed since review”
- Show affected paths.
- Options:
  - Cancel
  - Rebuild diff
  - Overwrite anyway, if explicitly supported

First version can choose Cancel + Rebuild only.

## Partial failures

If one file applies and another fails:

- UI must show which files changed.
- Undo should remain available for applied files.
- User should not see only a generic “No files were written” if some paths failed for different reasons.

## Discard behavior

Discard should:

- close diff session
- clear pending write batch
- not touch disk
- leave chat message history intact

If user closes diff session without discarding:

- pending batch should still be available unless explicitly discarded.

## Non-goals

- Do not implement per-file/per-hunk apply here unless the review UX demands it.
- Do not replace `agent-tool-batch` completely in one step.
- Do not add git commit/revert behavior.

## Acceptance criteria

- [x] Applying reviewed diffs does not silently overwrite changed files.
- [x] Conflict UI explains what changed and gives a safe next step.
- [x] Discard closes review without touching disk.
- [x] Existing undo behavior still works after successful apply.
- [x] Partial failures are visible per file.

## Key files

- `src/main/agent-tools.ts`
- `src/shared/agent-tool-contract.ts`
- `src/shared/diff-session-contract.ts`
- `src/renderer/src/components/ChatThread.tsx`
- `src/renderer/src/components/EditorPane.tsx`
