# 014 — Monaco diff viewer + multi-root grouped presentation

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` for diff shell layout, headers, and accent for “added/removed” legend.

## Summary

Add **side-by-side or inline diff** using Monaco’s diff editor for two versions of a file. For **multi-root**, group diffs by `rootId` / label in a list or accordion (spec: “grouped multi-root diffs”).

**Historical note:** this story was the original demo spike for Monaco diff rendering. The production diff path is now the real `DiffSession` flow from stories **045–049**: agent proposal review and git working-tree changes. Demo-only snippets/components from this spike are no longer part of product chrome.

## Scope

- IPC or in-memory API to open diff: `originalPath` / `modifiedPath` or string content pairs from agent proposals later.
- New component `DiffPane` or extend `EditorPane` with mode switch (read vs diff).
- Visual grouping: section header per root with zinc panel styling.

## Out of scope

- Generating patches from Grok tool calls (**tooling story** can follow).

## Acceptance criteria

- [x] User can open a demo diff from dev menu or chat action stub with two known files.
- [x] Grouping UI visible for ≥2 roots in mock scenario.
- [x] No regression to single-file editor mode.

## Key files

- `src/renderer/src/components/EditorPane.tsx`, new diff component(s), `package.json` if new helper deps.
