# 089 — Agent edits: Safe vs Power mode

**Status:** Closed (2026-05-18). Product decision: no Safe vs Power edit-mode toggle; keep a single strict default (read-before-write, safety warnings, prefer `search_replace`) plus existing **Agent file writes** confirm vs auto-apply.

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` for Settings UI (`@styleguide-design`).

## Why this story exists

Power users sometimes want **full-file rewrites**; most sessions need **safe defaults** (read-before-write, prefer `search_replace`, stronger warnings). A persisted mode avoids one-size-fits-all prompting.

## Goals

| Mode | Behavior (target) |
|------|-------------------|
| **Safe** (default) | Enforce **082**; prefer **085** `search_replace`; stricter **084** warnings; optional confirm on large shrink. |
| **Power** | Allow full `write_file` without read gate for existing files (or softer warning only); full rewrites permitted. |

Persist in renderer `localStorage` (e.g. `grokforge.agentEditMode.v1`) and pass to main on `agent-chat-start` so tool policy is consistent.

## Scope

- **Settings → Agent** (or existing agent writes section): toggle + short copy.
- Main: read mode flag in agent runner env; branch validation rules.
- Document interaction with **`grokforge.agentWritesMode`** (manual / auto_apply).

## Acceptance criteria

- [ ] Safe and Power modes persist across restarts.
- [ ] Safe mode enables read-before-write enforcement when **082** is implemented.
- [ ] Power mode documented in UI as higher risk.
- [ ] `npm run typecheck` passes.

## Related stories

- **[082](082-agent-edit-require-read-before-write.md)**, **[085](085-agent-search-replace-tool.md)**, **[084](084-agent-edit-pre-apply-safety-warnings.md)**.

## Completion bookkeeping

Closed without implementation. Related behavior ships via **082**, **084**, **085**, and Settings **Agent file writes** (`batch_confirm` / `auto_apply`) instead.
