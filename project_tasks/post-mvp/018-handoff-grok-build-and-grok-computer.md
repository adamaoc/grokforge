# 018 — Hand-off to Grok Build / Grok Computer

> **Queue:** Post-MVP — this file lives in `project_tasks/post-mvp/` so MVP work stays in the numbered root queue. See `project_tasks/README.md`.

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` for menu items, dialogs, and external-link affordances.

## Summary

Add **explicit hand-off** flows from GrokForge to official xAI tools where useful: e.g. “Open in Grok Build” with current root path(s) or deep link scheme if documented; “Send to Grok Computer” with clipboard payload or URI. Exact mechanics depend on public APIs / URL schemes—**stub with TODO + config** if not stable.

## Scope

- Project settings or header overflow menu entries.
- Use `shell.openExternal` in main via IPC for HTTPS links only.
- Document in `AGENTS.md` what is placeholder vs verified.

## Acceptance criteria

- [ ] User can trigger at least one hand-off action that opens a browser or app without silent failures.
- [ ] No arbitrary URL from web content—only curated templates.

## Key files

- `ProjectHeader.tsx` or new menu component, `main.ts` (`shell` already imported).
