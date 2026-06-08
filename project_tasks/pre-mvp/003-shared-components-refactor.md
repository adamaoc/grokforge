# 003 — Shared components & small-file structure

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` before implementing.

## Summary

Refactor the renderer into **small, focused files** and **reusable primitives** (layout panels, icon buttons, status badges, gradient logo tile). Prefer shadcn from **002** for interactive controls; use local wrappers when GrokForge-specific styling is needed.

## Scope

- Audit `src/renderer/src/components/*.tsx` for duplicated patterns (rounded headers, mono badges, bordered empty states).
- Extract shared pieces under e.g. `src/renderer/src/components/ui/grokforge/` or next to shadcn `ui/` with clear names: `AppLogo`, `PanelHeader`, `ModelBadge`, `RootTypeDot`, etc.
- Split oversized files only where it improves clarity (target &lt; ~150 lines per file where reasonable).
- Ensure imports use `@/` or `@components/` aliases consistently.

## Out of scope

- Changing behavior of IPC, chat simulation, or file tree mock data.
- New product features.

## Acceptance criteria

- [ ] At least **three** reusable components extracted and used in **two** call sites each (or documented as single-use primitives in `ui/` if truly unique).
- [ ] No circular import chains; barrel files optional, not required.
- [ ] Visual parity: screenshots or manual check of welcome, sidebar, chat, editor empty state.
- [ ] `styleguide-design` skill updated if new canonical patterns emerge.

## Key files

- `App.tsx`, `Sidebar.tsx`, `ChatThread.tsx`, `EditorPane.tsx`, `ProjectHeader.tsx`, `VoiceControls.tsx`.

## Completion bookkeeping

When this story ships: update its **Status** line, the progress table in [`README.md`](README.md), and run **`npm run stories:html`** at the repo root so [`stories.html`](stories.html) stays in sync.
