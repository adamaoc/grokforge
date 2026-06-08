# 001 — Design tokens & Tailwind theme alignment

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` before changing styles.

## Summary

Codify existing visual choices (dark canvas, zinc panels, green accent, fonts) into **Tailwind `theme.extend`** and/or **CSS variables** in `src/renderer/src/index.css` so new work does not scatter one-off hex values.

## Why now

Stories **002–003** depend on a single source of truth for colors, radii, and font stacks.

## Scope

- Extend `tailwind.config.js` with `colors` (e.g. `gf.canvas`, `gf.accent`, `gf.accent-hover`) mapped to current hex values.
- Optionally mirror key tokens in `:root` for non-Tailwind consumers (e.g. Monaco wrapper).
- Replace a **small representative set** of hardcoded classes in 2–3 components (e.g. welcome CTA, chat user bubble) to use the new tokens as proof the theme works.

## Out of scope

- Full repo-wide class migration (follow-up PRs per feature).
- shadcn install (story **002**).

## Acceptance criteria

- [ ] New semantic color utilities are documented in `.cursor/skills/styleguide-design/SKILL.md` (Visual language table) or in a one-line comment block at top of `tailwind.config.js`.
- [ ] `npm run dev` still runs; no visual regression on welcome and loaded-project shell.
- [ ] No new `*` global CSS rules.

## Key files

- `tailwind.config.js`, `src/renderer/src/index.css`, sample components in `src/renderer/src/components/`.

## Completion bookkeeping

When this story ships: update its **Status** line, the progress table in [`README.md`](README.md), and run **`npm run stories:html`** at the repo root so [`stories.html`](stories.html) stays in sync.
