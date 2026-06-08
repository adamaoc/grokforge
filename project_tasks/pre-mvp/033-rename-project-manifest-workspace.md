# 033 — Rename project in manifest & workspace UI

**Status:** Done  
**Depends on:** **004** (manifest save), **020** / picker MRU (welcome-screen label is picker-only today).

## Goal

Let users change the **canonical** project name (`manifest.name` inside GrokForge app-side project storage) from inside the loaded workspace (e.g. project header or settings), with validation and persistence. Align or clarify relationship to the **recent-picker** label (`update-recent-picker-name` / MRU `displayName`).

Historical note: this story originally referenced `.grokproject.json`, but GrokForge no longer writes project manifests into user workspace folders. Project records live under Electron `userData/workspace-projects/<projectId>/project.json`.

## Out of scope (this story)

- Renaming the **folder** on disk (separate OS-level concern).
- Changing default manifest creation copy (“New GrokForge Project”) beyond whatever this story defines for first-run naming.

## Acceptance

- [x] UI entry point in the **open project** shell (not only welcome picker) to edit `manifest.name`.
- [x] Zod-validated manifest round-trip via existing `save-manifest` IPC / app project store persistence.
- [x] Document whether opening a project should **re-seed** MRU `displayName` from manifest or keep the picker-only label.

## Touchpoints (expected)

- `src/renderer/` — project chrome or settings surface + toast on save failure.
- `src/main/manifest.ts` / `main.ts` — reuse `validateManifest` + `save-manifest` (no new IPC unless unavoidable).

## Implementation notes (2026-05)

- The loaded workspace header shows the project name as an editable button with a pencil affordance.
- The rename dialog says the name appears in the title bar, welcome screen, and agent context, and is stored in GrokForge app data, not workspace folders.
- `saveManifestForProject()` persists `manifest.name` and normalizes `displayName` in app project storage.
- `update-recent-picker-name` updates both MRU display name and canonical app project name via `updateStoredProjectDisplayName()`.
- `AGENTS.md` documents the current behavior: `update-recent-picker-name` keeps MRU and canonical name in sync.

## Completion bookkeeping

When this story ships: update its **Status** line, the progress table in [`README.md`](README.md), and run **`npm run stories:html`** at the repo root so [`stories.html`](stories.html) stays in sync.
