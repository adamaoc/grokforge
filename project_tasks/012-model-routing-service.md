# 012 — Model routing (planning vs execution vs reasoning vs voice label)

**Design skill:** Minimal unless adding a model picker UI—then follow skill.

## Summary

Centralize **which Grok model** is used for each intent: planning step, fast edits, deep reasoning, voice companion text if applicable. Read from `manifest.models` with **sane defaults** if keys missing (validate manifest already).

## Scope

- Small `modelRouter.ts` (main or shared) with functions `getModelForIntent(intent)`.
- Integrate with **010** so chat can later switch intent per message or per agent phase (start simple: user toggle or internal constant).
- Log chosen model to console in dev for debugging.

## Acceptance criteria

- [x] Single place lists intents → manifest keys; documented in `AGENTS.md` one paragraph.
- [x] Chat uses router for at least two distinct intents (e.g. default vs planning).
- [x] Voice model id still available to **013** without duplicating manifest reads.

## Key files

- New small module + `ChatThread.tsx` / Grok client caller.
