# 048 — Git diff viewer

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` before changing git badge interactions, diff grouping, file status chips, or sidebar/menu affordances.

## Why this story exists

Story **031** made git status more useful, including nested repo discovery and dirty counts. But users still cannot click through from “this repo has changes” to “what changed?” A real diff system should support both agent proposals and actual git working-tree diffs.

This story connects discovered git status to the diff system from **045**.

## Summary

Add a git working-tree diff view for one discovered repository or a multi-repo workspace root. Let users inspect uncommitted changes using the same grouped Monaco diff shell.

## Goals

- Add main-process git diff/read support.
- Open a diff session from a git badge/root action.
- Support modified and newly created files.
- Support deleted files if practical.
- Group diffs by workspace root and nested repo.
- Respect root boundaries and discovered repo paths.

## Main-process behavior

Potential IPC:

- `git-diff-status` for changed file list
- `git-diff-file` for original/modified content
- or one `git-diff-session` returning all capped diffs

Implementation approach:

- Use `git status --porcelain=v1 -z` or similar for parseable status.
- For original content:
  - `git show HEAD:<path>` for tracked files
  - empty string for untracked created files
- For modified content:
  - read working tree file from disk
  - empty string for deleted files
- For binary files:
  - skip or show “binary file changed”

## Limits

Hard caps:

- max files per diff session
- max bytes per file
- max total bytes
- binary detection

If capped:

- show skipped/truncated file list
- do not freeze renderer

## UI entry points

Possible entry points:

- root row git badge context/tooltip action: “View changes”
- root context menu: “View git changes”
- future git panel

Keep first implementation simple:

- add action where the user already sees dirty count.

## Non-goals

- No staging/unstaging.
- No commit UI.
- No branch switching.
- No blame/log.
- No merge conflict editor.

## Acceptance criteria

- [x] User can open a git diff session from a dirty git status surface.
- [x] Modified files show HEAD vs working tree.
- [x] New files show empty original vs working tree.
- [x] Deleted files are represented or explicitly skipped with reason.
- [x] Multi-repo roots group changes by repo.
- [x] Large/binary files do not break the UI.

## Key files

- `src/main/git.ts`
- `src/main/main.ts`
- `src/preload/preload.ts`
- `src/shared/diff-session-contract.ts`
- `src/renderer/src/components/Sidebar.tsx`
- `src/renderer/src/components/EditorPane.tsx`
- `src/renderer/src/components/DiffEditorPane.tsx`
