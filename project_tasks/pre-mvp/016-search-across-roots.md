# 016 — Search across roots (respecting ignore patterns)

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` for search panel layout, result rows, and highlight.

## Summary

Implement **text search** (ripgrep-like or `git grep` / Node walk + file read with limits) across all manifest roots, honoring **006** ignore rules, with caps on file size and result count for safety.

## Scope

- IPC: `search-workspace` with `{ query, caseSensitive?, regex? }` returning `{ results: Array<{ path, rootId, line, preview }> }`.
- Renderer: simple modal or side panel listing results; click opens file in Monaco at line (Monaco API `revealLineInCenter`).
- Progress/cancel for long searches.

## Acceptance criteria

- [x] Large `node_modules` not scanned when ignored.
- [x] Cancellation does not leave orphan workers.
- [x] Document performance limits in `AGENTS.md`.

## Key files

- `src/main/` new search module, preload, new `SearchPanel.tsx` (small file + reuse primitives).

## Completion bookkeeping

When this story ships: update its **Status** line, the progress table in [`README.md`](README.md), and run **`npm run stories:html`** at the repo root so [`stories.html`](stories.html) stays in sync.
