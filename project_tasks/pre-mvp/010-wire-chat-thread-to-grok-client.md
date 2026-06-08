# 010 — Wire Agent Thread to Grok client + system prompt from manifest

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` for chat bubbles, thinking state, and input layout.

## Summary

Replace `ChatThread`’s **`setTimeout` mock** with the real streaming pipeline from **009**. Inject **system** content assembled from **008** (project name, roots summary, instructions, always-include file excerpts within token budget placeholder).

## Scope

- Message list: user + assistant roles; append streaming assistant text incrementally.
- “Thinking” indicator tied to stream lifecycle.
- Model selection: start with `models.default` or `planning`—document rule in code.
- Mic / attach buttons remain UI-only or noop with tooltip until voice/attachments exist.

## Acceptance criteria

- [x] Sending a message hits real API in dev when env configured; graceful degrade message when not.
- [x] No duplicate sends on double Enter; input clears on successful send start.
- [x] System prompt includes at least: project name, root labels + paths, custom instructions.

## Key files

- `src/renderer/src/components/ChatThread.tsx`, preload, main Grok module, context builder from **008**.

## Completion bookkeeping

When this story ships: update its **Status** line, the progress table in [`README.md`](README.md), and run **`npm run stories:html`** at the repo root so [`stories.html`](stories.html) stays in sync.
