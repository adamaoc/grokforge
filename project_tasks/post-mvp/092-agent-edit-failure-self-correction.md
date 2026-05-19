# 092 — Agent edits: failure feedback and self-correction

**Status:** Done (2026-05-18).

**Design skill:** N/A (agent loop); optional toast copy in renderer.

## Why this story exists

When a proposal is **rejected**, **apply fails**, or **conflict** occurs (**047**), the model often does not see structured feedback on the next turn. Users want the agent to **read the error** and propose a fixed edit without re-explaining the whole task.

## Goals

1. On apply failure / conflict / discard-after-review, append a **compact system or tool-result message** to the thread (or in-memory turn context) with:
   - failure reason
   - paths affected
   - hint to re-read file and retry
2. Optional **“Fix proposal”** user action that sends a one-shot follow-up: “Previous edit failed: … Re-read and propose a corrected edit.”
3. Wire into **`agent-chat-start`** so the next turn has failure context without user retyping.

## Non-goals

- Autonomous multi-retry loops without user approval (see **090**).

## Scope

- Main: `agent-tools.ts` result shaping; chat persistence of failure events (bounded).
- Renderer: [`ChatThread.tsx`](../../src/renderer/src/components/ChatThread.tsx) actions on failed apply.

## Acceptance criteria

- [x] Apply/conflict errors are visible to the agent on the subsequent turn (persisted or turn-scoped).
- [x] User can trigger a “fix it” follow-up from the proposal/diff UI.
- [x] Vitest for failure payload shape; manual apply-conflict → retry flow.
- [x] `npm run typecheck` passes.

## Related stories

- **[047](../047-diff-apply-discard-and-conflict-safety.md)**, **[088](088-agent-edit-regenerate-proposal.md)**.
- **[091](091-agent-proactive-workspace-exploration.md)**.

## Completion bookkeeping

When implemented: mark **092** done, update [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
