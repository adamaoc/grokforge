# 030 — Remove from recent projects (picker)

**Status:** Done

**Depends on:** **020** (recent list persistence, `ProjectWelcome` cards, `recent-projects-changed`).

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` for control density, focus rings, and icon buttons on cards.

## Summary

Users should be able to **drop a workspace from the recents list** without opening it or deleting the project on disk. This is a list hygiene affordance on the welcome / project picker only.

## Scope

- **Main:** `remove-recent-project` IPC handler with validated payload (`projectRootPath: string`); resolve path, remove matching entry from `recent-projects.json` (same store as **020** in `src/main/recent-projects-store.ts`), dedupe-safe compare by `resolve()`.
- After mutation: persist store, then **`recent-projects-changed`** with sanitized list (same pattern as **020** `finishOpenProjectSession` / `notifyRecentProjectsChanged`).
- **Preload:** expose `removeRecentProject(projectRootPath: string)` invoking the handler; return `{ ok: true }` or `{ ok: false, error: string }` for invalid input / unknown path.
- **Renderer:** on each recent card in `ProjectWelcome.tsx`, add a small dismiss control (e.g. `×` or lucide `X`) that **stops propagation** so the card does not open the project; optional `title` / `aria-label` “Remove from recent projects”. Empty state when last recent is removed should match **020** (no grid, primary “Open project” path only).

## Out of scope

- Clearing entire history (separate story if needed).
- Removing the on-disk `.grokproject.json` or folder.

## Acceptance criteria

- [x] Removing an entry updates the picker immediately (via IPC response and/or `recent-projects-changed`).
- [x] Removing does not open the project and does not delete files under the project root.
- [x] Unknown or already-absent paths are a no-op or return a clear error without corrupting the store.

## Key files

- `src/main/recent-projects-store.ts` — `removeRecentProject(resolvedPath: string)` (read → filter → write).
- `src/main/main.ts` — `ipcMain.handle('remove-recent-project', …)`.
- `src/preload/preload.ts` — bridge + types.
- `src/renderer/src/components/ProjectWelcome.tsx` — dismiss control per card.

## Notes

- Reuse **020** contract types in `src/shared/recent-projects-contract.ts` unless a dedicated small DTO is needed for the remove payload.
