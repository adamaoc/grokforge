# 005 — Real filesystem: directory listing IPC + FileTree

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` for loading/empty/error UI in `FileTree`.

## Summary

Replace the **mock** `FileTree` with real directory data from the main process: list children of a path (non-recursive or shallow recursive with depth limit), return names + `isDirectory` + full paths for the active expansion state.

## Scope

- New IPC e.g. `read-directory` with args `{ path: string }` → `{ entries: Array<{ name, path, isDirectory }> }`, with error handling for permission denied / not found.
- Main process uses `fs.readdir` with `withFileTypes: true` (Node); validate path stays under allowed roots from current manifest (security).
- Renderer `FileTree`: fetch children when a node expands; lazy-load; show spinner consistent with design skill.
- Remove hard-coded `mockTree` structure.

## Out of scope

- Ignore-pattern filtering (**006**).
- File watching / refresh (**later**).

## Acceptance criteria

- [ ] Opening a real repo root shows actual top-level files and folders.
- [ ] Clicking a file still opens in Monaco via existing `read-file` IPC.
- [ ] Malicious path escape (e.g. `../../../`) rejected in main process when tied to manifest roots.

## Key files

- `src/main/main.ts`, `src/preload/preload.ts`, `src/renderer/src/components/FileTree.tsx`, `Sidebar.tsx`.

## Completion bookkeeping

When this story ships: update its **Status** line, the progress table in [`README.md`](README.md), and run **`npm run stories:html`** at the repo root so [`stories.html`](stories.html) stays in sync.
