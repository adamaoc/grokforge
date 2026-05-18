# 049 — Diff system cleanup: remove demo stubs and align docs

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` if any cleanup changes visible menu labels or empty states.

## Why this story exists

After the real diff path exists, the demo scaffolding from story **014** should not linger in product chrome. Fake demo data is useful while proving a component, but confusing once users expect real project behavior.

This story is intentionally last in the diff group: remove the scaffolding only after real diff sessions cover the use cases.

## Summary

Remove or isolate demo-only diff code, update docs/tasks, and make sure every diff entry point opens real project data.

## Cleanup targets

- `src/renderer/src/lib/demo-diff-snippets.ts`
- `GroupedDiffDemo` if replaced by a real grouped diff component
- `diffDemoOpen` state in `App.tsx`
- `EditorDiffDemo` type in `EditorPane.tsx`
- “Open diff demo” menu item in `ProjectHeader.tsx`
- story/docs language that says demo is the diff path

## Preferred end state

- `GroupedDiffView` or equivalent renders `DiffSession`.
- Header menu has no fake demo item.
- Diff entry points are:
  - agent proposal review
  - git changes
  - maybe manual compare later
- Story 014 can remain marked done as a historical UI spike, but README/AGENTS should not imply the demo is a complete diff system.

## Acceptance criteria

- [x] Demo snippets are removed or isolated from production UI.
- [x] No normal menu item opens fake diff data.
- [x] Diff docs describe real supported sources.
- [x] Real diff entry points still work after cleanup.
- [x] Story 014’s historical role is clear.

## Key files

- `src/renderer/src/lib/demo-diff-snippets.ts`
- `src/renderer/src/components/GroupedDiffDemo.tsx`
- `src/renderer/src/components/EditorPane.tsx`
- `src/renderer/src/components/ProjectHeader.tsx`
- `src/renderer/src/App.tsx`
- `AGENTS.md`
- `README.md`

## Completion bookkeeping

When this story ships: update its **Status** line, the progress table in [`README.md`](README.md), and run **`npm run stories:html`** at the repo root so [`stories.html`](stories.html) stays in sync.
