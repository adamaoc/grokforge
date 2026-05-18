# 002 — shadcn/ui baseline (dark GrokForge theme)

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` before implementing.

## Summary

Add **shadcn/ui** (Radix + Tailwind) to the renderer with components configured for **dark-first** GrokForge: zinc neutrals, green primary actions, `rounded-2xl` feel consistent with existing screens.

## Why after 001

Theme tokens from **001** should map to shadcn CSS variables (`--background`, `--primary`, `--border`, etc.) in one place.

## Scope

- Initialize shadcn for the Vite + React renderer (follow current shadcn + Tailwind v3 docs; project uses Tailwind 3.4).
- Install a minimal set: `Button`, `Input`, `ScrollArea`, `Tabs`, `Tooltip`, `DropdownMenu` (adjust list if init wizard differs—keep set minimal).
- Map shadcn theme variables to GrokForge tokens so default components match the skill table.
- Replace **one** high-traffic primitive (e.g. chat text `input` + send `button` in `ChatThread.tsx`) with shadcn to validate wiring.

## Out of scope

- Refactoring every screen (story **003**).
- Tailwind v4 upgrade (separate future story if desired).

## Acceptance criteria

- [ ] `components.json` (or current shadcn config) lives under renderer or repo root per official pattern; path aliases work with `@/`.
- [ ] Dark mode is default; no flash of light chrome.
- [ ] One migrated control proves focus rings and keyboard access.
- [ ] `npm run typecheck` passes.

## Key files

- `src/renderer/`, `tailwind.config.js`, `package.json`, new `src/renderer/src/components/ui/*`.
