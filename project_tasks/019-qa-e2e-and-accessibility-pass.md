# 019 — QA: E2E smoke tests & accessibility pass

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` for focus order, contrast, and touch targets on new shadcn controls.

## Summary

Add **automated smoke coverage** for critical flows (open project, open file, save, send chat if API mocked) using **Playwright** with Electron launch config **or** lighter IPC-level tests—pick one approach and document.

## Scope

- CI-friendly script in `package.json`.
- A11y: keyboard nav for sidebar, chat input, voice toggle; aria labels on icon-only buttons; color contrast check on accent on zinc (fix if failing WCAG AA for text).

## Acceptance criteria

- [x] `npm run test:e2e` (or chosen name) runs locally headless.
- [x] Document how to run in `AGENTS.md` / `project_tasks/README.md`.
- [x] List of fixed a11y issues in PR description pattern (for agents: in story notes).

## A11y & QA notes (019)

**E2E approach (019):** Headless **`npm run test:e2e`** = **`npm run build`** + **Vitest** (`vitest.e2e.config.ts`) over `e2e/*.test.ts` — asserts **`dist/`** artifacts exist and exercises **`run-command-policy`** (imported in tests for the agent spawn path; no human `run-command` IPC). Full **Playwright + Electron** UI drive is left for a follow-up when CI display / harness is finalized; the renderer load fix (**`ELECTRON_RENDERER_URL`** vs built `dist/renderer`) makes unpackaged runs viable for that path.

**A11y fixes in this pass**

- **Sidebar:** settings icon button — `aria-label` + `type="button"`; settings icon `aria-hidden`.
- **Voice bar:** mic toggle — `type="button"`, `aria-label`, `aria-pressed`; decorative mic icons `aria-hidden`. Speakers stub — `aria-label`, `disabled`, `type="button"`.
- **Search results:** inline match highlight on tiny mono text — `text-gf-accent` → **`text-emerald-300`** for better contrast on zinc (WCAG AA for small text); comment in `index.css` on when to use brand green vs emerald.
- **Terminal panel:** clear / close icon buttons — explicit **`aria-label`** (in addition to `title`).

## Key files

- `package.json` (`test:e2e`), `vitest.e2e.config.ts`, `e2e/*.test.ts`, `e2e/README.md`, renderer/main tweaks for a11y and dev-server detection.

## Completion bookkeeping

When this story ships: update its **Status** line, the progress table in [`README.md`](README.md), and run **`npm run stories:html`** at the repo root so [`stories.html`](stories.html) stays in sync.
