# 042 — File tree and editor state synchronization

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` if changing tab, dirty-state, or tree row visuals.

## Why this story exists

The file tree can rename and delete files/folders, and the editor can keep files open in tabs. Today those states are only loosely connected. If a user renames or deletes a file that is currently open, the editor can be left pointing at the old path. That makes the app feel stale and can lead to confusing save failures.

This story focuses on keeping file tree mutations, open tabs, active file, dirty state, and Monaco reload behavior coherent.

## Summary

After create/rename/delete operations, update the shell/editor state so open tabs and active file references stay accurate or close safely.

## Current gaps

- Renaming an open file likely leaves the editor tab pointing at the old path.
- Renaming a folder likely leaves any open child files pointing at old paths.
- Deleting an open file likely leaves a stale editor tab.
- Deleting a folder likely leaves stale tabs for any open descendants.
- Dirty open files inside renamed/deleted paths need explicit handling.
- File tree mutation notifications pass paths, but not structured mutation details.

## Goals

- Represent filesystem mutations with structured events, not only path arrays.
- Reconcile open editor tabs after:
  - file rename
  - folder rename
  - file delete
  - folder delete
  - new file creation
- Preserve user work where possible.
- Prevent saving to stale deleted/renamed paths without warning.
- Refresh only affected editor tabs and file tree directories.

## Suggested mutation event shape

Add a renderer-level event type, or extend shared mutation result if main should participate:

```ts
type WorkspaceFsMutationEvent =
  | { op: 'create'; path: string; isDirectory: boolean; parentDir: string }
  | { op: 'rename'; oldPath: string; newPath: string; isDirectory: boolean }
  | { op: 'delete'; path: string; isDirectory: boolean }
```

The existing `paths: string[]` can remain for simple refresh/git purposes, but editor reconciliation needs structured intent.

## Rename behavior

File rename:

- If old file is open, update tab path to new path.
- Preserve content and dirty state if possible.
- If active file was old path, active file becomes new path.

Folder rename:

- For every open file under old folder, rewrite path prefix to new folder.
- Preserve active file and dirty state.
- Refresh old parent and new folder parent in tree.

## Delete behavior

File delete:

- If file is open and clean, close tab.
- If file is open and dirty, show confirm dialog before deletion or block deletion until tab is saved/closed.

Folder delete:

- If any open descendants are dirty, show confirm dialog listing count and require explicit confirmation.
- Clean descendants may close automatically after deletion.

## Create behavior

New file:

- Consider opening the new file automatically after create.
- If not opening automatically, at least refresh the parent and keep focus predictable.

New folder:

- Expand parent and show the new folder row.

## Non-goals

- Do not add file watching here.
- Do not implement undo for filesystem mutations; see **044** for safer delete semantics.
- Do not redesign editor tabs.

## Testing

Unit tests:

- Path-prefix rewrite helper for folder rename.
- Open-tab reconciliation after file rename.
- Open-tab reconciliation after folder rename.
- Dirty descendant detection for folder delete.

Manual QA:

- Rename active open file.
- Rename folder containing active open file.
- Delete clean open file.
- Attempt to delete dirty open file.
- Delete folder containing multiple open files.
- Create new file and verify tree/editor behavior.

## Acceptance criteria

- [ ] Renaming an open file updates its editor tab path.
- [ ] Renaming a folder updates open descendant tab paths.
- [ ] Deleting open clean files/folders closes affected tabs.
- [ ] Deleting dirty open files/folders warns or blocks before destructive action.
- [ ] New file/folder creation refreshes and focuses predictably.
- [ ] Git/file-tree/editor refresh still receives enough path information after mutation.

## Key files

- `src/renderer/src/App.tsx`
- `src/renderer/src/components/FileTree.tsx`
- `src/renderer/src/components/EditorPane.tsx`
- `src/renderer/src/components/EditorTabBar.tsx`
- `src/shared/workspace-fs-mutation-contract.ts`

