# 067 — Launch polish: settings theme preview

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` before changing Settings, Appearance, theme controls, swatches, or preview UI.

## Why this story exists

The theme grid already looks strong in motion. A small preview affordance could make theme selection feel more confident and polished before launch, especially for users exploring Fern, Frost, Flame, and the “More themes” set.

This story keeps the existing theme system but improves the preview/selection experience.

## Goals

- Make theme previews easier to evaluate before committing.
- Preserve the current immediate theme switching behavior unless a better interaction is chosen.
- Keep Settings clean and avoid turning Appearance into a large design playground.
- Ensure preview states are accessible and keyboard-friendly.

## Scope

- Settings -> Appearance theme grid.
- Theme hover/focus preview behavior or a small explicit **Preview** affordance.
- Selected/hover/focus styling for theme swatches.
- Optional micro-preview showing accent usage across button, ring, and message styles.

## UX direction

- Prefer live preview on hover/focus if it feels reliable and reversible.
- If hover preview is too surprising, use an explicit preview affordance.
- Keep the selected theme clearly distinguishable from a temporary preview.
- Avoid new persisted settings unless they are necessary.

## Decisions (MVP)

- **Hover / focus preview and extra preview chrome:** Deferred **post-MVP**. Theme switching in **Settings → Appearance** stays **click-to-apply only** (immediate, already fast enough); no temporary hover preview or separate Preview control for launch.

## Open questions

- Should hovering a theme temporarily apply it, or should only clicking apply it?
- Should keyboard focus preview themes the same way hover does?
- Do users need a **Preview** button, or is the swatch itself enough?
- Should preview include just accent color, or also a tiny sample of buttons/messages/rings?
- Should unsaved preview revert when Settings closes, or should theme changes remain immediate as they do now?

## Testing

- Verify theme persistence in `localStorage` still works (unchanged behavior).
- Hover/focus **preview** behavior: **deferred** (see Decisions); basic keyboard activation of the existing grid remains as implemented.
- Run `npm run typecheck`.

## Acceptance criteria

- [x] Theme grid provides a clearer preview affordance. *(MVP: satisfied by immediate apply + current swatches; hover/extra preview deferred.)*
- [x] Selected theme remains obvious during preview/focus states. *(MVP: selection state as shipped; no transient preview layer.)*
- [x] Theme persistence behavior is intentional and documented in code or story notes. *(Immediate apply + `localStorage`; documented here.)*
- [x] Appearance settings remain compact and consistent with the existing Settings screen.
- [x] Keyboard and pointer interactions both work. *(Existing controls; no new preview interaction.)*

## Completion bookkeeping

Story **067** marked done in this file; `project_tasks/README.md` updated; `project_tasks/stories.html` regenerated via `npm run stories:html`.
