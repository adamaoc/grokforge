# 044 — Filesystem mutation safety and semantics

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` before changing delete confirmations, mutation error copy, or destructive-action UI.

## Why this story exists

The current file tree mutation backend is intentionally small and root-scoped. It validates single-segment names, rejects paths outside workspace roots, prevents renaming/deleting workspace roots, and uses main-process filesystem APIs.

The biggest concern is destructive semantics: delete uses permanent recursive removal. For a desktop app where users may manage real project files, permanent delete should be treated with more care. This story also captures backend polish around collision messages, ignore semantics, and directory size/performance.

## Summary

Improve filesystem mutation safety and user-facing semantics, especially delete behavior. Decide whether delete should move files to trash instead of permanently removing them, and make backend errors/policies clearer.

## Current behavior

- `mkdir`: creates a single folder, fails if it exists.
- `touch`: creates an empty file with `flag: 'wx'`.
- `rename`: validates new basename and rejects collisions.
- `remove`: uses `rm(target, { recursive: true, force: true })`.
- `reveal`: uses Electron `shell.showItemInFolder`.
- All operations are scoped under `manifest.roots`.
- Workspace root folders cannot be renamed/deleted.

## Concerns

- Permanent recursive delete is risky.
- Delete confirmation says “This cannot be undone,” which is honest but harsh.
- There is no trash/recycle-bin path.
- There is no undo for user-initiated file tree mutations.
- Mutation error messages often expose raw Node errors.
- Mutations do not explicitly consult `manifest.ignore`.
- Directory listings have no max-entry cap or pagination.

## Goals

- Decide and implement safer delete behavior.
- Improve mutation error messages.
- Add backend tests for mutation edge cases.
- Decide whether ignored paths should be writable/mutable through manual file tree actions.
- Consider caps or warnings for extremely large directory listings.

## Delete options

Preferred desktop behavior:

- Move files/folders to OS trash/recycle bin using Electron shell APIs where available.
- Confirmation copy becomes “Move to Trash?” rather than “Delete permanently?”
- If trash operation fails, offer no automatic permanent fallback unless the user explicitly confirms.

Alternative:

- Keep permanent delete, but make the UI stronger:
  - include full path or relative path
  - mention recursive folder removal
  - require typing name for folders above a threshold

## Ignore semantics

Question to decide:

- Should a user be allowed to manually create/rename/delete ignored paths through the tree?

Arguments for allowing:

- User explicitly invoked the action.
- Ignore rules are mainly for hiding/scanning, not policy.

Arguments for rejecting:

- Keeps file tree, search, and agent write semantics aligned.
- Avoids creating files the app immediately hides.

Recommended compromise:

- Do not show ignored entries, so most ignored mutations are unreachable.
- Reject creating names that directly match common ignored roots like `node_modules`, `.git`, `dist`, `build` only if this becomes confusing.
- Keep agent writes stricter than manual user actions.

## Directory listing caps

For very large directories:

- Add a max entries cap or warning.
- Return `{ truncated: true }` if capped.
- UI should show “Showing first N entries” or similar.

This is not urgent for normal repos because ignore rules hide common heavy folders, but broad parent roots can still be large.

## Backend tests

Add tests for `applyWorkspaceFsMutate`:

- create file inside root
- reject path outside root
- reject root delete/rename
- reject slash/newline/NUL names as appropriate
- reject collision on rename
- delete/move-to-trash behavior
- reveal rejects missing/outside path

## Acceptance criteria

- [ ] Delete behavior is intentionally chosen and documented: trash-first or permanent.
- [ ] Delete UI copy matches actual behavior.
- [ ] User cannot accidentally delete workspace root folders.
- [ ] Mutation errors are user-friendly and not raw stack/system noise where avoidable.
- [ ] Backend mutation tests cover safety edge cases.
- [ ] Ignore semantics for manual mutations are documented.
- [ ] Large directory behavior is decided or deferred with a specific follow-up.

## Implementation decisions

- **Delete semantics:** manual file-tree delete is **trash-first**. `remove` now calls Electron `shell.trashItem()` and returns a user-facing failure if the operating system cannot move the target to Trash/Recycle Bin. There is no automatic permanent-delete fallback.
- **Ignore semantics:** manual mutations remain allowed when the user can explicitly target a path, while ignored entries stay hidden from normal tree browsing and agent writes remain stricter. This keeps human escape hatches without broadening automated writes.
- **Large directories:** entry capping/pagination is intentionally deferred. Existing ignore filtering handles common heavy trees, and a later performance-focused story should define DTO/UI behavior before adding truncation.

## Key files

- `src/main/workspace-fs-mutate.ts`
- `src/shared/workspace-fs-mutation-contract.ts`
- `src/renderer/src/components/FileTree.tsx`
- `src/main/main.ts` (`read-directory`)
- `src/main/ignore-globs.ts`
