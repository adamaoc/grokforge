# 011 — Persist chat threads per project

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` for any history sidebar or thread picker UI.

## Summary

Persist the agent conversation **per `.grokproject` / project id** so reopening the workspace restores history. Prefer **append-only JSONL** or sqlite under the project root or app userData; document tradeoff and pick one.

## Scope

- Schema for messages (id, role, content, timestamp, model, optional attachments).
- IPC: `load-thread`, `append-message`, `clear-thread` (optional).
- Load on successful `open-project`; auto-save on new messages (debounced).
- Migration story for schema v1 → v2 (stub OK if only v1).

## Acceptance criteria

- [x] Kill app and relaunch: messages still present for same opened folder.
- [x] Different projects do not share thread storage.
- [x] Corrupt file handled without crash (reset + toast).

## Key files

- `src/main/main.ts`, new `src/main/chat-store.ts`, preload, `App.tsx` / `ChatThread.tsx`.

## Completion bookkeeping

When this story ships: update its **Status** line, the progress table in [`README.md`](README.md), and run **`npm run stories:html`** at the repo root so [`stories.html`](stories.html) stays in sync.
