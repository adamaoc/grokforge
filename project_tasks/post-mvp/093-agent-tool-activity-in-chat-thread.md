# 093 — Agent transparency: tool activity in chat thread

**Status:** Done (2026-05-18).

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` (`@styleguide-design`).

## Why this story exists

Story **061** ships a **developer** turn trace inspector (header/thread menu). Normal users—and **plan mode** users—benefit from seeing **which tools ran** (`search_workspace`, `read_file`, `propose_file_edits`) inline without opening a debug panel. This builds trust and teaches what the agent actually did.

## Goals

1. Promote compact **activity rows** (existing `agent-chat-event` activity phase) into default thread UX—not hidden behind debug.
2. Per turn: icon + label + status (running/done/error) + optional one-line detail (path, match count).
3. **Plan mode:** show tool use during planning vs execution phases distinctly (align **062** / **065**).
4. Do not leak secrets, full file bodies, or API keys in activity text.

## Scope

- Renderer: [`ChatThread.tsx`](../../src/renderer/src/components/ChatThread.tsx), activity components, plan banner.
- Optional: default-expand last turn’s tools; collapse older turns.

## Non-goals

- Replacing **061** trace export (keep for power users).

## Acceptance criteria

- [x] Typical agent turn shows tool steps in the chat transcript without opening trace inspector.
- [x] Planning turns surface read/search activity when tools run.
- [x] `npm run typecheck` passes; manual check on search + propose flow.

## Related stories

- **[061](../061-agent-debugging-telemetry-and-turn-replay.md)**, **[065](../065-launch-agent-thread-context-and-model-visibility.md)**.
- **[091](091-agent-proactive-workspace-exploration.md)**.

## Completion bookkeeping

When implemented: mark **093** done, update [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
