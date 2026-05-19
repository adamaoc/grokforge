# 081 — Terminal dock: files pane vs bottom drawer

**Status:** Closed — not pursuing alternate terminal dock modes (right-column vs bottom drawer); current fixed shell layout is sufficient.

**Moved from:** MVP story **076** (same scope; deferred past launch).

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` before changing terminal container, tabs, or resize handles (`@styleguide-design`).

**Harness program:** **Independent** of **102–114** (shell layout only). Safe to run in parallel with harness wave.

## Why this story exists

The terminal today occupies a **fixed relationship** to the rest of the shell (see `terminalOpen` / layout in `App.tsx`). Users want **flexibility**: either dock the terminal **inside the same region as the files/editor split** (right column) or have it **slide up from the bottom** of the window (drawer / panel) to preserve editor height.

## Goals

1. **User-selectable dock mode** (v1 can be binary): **(A)** terminal in **right-hand** stack with editor/tabs, or **(B)** terminal as **bottom drawer** spanning chat + editor width (exact proportions TBD).
2. **Persist** choice in `localStorage` (key pattern e.g. `grokforge.terminalDock.v1`).
3. **Smooth transition** between modes without killing PTY sessions (reuse existing session state from **050–054** work).

## Scope

### Renderer

- **`App.tsx` / `ProjectWorkspaceShell`**: restructure `ResizablePanelGroup` nesting: a **vertical** outer group may be needed for bottom-drawer mode while keeping **horizontal** chat | rest split.
- **Terminal** component host: ensure **xterm** fit / `FitAddon` runs on layout mode change and on resize.
- **Z-index / focus:** bottom drawer must not block critical modals; focus trap optional (usually avoid trap for terminal).

### State

- **`terminalOpen`** may need companion **`terminalDock: 'right' | 'bottom'`**.
- Consider **max height** for bottom mode (e.g. 40% viewport) with resize handle.

## UX direction

- Small **toggle** near terminal tab strip or in **Settings → Appearance / Workspace** (if too crowded in shell, Settings-only is acceptable v1 with shell shortcut later).
- Preserve **terminal tabs** behavior from story **052**.

## Testing

- Manual: run long-running command → switch dock modes → output and input remain usable.
- Manual: narrow widths — bottom drawer still usable.
- **`npm run typecheck`**.

## Acceptance criteria

- [ ] User can choose **at least two** dock placements: **with right/files stack** vs **bottom drawer** (names in UI can differ).
- [ ] Preference **persists** across app restarts.
- [ ] No forced PTY restart on mode switch unless technically unavoidable (document if so).
- [ ] `npm run typecheck` passes.

## Related stories

- **[075](../075-files-pane-collapse-defaults-and-file-tree-default-open.md)** — right-hand collapse interacts with terminal placement.
- **[052](../052-terminal-tabs-layout-and-session-ux.md)** — prior terminal UX baseline.

## Completion bookkeeping

When implemented: mark **081** done in this file, update `project_tasks/README.md` post-MVP row if status is tracked there, run **`npm run stories:html`**.
