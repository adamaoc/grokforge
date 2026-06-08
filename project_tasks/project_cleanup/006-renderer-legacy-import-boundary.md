# 006 - Reduce Renderer Imports From harness-support

## Goal

Stop active renderer components from depending directly on legacy
`harness-support` internals where a stable shared contract or renderer adapter
would be cleaner.

## Why

The renderer still imports several old harness-support modules for plan parsing,
proposal batches, safety warnings, markdown normalization, failed-edit display,
and tool fences. Some of that is unavoidable during compatibility, but direct
imports make legacy code feel like current UI architecture.

## Scope

Audit renderer imports from `harness-support`, especially in:

- `src/renderer/src/types.ts`
- `src/renderer/src/components/chat-thread/`
- `src/renderer/src/lib/`
- proposal/diff UI components

For each import, decide:

- keep temporarily and document why
- move type/contract to `src/shared/<concept>/`
- create a renderer adapter under `src/renderer/src/lib/`
- move old-only behavior under a legacy adapter name

## Guardrails

- Do not break compatibility with existing persisted chat lines.
- Do not delete harness-support behavior that active UI still needs.
- Prefer small adapter moves over sweeping contract rewrites.
- Keep shared modules free of Electron/Node APIs.

## Acceptance Criteria

- Renderer direct imports from `harness-support` are fewer and more intentional.
- Any remaining direct imports are compatibility-only and easy to identify.
- New renderer-facing contracts live under `src/shared/` or renderer `lib/`.
- `npm run typecheck` passes.
- `npm run test` passes.

## Nice To Have

- Add a short note to `src/shared/README.md` or `src/renderer/src/lib/README.md`
  explaining where renderer-facing agent/proposal contracts should live.
