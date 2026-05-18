# 021 — Header chrome: minimal branding

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` for density, hierarchy, and chrome vs content.

## Summary

**Clean up the top header** for day-to-day use: remove or reduce **branding / logos** in the main window chrome. Branding can remain on **first-run / empty project** screens if desired; reserve a proper **app logo** for when design assets exist.

## Scope

- Audit `ProjectHeader` (and related layout): strip logo marks, redundant titles, or marketing-style elements from the persistent header.
- Keep actions that are **actually wired** (or clearly disabled with rationale per **025**).
- Optional: splash / empty state carries identity instead of the in-project header.


Current, cluttered, header:

`Desktop/Screenshot 2026-05-10 at 8.19.56 PM.png`

Cleaner look we should go for:

`Desktop/Screenshot 2026-05-10 at 8.20.26 PM.png`

## Acceptance criteria

- [ ] In-project header is functional and quiet—no placeholder logo clutter unless intentional for empty states.
- [ ] Startup / no-project experience can still communicate “GrokForge” if product wants that (copy only is fine until logo exists).

## Key files

- `src/renderer/src/components/ProjectHeader.tsx`, parent layout in `App.tsx`.
