# 097 — Runner phase routing: planner vs executor model intents

**Status:** Done (2026-05-19).

**Design skill:** N/A (manifest + `model-router`; Settings copy for model slots recommended).

**Depends on:** **[102](102-dual-model-manifest-and-harness-foundation.md)**, **[103](103-agent-harness-per-model-profiles.md)**, **[104](104-agent-profiles-and-toolsets.md)**.

**Blocks:** **[098](098-planning-mode-execute-ux-polish.md)** (UI should show resolved model + phase).

## Why this story exists

**012** maps product intents to manifest slots. **069** already starts approve-and-run with `modelIntent: 'execution'`. Gaps remain:

- Renderer **model chip** (`chat_default` / `planning`) can disagree with **composer Plan mode** + runner intent.
- Tool-loop **rounds** may all use the model id passed at turn start even when phase shifts (plan investigation vs edit execution).
- No single **source of truth** in main for: `chatMode` + trigger → `ModelIntent` → `modelId` → `harnessProfileKey`.

**Dual-model strategy (**102**):** planning turns should resolve to **`grok-4.3`**; execution-heavy turns to **`grok-code-fast-1`** — each with matching harness profile (**103**).

## Goals

### 1. `resolveAgentTurnRouting()` (shared)

`src/shared/agent-turn-routing.ts` input:

| Input | Source |
| --- | --- |
| `chatMode` | `fast` \| `plan` |
| `modelIntentOverride` | renderer chip (optional) |
| `isApprovedPlanAutoRun` | **069** synthetic execute |
| `hasEditToolCallsThisTurn` | runner scratch (optional v1) |

Output:

```ts
{
  modelIntent: ModelIntent
  modelId: string
  harnessProfileKey: HarnessProfileKey
  agentProfileId: AgentProfileId  // from 104
}
```

**Rules (v1 — two axes):**

**Model intent** (`resolveAgentChatModelIntent`):

| Priority | Condition | `modelIntent` |
| --- | --- | --- |
| 1 | `isApprovedPlanAutoRun` | `execution` |
| 2 | Renderer `modelIntent` chip (fast or plan) | as sent |
| 3 | `chatMode === 'plan'` (no chip) | `planning` |
| 4 | else | `chat_default` |

**Agent profile** (`resolveAgentProfileId`):

| Condition | `agentProfileId` |
| --- | --- |
| `chatMode === 'plan'` | `planner` |
| `isApprovedPlanAutoRun` or `modelIntent === 'execution'` (fast) | `executor` |
| else | `default` |

Plan mode + Fast chip → planner profile + `models.default`. UI stepper: **098**.

### 2. Main owns resolution

- **`agent-chat-start` handler** — Recompute routing in main from `activeContext`; do not trust renderer `model` string alone (accept as hint only during migration).
- **Each tool-loop round** — Re-call resolver if phase flags change (minimal v1: fixed for whole turn except auto-run flag set at start).

### 3. Logging and UI

- Emit `AgentChatEvent` `turn_meta` or extend `turn_start` with `{ modelIntent, modelId, harnessProfileKey, agentProfileId }`.
- Renderer (**065**): show “Planning · grok-4.3” vs “Executing · grok-code-fast-1” during **098** stepper.

### 4. Settings copy

- Explain manifest slots: **Planning model** (deeper), **Execution model** (fast edits), **Default chat**, **Voice**, **Reasoning**.
- Note xAI retirement/redirect for fast id with link to **102** investigation notes.

## Non-goals

- Defining harness profile content (**103**).
- Filtering tools (**104**).
- New xAI SKUs or dynamic discovery.
- Subagent routing (**112**).

## Key files

- `src/shared/agent-turn-routing.ts`, tests
- `src/main/agent-runner.ts`, `src/main/main.ts` (IPC)
- `src/renderer/src/components/ChatThread.tsx` — consume turn meta; simplify chip to override/advanced
- `AGENTS.md`

## Testing

- Unit: plan mode → `planning` + `grok_4_3` profile key (with default manifest fixture).
- Unit: auto-run → `execution` + `grok_code_fast` profile key.
- Unit: renderer override chip changes intent when sent.
- Manual: approve and run → network/log shows execution model, not planning.

## Acceptance criteria

- [x] Main process resolves `modelIntent` + `modelId` + profile keys per turn from documented rules.
- [x] Approve-and-run always uses `execution` intent (regression for **069**).
- [x] Plan mode defaults to `planning` intent; chip override honored in plan mode.
- [x] Turn metadata visible in dev logs (`turn_started.routing`).
- [x] `AGENTS.md` documents mapping table.
- [x] `npm run typecheck` and `npm run test` pass.

## Related stories

- **[012](../012-model-routing-service.md)**, **[062](../062-agent-planning-and-multi-step-workflow.md)**, **[069](../069-plan-approve-auto-agent-turn.md)**.
- **[102](102-dual-model-manifest-and-harness-foundation.md)**, **[103](103-agent-harness-per-model-profiles.md)**, **[104](104-agent-profiles-and-toolsets.md)**.
- Closed epic **[090](090-agent-edit-architecture-v2.md)** theme E — delivered here + **103**.

## Completion bookkeeping

When implemented: mark **097** done, update [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
