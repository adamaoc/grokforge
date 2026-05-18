# 023 — Sidebar: file tree fills full height

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` for sidebar layout and scroll behavior.

## Summary

The **project / file tree** panel in the sidebar is **visually cut off** (~half height). The tree should **use the full available sidebar height** with correct **flex / min-h-0** and internal scrolling so long trees scroll inside the panel.

## Scope

- Inspect layout chain: `App.tsx` → sidebar column → `Sidebar.tsx` → `FileTree.tsx` (and any intermediate wrappers).
- Fix flex growth, `overflow`, and `min-h-0` so the tree region expands to the bottom of the sidebar.
- Confirm behavior with terminal / other sidebar sections if present (stacked regions should share height sensibly).

Here's a shot of the sidebar and file tree:

`Desktop/filetree.png`

## Acceptance criteria

- [ ] With a project open, the file tree occupies the full sidebar height below its header/tooling.
- [ ] Overflow scrolls inside the tree; outer shell does not clip mid-panel.
- [ ] Resize window: layout remains correct at small and large heights.

## Key files

- `src/renderer/src/components/Sidebar.tsx`, `FileTree.tsx`, `App.tsx`.

## Completion bookkeeping

When this story ships: update its **Status** line, the progress table in [`README.md`](README.md), and run **`npm run stories:html`** at the repo root so [`stories.html`](stories.html) stays in sync.
