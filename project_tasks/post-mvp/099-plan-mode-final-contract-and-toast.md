# 099 — Plan mode: final-answer contract and missing-plan toast

**Status:** Done (2026-05-18).

**Design skill:** N/A (main agent loop + toast copy in renderer).

## Why this story exists

Plan mode required a manual user hint (`gf-plan` fence) when the user said “create” or “build,” because the generic **final response contract** told the model to emit `grokforge-agent-tools` instead of `gf-plan`.

## Goals

1. When `chatMode === 'plan'`, the final streaming contract requires **`gf-plan`** only and forbids edit proposals on that turn.
2. When a Plan mode turn completes without a valid `gf-plan`, show an actionable toast.
3. Increase `streamFinalAnswer` `max_tokens` so plan JSON is less likely to truncate.

## Scope

- [`src/shared/agent-final-answer-contract.ts`](../../src/shared/agent-final-answer-contract.ts) — `buildFinalAnswerContract`
- [`src/main/agent-runner.ts`](../../src/main/agent-runner.ts) — pass `chatMode` into contract
- [`src/main/agent-chat-model-transport.ts`](../../src/main/agent-chat-model-transport.ts) — `max_tokens: 4096` on final stream
- [`src/renderer/src/components/ChatThread.tsx`](../../src/renderer/src/components/ChatThread.tsx) — missing-plan toast on `done`

## Acceptance criteria

- [x] “Create a todo app, let’s plan” does not inject edit-fence final contract.
- [x] Plan mode `done` without valid plan shows toast.
- [x] Unit tests for plan vs fast contract strings.
- [x] `npm run typecheck` and `npm run test` pass.

## Related stories

- **[062](../062-agent-planning-and-multi-step-workflow.md)**, **[069](../069-plan-approve-auto-agent-turn.md)**
- **[101](101-greenfield-plan-quality.md)** — follow-up (prompts only)

## Completion bookkeeping

When shipped: update this **Status**, [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
