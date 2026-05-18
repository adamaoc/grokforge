# 015 — Git status per workspace root

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` for sidebar badges and status colors (use existing `GitBranch` row style).

## Summary

Surface **git status** for each manifest root where `git: true`: branch name, dirty count, maybe ahead/behind (start minimal: branch + clean/dirty).

## Scope

- Main process: spawn `git` CLI or use simple `is-git-repo` + `git status --porcelain` (document requirement: git on PATH).
- IPC: `git-status` with `{ rootId }` → summary DTO.
- Renderer: `Sidebar` shows badge next to roots with git enabled; tooltip or popover for details (shadcn Tooltip/Popover).

## Acceptance criteria

- [x] Non-git folder does not error; badge hidden or “not a repo”.
- [x] Changing a file on disk updates status after refresh event (manual refresh button OK for v1).

## Key files

- `src/main/main.ts`, new `src/main/git.ts`, `Sidebar.tsx`, preload.
