# 045 — Real diff model and open-diff API

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` before changing diff shell layout, diff list rows, toolbar controls, or Monaco diff presentation.

## Why this story exists

Story **014** proved Monaco diff rendering and multi-root grouping with static demo strings. That was useful as a UI spike, but GrokForge still does not have a real diff system. The header menu says “Open diff demo,” and `GroupedDiffDemo` renders fake data from `demo-diff-snippets.ts`.

This story replaces the demo-only surface with a real in-memory diff model that can represent actual file changes from disk, agent proposals, or future git comparisons.

## Current state

- `DiffEditorPane` renders side-by-side Monaco diffs from two strings.
- `GroupedDiffDemo` groups fake diffs by the first two workspace roots.
- `EditorPane` has a special `diffDemo.open` mode.
- `ProjectHeader` exposes “Open diff demo.”
- No API exists to open a diff for actual file paths or proposed content.
- No shared diff DTO exists.

## Summary

Define a real diff data model and renderer entry point. Replace “demo diff” state with a general `DiffSession` that can show one or more file diffs grouped by root.

## Goals

- Add a typed diff session model.
- Support content-pair diffs: original text, modified text, path, root id/label, language, and status.
- Support statuses: `created`, `modified`, `deleted`, `renamed`.
- Support opening a diff session from renderer state.
- Preserve multi-root grouping.
- Keep Monaco read-only for this story.
- Remove or hide fake demo data from normal product UI.

## Suggested shared model

Add `src/shared/diff-session-contract.ts`:

```ts
export type DiffFileStatus = 'created' | 'modified' | 'deleted' | 'renamed'

export type DiffFileEntry = {
  id: string
  rootId: string
  rootLabel: string
  path: string
  oldPath?: string
  status: DiffFileStatus
  language?: string
  original: string
  modified: string
}

export type DiffSession = {
  id: string
  title: string
  description?: string
  files: DiffFileEntry[]
  source: 'demo' | 'agent-proposal' | 'git' | 'manual'
}
```

## UI behavior

- `EditorPane` should switch from `diffDemo?: { open, onClose }` to something like `diffSession?: DiffSession | null`.
- Header title should use session title, not “Diff demo.”
- Diff grouped view should accept real entries.
- Group by `rootId/rootLabel`.
- Show file path/status in each diff panel.
- If a session has one file, use a focused single-file layout.
- If a session has many files, show a list/accordion or stacked grouped panels.

## Demo handling

Preferred:

- Remove “Open diff demo” from the normal menu once real diff openers exist.
- Keep demo data only in tests or development-only sample code if needed.

## Non-goals

- Do not apply file changes in this story.
- Do not generate patches.
- Do not build git diff yet.
- Do not parse model output differently yet.

## Acceptance criteria

- [x] Real `DiffSession` / `DiffFileEntry` DTO exists.
- [x] Editor can render a real diff session, not only static demo data.
- [x] Multi-root grouping works from session data.
- [x] Header/menu no longer presents fake demo as product functionality.
- [x] Existing editor mode still works when no diff session is open.

## Key files

- `src/shared/diff-session-contract.ts`
- `src/renderer/src/components/EditorPane.tsx`
- `src/renderer/src/components/GroupedDiffDemo.tsx`
- `src/renderer/src/components/DiffEditorPane.tsx`
- `src/renderer/src/components/ProjectHeader.tsx`
- `src/renderer/src/App.tsx`
