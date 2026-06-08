# 043 — File tree code architecture cleanup

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` if refactoring changes rendered tree rows, menus, or dialogs. The primary goal is code structure, not visual redesign.

## Why this story exists

`FileTree.tsx` has grown into a multi-responsibility component. It handles directory loading, expanded state, loading/error state, context-menu target detection, mutations, clipboard, reveal, creation dialog, rename dialog, delete confirmation, and recursive row rendering.

That was fine while the tree was small. As the app adds active-file highlighting, keyboard navigation, editor synchronization, chat attachments, and safer filesystem behavior, this component will become difficult to reason about unless split.

## Summary

Refactor the file tree into smaller hooks/components without changing user-visible behavior. Prepare the tree for future UX improvements and agent/tool-loop integration.

## Current cleanup targets

- `FileTree.tsx` is over 500 lines.
- `rootId` is accepted but unused as `_rootId`.
- Context-menu target detection relies on DOM attributes and `closest()` lookups.
- Mutation typing uses `Parameters<NonNullable<typeof window.electron>['workspaceFsMutate']>[0]` instead of shared DTO types.
- Full expanded-tree refresh on every `workspaceFsEpoch` can become expensive.
- Recursive render function is embedded in the main component.
- Dialog state and mutation state are mixed with directory loading state.

## Proposed structure

Feature folder:

```txt
src/renderer/src/components/file-tree/
  FileTree.tsx
  FileTreeRow.tsx
  FileTreeContextMenu.tsx
  FileTreeNameDialog.tsx
  FileTreeDeleteDialog.tsx
  useFileTreeState.ts
  file-tree-types.ts
```

Keep the public import path stable if possible by re-exporting from `components/FileTree.tsx`, or update imports in `Sidebar.tsx`.

## Hook responsibilities

`useFileTreeState`:

- expanded paths
- children by path
- loading/error maps
- in-flight request tracking
- root reset
- load directory
- refresh affected directories

Component responsibilities:

- `FileTreeRow`: present one file/folder row.
- `FileTreeContextMenu`: render menu actions for a target.
- `FileTreeNameDialog`: create/rename UI.
- `FileTreeDeleteDialog`: delete confirmation UI.

## Better context menu targeting

Preferred direction:

- Each row owns its own `ContextMenuTrigger`.
- Empty-folder/root areas have explicit triggers.
- Avoid global DOM `closest('[data-file-tree-row]')` where possible.

This makes keyboard/context-menu behavior easier to reason about and lowers coupling to markup attributes.

## Refresh strategy cleanup

Today, every workspace filesystem epoch reloads root plus every expanded folder. That is simple but can get expensive.

Preferred direction:

- Accept affected paths or structured mutation events.
- Refresh only:
  - parent directory for create/delete/rename
  - renamed folder if expanded
  - root if mutation target cannot be mapped
- Keep a fallback full refresh for agent writes that touch unknown paths.

## Non-goals

- Do not change filesystem security rules.
- Do not implement new visible features unless needed to preserve behavior.
- Do not take on editor tab synchronization here; that is **042**.

## Testing

Unit tests:

- path-to-refresh-directory helper
- expanded-state update helper
- context menu target helper if retained

Verification:

- `npm run typecheck`
- `npm run test`
- manual create/rename/delete/reveal/copy/open flow

## Acceptance criteria

- [ ] `FileTree.tsx` is split into smaller focused units.
- [ ] Public behavior remains equivalent after refactor.
- [ ] `rootId` is used meaningfully or removed.
- [ ] Shared `WorkspaceFsMutateRequest` type is imported directly.
- [ ] Refresh logic has a path toward affected-directory refresh instead of always reloading every expanded folder.
- [ ] Context-menu targeting is less DOM-attribute brittle or documented as temporary.

## Key files

- `src/renderer/src/components/FileTree.tsx`
- `src/renderer/src/components/Sidebar.tsx`
- `src/renderer/src/lib/workspace-paths.ts`
- `src/shared/workspace-fs-mutation-contract.ts`


## Completion bookkeeping

When this story ships: update its **Status** line, the progress table in [`README.md`](README.md), and run **`npm run stories:html`** at the repo root so [`stories.html`](stories.html) stays in sync.
