# 066 — Launch polish: loading and project transition states

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` before changing project picker, root switching, file tree, editor, or loading UI.

## Why this story exists

Small transitions shape whether the app feels native and trustworthy. The video feedback called out adding a tiny loading animation when switching roots or loading a project. This is launch polish, but it also helps users understand when GrokForge is doing real filesystem and project work.

## Goals

- Add subtle loading states for project open, project switch, root switch, and file-tree refresh paths.
- Prevent empty or stale UI from looking like missing data during async work.
- Keep motion restrained and consistent with the existing desktop app feel.
- Avoid spinner noise during very fast operations.

## Scope

- Recent project open / project picker loading.
- Root switch and root file tree loading.
- Workspace index refresh or project initialization indicators if already surfaced.
- Any skeleton, shimmer, progress dot, or compact status indicator needed for these paths.

## UX direction

- Use short-delay loading indicators so instant transitions remain instant.
- Prefer localized indicators near the area being refreshed.
- Avoid full-screen blockers except for truly blocking project open flows.
- Keep animation accessible and respect reduced-motion settings where applicable.

## Decisions (MVP)

- **`prefers-reduced-motion` for loaders:** Deferred **post-MVP**. Current spinners and transitions stay as-is for launch.
- **Existing UX:** Project picker / `isLoadingProject`, per-root file trees with root “Loading files…”, `workspaceFsEpoch` refresh, and localized git spinners are **sufficient for 066** without a shared global shell loader or workspace-index UI (none surfaced in the renderer yet).

## Open questions

- Which transitions currently feel visually blank or ambiguous in the app?
- Should project open use a global app-shell loading state, a picker-card loading state, or both?
- Should root switching preserve the previous tree until the new tree arrives, or clear immediately with a loading skeleton?
- Should workspace index refresh be visible during project open, or only in agent/debug context?
- Do we need a shared loading component for launch, or should these remain local and minimal?

## Testing

- Verify slow project open and root switching states with artificial delays or fixtures.
- Verify no flicker for fast operations.
- Reduced-motion verification **deferred** (see Decisions).
- Run `npm run typecheck`.

## Acceptance criteria

- [x] Project loading has a clear, subtle visual state.
- [x] Root/file-tree loading has a clear, localized visual state.
- [x] Fast operations do not flash distracting loaders.
- [x] Loading treatment is consistent with GrokForge visual style.
- [x] Loading states do not block unrelated app controls unnecessarily.

## Completion bookkeeping

Story **066** marked done in this file; `project_tasks/README.md` updated; `project_tasks/stories.html` regenerated via `npm run stories:html`.
