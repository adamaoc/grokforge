# 032 — "About GrokForge" menu item: define content & wire it

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` for modal patterns and dropdown items.

## Background

There is a `MoreHorizontal` (⋯) dropdown in `ProjectHeader.tsx` (top-right of the workspace shell). Open it and the **last item is "About GrokForge"** — currently rendered as a `<DropdownMenuItem disabled>` with no `onSelect`. It is a placeholder.

Story **025** kept the disabled stub (it satisfies the "no mystery clicks" rule because it is visibly disabled) but flagged it for investigation here.

## Summary

Decide what "About GrokForge" should show, then wire it up — or remove the menu item if the answer is "nothing worth a modal".

## Investigation questions

1. **What does the user expect from About?**
   - Common contents: app name, semver, build date / git SHA, runtime versions (Electron / Chromium / Node), copyright line, link to docs / repo / changelog.
2. **Where does GrokForge currently surface version info?**
   - `package.json` `version` is the source of truth. There is no current modal that reads it; the renderer would need either a new IPC (`get-app-version`) or to read from a build-time-injected constant in `electron.vite.config.ts`.
3. **Do we want a link to xAI / docs?**
   - We already say "Powered by Grok • xAI • 2026" in `ProjectWelcome`. About is a logical home for a docs/repo link if/when there is a public one.
4. **Does About need its own design or can it reuse the existing modal pattern from `ProjectHeader`'s agent-context preview?**
   - Likely reuse — keep the surface area small (one modal, no new shadcn primitives).

## Scope (proposed pending answers above)

- Either:
  - **(A) Implement**: small IPC `get-app-info` returning `{ name, version, electron, chromium, node }`; wire the dropdown item to a `AlertDialog` / inline modal styled to match the existing agent-context preview.
  - **(B) Remove**: drop the dropdown item until a real spec emerges.

## Acceptance criteria (if implementing path A)

- [x] About dialog opens from the `⋯` dropdown.
- [x] Shows app name, version (from `package.json`), Electron / Chromium / Node versions, and a short tagline.
- [x] Closes via Escape / outside click / Close button.
- [x] No new dependencies.

## Key files

- `src/renderer/src/components/ProjectHeader.tsx` (the disabled `DropdownMenuItem`)
- `src/main/main.ts` + `src/preload/preload.ts` (if a new IPC is required)
- `package.json` (version source)

## Notes

- Successor to **025**. Investigate first, then decide A vs B.

## Implementation notes (2026-05)

- Chose path **A**: implemented a small `get-app-info` IPC.
- `package.json` / Electron app metadata remains the version source via `app.getVersion()`.
- The About modal reuses the existing dark fixed-overlay dialog pattern from the agent context preview.
- The modal shows GrokForge tagline, app/runtime versions, platform/arch, and the app-storage/workspace-cleanliness note.

## Completion bookkeeping

When this story ships: update its **Status** line, the progress table in [`README.md`](README.md), and run **`npm run stories:html`** at the repo root so [`stories.html`](stories.html) stays in sync.
