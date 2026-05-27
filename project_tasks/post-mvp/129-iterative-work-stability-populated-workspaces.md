# 129 — Iterative work stability (populated workspaces)

**Status:** Done (2026-05-26).

**Design skill:** N/A (harness + activity UX); optional renderer touch per [`125`](125-agent-turn-activity-clarity-and-chat-vertical-space.md).

## Why this story exists

**Dogfood (2026-05-26, Scaffold-Test Vite app):** After greenfield/scaffold quality improved (**127** / **128**), **Work-mode** feature edits on existing projects showed repeated **“Planning tool step stopped”** rows, turn **timeouts** mid-discovery, and no edit proposal despite reasonable prompts.

**120** fixed post-plan incremental follow-ups; this story targets **populated repos without a fresh plan** (e.g. `npm create` Vite tree + “replace home with task app”).

## Goals

1. **Activity honesty:** Per tool_sample round completes as **Work tool round** (not “Planning”); only still-`running` rows become stopped on error.
2. **Turn budget:** Adaptive turn timeout from tool-round cap; **interrupted** receipt + pending-proposal hint when timeout fires after `edit_proposal`.
3. **Executor routing:** Populated workspace + edit-intent Work → **executor** + **execution** model (no forced `gf-plan`).
4. **Discovery cap:** Harness appendix + one-shot **discovery saturation** nudge after excessive read-only rounds.
5. **Safety net:** Default profile tool_sample **8192** tokens; trim thread snapshot on populated edit turns.

## Non-goals

- Replacing Plan mode or **120** post-plan routing.
- Full thread summarization / multi-turn memory rewrite.

## Scope

- [`src/shared/populated-workspace-edit.ts`](../src/shared/populated-workspace-edit.ts)
- [`src/shared/agent-turn-routing.ts`](../src/shared/agent-turn-routing.ts), [`src/shared/agent-profile.ts`](../src/shared/agent-profile.ts)
- [`src/shared/agent-harness-profile.ts`](../src/shared/agent-harness-profile.ts), [`src/shared/agent-final-answer-contract.ts`](../src/shared/agent-final-answer-contract.ts)
- [`src/main/agent-runner.ts`](../src/main/agent-runner.ts)
- [`src/renderer/src/components/ChatThread.tsx`](../src/renderer/src/components/ChatThread.tsx)
- [`src/shared/agent-activity-display.ts`](../src/shared/agent-activity-display.ts)
- Eval: [`src/main/agent-runner-evaluation.test.ts`](../src/main/agent-runner-evaluation.test.ts) (`routing:existing_project_no_replan`)

## Acceptance criteria

- [x] Eval: populated repo + incremental edit message → **executor** + `POPULATED_WORK_EDIT_MARKER` in system prompt.
- [x] Work tool round activities mark **done** per round; error clear affects only `running` rows.
- [x] `resolveAgentTurnTimeoutMs` scales with max tool iterations (cap 10m).
- [x] Timeout after proposal → interrupted receipt + user-visible pending-diff hint.
- [x] `npm run test:agent-eval` and unit tests for populated-work routing pass.

## Related

- **[120](120-post-plan-executor-routing-and-single-file-edits.md)**, **[125](125-agent-turn-activity-clarity-and-chat-vertical-space.md)**, **[127](127-greenfield-project-scaffolding-and-initialization.md)**, **[128](128-greenfield-scaffold-strategy-routing.md)**

## Completion bookkeeping

When shipped: update **Status**, [`README.md`](../README.md) post-MVP table, [`docs/harness-roadmap.md`](../../docs/harness-roadmap.md), run **`npm run stories:html`**.
