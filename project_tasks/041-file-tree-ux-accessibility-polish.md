# 041 — File tree UX and accessibility polish

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` before changing file tree rows, context menus, selection states, keyboard behavior, icons, or empty/loading/error states.

## Why this story exists

The current file tree is functional: it lists ignored-aware directories, opens files, exposes a context menu, and supports create/rename/delete/reveal/copy operations. But it still behaves more like a basic tree view than a polished desktop file navigator.

GrokForge’s sidebar is one of the app’s primary surfaces. Users will judge the whole product by whether navigating files feels predictable, fast, and native-ish. This story focuses on the user-facing tree experience, not the internals cleanup.

## Summary

Improve file tree interaction quality: active-file highlighting, keyboard navigation, clearer loading/error/empty states, better icons, and a real decision on “Add to chat.”

## Current gaps

- The active editor file is not highlighted in the tree.
- Open files are not visually distinguished.
- Tree is mostly mouse/context-menu driven.
- Folder rows do not expose strong keyboard semantics.
- `Add to chat` still shows “coming soon” unless a handler is passed, and no current shell path appears to pass one.
- Icons are generic `File` and `Folder`, making larger projects harder to scan.
- Empty/error/loading states are minimal text-only states.

## Goals

- Highlight the active file in the file tree.
- Optionally mark open-but-inactive files.
- Add keyboard basics:
  - ArrowRight expands a folder.
  - ArrowLeft collapses a folder or moves to parent.
  - Enter opens a file or toggles folder.
  - Escape closes context/dialog states where relevant.
- Make rows focusable with visible focus rings.
- Improve `aria-*` semantics enough for screen readers to understand tree rows.
- Decide whether `Add to chat` is implemented now or hidden until story **034**.
- Add extension-aware file icons or subtle labels for common project files.
- Improve loading/empty/error states while keeping dense sidebar layout.

## Non-goals

- Do not build drag/drop in this story unless it falls out naturally.
- Do not implement a full VS Code clone.
- Do not add file watching here.
- Do not change main-process filesystem semantics; that belongs in **044**.

## UX recommendations

- Active file row:
  - use subdued `bg-zinc-800` or accent-left-border
  - keep text readable across accent themes
  - avoid oversized row height
- Open but inactive:
  - subtle dot or slightly brighter text
- Folder loading:
  - spinner at row end is fine, but root loading should stay compact
- Error:
  - inline red text below folder row
  - root failure may toast once, as it does today
- Empty folder:
  - keep the current inline “Empty folder” but style as secondary and aligned with children

## Add to chat decision

Preferred short-term choice:

- Hide or disable `Add to chat` until there is a real path-to-composer/active-context implementation.

Preferred medium-term choice:

- Wire `Add to chat` into chat input/attachments:
  - file path attachment
  - directory path attachment
  - optionally include a small preview or allow the agent runner to retrieve contents later

If implementing now, coordinate with **034** and **039** so attachments do not become another unbounded prompt dump.

## Testing

Manual QA:

- Open file from tree and verify active row highlight.
- Open multiple tabs and verify inactive-open state.
- Navigate with keyboard through folders/files.
- Expand/collapse folders by keyboard.
- Verify focus ring is visible in Fern/Frost/Flame themes.
- Verify context menu still targets correct row.
- Verify ignored folders are still hidden.

Automated tests if practical:

- Extract row state helpers for unit tests.
- Add UI E2E coverage later under **037**.

## Acceptance criteria

- [ ] Active editor file is visibly highlighted in the tree.
- [ ] Open files can be distinguished from unopened files or intentionally documented as deferred.
- [ ] Basic keyboard navigation works for files and folders.
- [ ] Tree rows have accessible focus/selection semantics.
- [ ] `Add to chat` is either wired or removed/disabled with clear intent.
- [ ] Loading, empty, and error states feel intentional and compact.
- [ ] Common file types are easier to scan than with one generic icon for everything.

## Key files

- `src/renderer/src/components/FileTree.tsx`
- `src/renderer/src/components/Sidebar.tsx`
- `src/renderer/src/App.tsx`
- `src/renderer/src/lib/getLanguageFromPath.ts`


## Completion bookkeeping

When this story ships: update its **Status** line, the progress table in [`README.md`](README.md), and run **`npm run stories:html`** at the repo root so [`stories.html`](stories.html) stays in sync.
