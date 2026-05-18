# 031 — Git status: refresh, errors, and discoverability

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` for badge, tooltip, and inline error patterns.

## Background

Story **015** added per-root git status badges in the `Sidebar`, plus a small `RefreshCw` button next to the "WORKSPACE ROOTS" header that re-ran `git status` for every git-tracked root.

Story **025** removed that refresh button: the icon and placement implied "refresh the file tree", not "refresh git status for all git roots". The auto-fetch on mount + on `project.roots` change is still in place, so badges stay correct in the normal flow — but there is no longer a manual way to force-refresh.

## Summary

Decide and ship a clearer git status UX: how (and where) the user manually refreshes, how status updates after GrokForge writes files, how stale data is communicated, how nested git repositories are represented, and how per-root failure modes (`not_a_repo`, `git_unavailable`, `git_error`) surface beyond the badge tooltip.

The intent is not to turn the sidebar into a full git client. The intent is that a workspace root row gives a useful, honest signal about git state even when the selected workspace folder is a parent folder and the actual repository lives one or two levels below it.

## Scope

- Per-root **manual refresh**: a small icon on the root row (only when `root.git` is true) — or a single action in the root row's right-click / overflow menu — that re-runs `getGitStatusForRoot` for that root.
- **Auto-refresh after app-driven writes**: refresh relevant git status after editor saves, agent write batches, and workspace FS mutations. This is more important than a button for normal use: when GrokForge changes files, the dirty badge should not stay stale.
- **Stale indicator**: show the "last refreshed" time on hover (e.g. inside the existing `Tooltip`). Optionally auto-refresh on a low-frequency interval (`focus` window event is probably enough).
- **Failure surfacing**: when `git-status` returns `{ ok: false, code: 'git_unavailable' }`, show a single one-shot toast / inline banner instead of a silent muted icon — the user needs to know git isn't on PATH.
- **No global refresh button** in the sidebar header unless it has obvious affordance (label, distinct icon, or moved into a dropdown). Default recommendation: per-root only.
- **Nested repository discovery**: when a workspace root is not itself a git repository but contains one or more nested repositories, surface git status for the nested repository that is most relevant to that root.

## Nested repository behavior

Many GrokForge projects use a broad folder as the workspace root, while the actual app/repo lives in a child folder. Example:

- Workspace root: `/Users/adamm/Documents/WEBPROJECTS/jobsboard-generic`
- Actual git repo: `/Users/adamm/Documents/WEBPROJECTS/jobsboard-generic/www-ijobsboard`

For this story, a root row should still be able to show a git icon and dirty count for a nested repo. The user is responsible for understanding that the repo is nested, but the UI should make the source clear enough to avoid confusion.

Recommended v1 behavior:

- If `root.path` is itself inside a git worktree, use that repository.
- Else scan shallow child folders under `root.path` for `.git` directories or git worktrees.
- Ignore folders hidden by `manifest.ignore`.
- Limit scan depth and count so large parent folders do not become expensive.
- If exactly one nested repo is found, show its status on the root row.
- If multiple nested repos are found, show a git indicator with a tooltip like `3 nested git repositories`; either:
  - show the dirty count sum, with tooltip listing each repo and status, or
  - show a neutral multi-repo badge and defer per-repo detail to a popover/context menu.
- Tooltip must include the actual repository path relative to the workspace root, e.g. `Repo: www-ijobsboard`.
- Manual refresh on the root row refreshes the discovered repo(s), not only `root.path`.
- App-driven file writes refresh the git repo whose path contains the changed file when possible.

Do not silently set `root.git: true` for parent folders just because nested repos exist unless the manifest semantics are intentionally expanded. Prefer a runtime/discovered `gitRepos` status model so the manifest continues to describe user-added roots, while status describes discovered repositories inside them.

## Out of scope

- Diff / log / blame UI (post-MVP).
- Real-time file watching of `.git/HEAD` (post-MVP — out of MVP polish budget).
- Branch switching from inside the app.
- Full git repository management for every nested repo.
- Deep recursive repository discovery across huge trees.
- Automatically changing the active workspace root to the nested repo.

## Acceptance criteria

- [x] Manual refresh is discoverable on a per-root basis and matches existing badge layout.
- [x] Git status refreshes after editor saves, agent write batches, and workspace FS mutations that touch files inside a discovered repo.
- [x] A workspace root can surface git status for a nested repository, with tooltip copy that clearly identifies the actual repo path.
- [x] Multiple nested repositories are represented without pretending the root itself is a single repo.
- [x] `git_unavailable` is communicated once, clearly, not just via tooltip.
- [x] Removing the global header refresh in **025** did not regress any acceptance criteria of **015** (badges still update on mount and when `project.roots` change).
- [x] Story notes / `AGENTS.md` reflect the new affordance.

## Key files

- `src/renderer/src/components/Sidebar.tsx`
- `src/main/git.ts`
- Optional: a small `useGitStatuses` hook if logic outgrows `Sidebar`.

## Notes

- Successor to **015** + **025**. Implement after **020+** polish work has settled.

## Implementation notes (2026-05)

- `git-status` now treats `root.git` as a hint, not a hard gate. Every workspace root can be queried.
- Main detects the containing git worktree for the root path, otherwise scans shallow child folders for nested repos while honoring `manifest.ignore`.
- Single nested repos show the repo-relative path in the tooltip; multiple nested repos are summarized without claiming the workspace root is itself one repo.
- Sidebar refreshes git status on project/root changes, per-root manual refresh, and app-driven file changes from editor saves, agent writes/undo, and file tree mutations.
- Root-level `node_modules` is now matched by `**/node_modules` in the shared ignore helper, aligning root-level and nested ignore behavior.
