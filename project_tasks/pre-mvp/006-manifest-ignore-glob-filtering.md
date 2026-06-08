# 006 — Apply `.grokproject.json` ignore patterns to file tree (and future search)

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` for any “skipped hidden items” UX copy if exposed.

## Summary

Implement **ignore glob** matching from `manifest.ignore` (e.g. `**/node_modules`, `**/.git`) so `read-directory` and the FileTree UI **omit** matching entries. Use a maintained glob library (e.g. `minimatch` / `micromatch`) in main process for consistent behavior with future search.

## Scope

- Normalize paths and test globs against relative path from each **root** or from project root per agreed rules (document choice in code comment).
- Filter in `read-directory` before returning to renderer (preferred) so renderer stays dumb.
- Respect case sensitivity per OS or document explicit POSIX-style matching.

## Acceptance criteria

- [x] `node_modules` and `.git` never appear in tree for typical JS repos when listed in `ignore`.
- [x] Performance: listing large directories does not block UI—consider batching or `setImmediate` if needed (measure first).
- [x] Add at least one small fixture or test for glob edge case (`**/*.log`).

## Key files

- `package.json` (dependency), `src/main/main.ts`, IPC handler from **005**, `FileTree.tsx` (pass-through only if filter server-side).

## Completion bookkeeping

When this story ships: update its **Status** line, the progress table in [`README.md`](README.md), and run **`npm run stories:html`** at the repo root so [`stories.html`](stories.html) stays in sync.
