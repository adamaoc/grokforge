# 095 — First project onboarding and agent primer

**Status:** Done (2026-05-18).

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` (`@styleguide-design`).

## Why this story exists

New users open a project and may not understand **workspace roots**, **agent proposals vs apply**, **plan vs fast mode**, or **voice handoff**. A short onboarding pass reduces “chatbot that breaks files” perception and sets expectations for diff review.

## Goals

1. **First open** of a workspace project (or first run ever): optional guided panel or modal—skippable, don’t block forever.
2. Cover (brief copy + links):
   - What a **root** is (multi-root differentiator).
   - Agent **proposes** edits; user **reviews diff** before Apply.
   - **Plan** vs **fast** mode at high level.
   - Voice → **Continue in agent chat** for file work.
3. Persist `grokforge.onboarding.v1` (or per-project flag) so dismiss sticks.
4. Optional: empty-state CTA in chat (“Try: describe a change in plain English”).

## Scope

- Renderer: [`ProjectWelcome.tsx`](../../src/renderer/src/components/welcome/ProjectWelcome.tsx) vs post-open shell—pick entry point.
- No main-process changes unless storing flag in app data preferred over `localStorage`.

## Acceptance criteria

- [ ] New users see onboarding once (or until dismissed) with roots + agent safety explained.
- [ ] Dismiss / “Don’t show again” works across restarts.
- [ ] Matches dark theme tokens and styleguide density.
- [ ] `npm run typecheck` passes.

## Related stories

- **[064](../064-launch-welcome-empty-state-and-command-affordances.md)**, **[025](../025-ui-controls-inventory-and-wiring.md)**.
- Agent reliability **082–084**.

## Completion bookkeeping

When implemented: mark **095** done, update [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
