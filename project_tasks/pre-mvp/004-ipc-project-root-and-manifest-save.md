# 004 — IPC: authoritative project root & manifest persistence

**Design skill:** Not primary here; follow existing patterns if any IPC error surfaces in UI (`sonner`).

## Summary

Fix **technical debt** in the main process: track the **opened project directory** explicitly so `save-manifest` and future features do not assume `manifest.roots[0].path` is the project root.

## Background

`src/main/main.ts` saves `.grokproject.json` using `currentProject.roots[0].path`, which breaks when the first root is not the folder that contains the manifest or when roots are peer repos.

## Scope

- Add `projectRootPath: string | null` (or equivalent) set when user completes `open-project`.
- Write manifest to `join(projectRootPath, '.grokproject.json')` for create + save.
- When loading existing manifest, set `projectRootPath` from the dialog path (folder selected), not inferred only from roots.
- Expose `get-project-root` or include root in `get-project` response if the renderer needs it (type-safe via preload).

## Acceptance criteria

- [ ] Saving manifest after editing roots order still writes to the **same** `.grokproject.json` the user opened.
- [ ] Unit or manual test: manifest with two code roots at different absolute paths; save updates file in **opened** directory.
- [ ] Preload + `window.electron` types updated.

## Key files

- `src/main/main.ts`, `src/preload/preload.ts`, consumers in renderer if API changes.

## Completion bookkeeping

When this story ships: update its **Status** line, the progress table in [`README.md`](README.md), and run **`npm run stories:html`** at the repo root so [`stories.html`](stories.html) stays in sync.
