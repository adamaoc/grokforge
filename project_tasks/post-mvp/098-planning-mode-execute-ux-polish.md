# 098 — Planning mode: explicit plan → approve → execute UX

**Status:** Post-MVP backlog.

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` (`@styleguide-design`).

**Depends on:** **[097](097-model-routing-planner-vs-executor.md)** (show real model per phase); **[104](104-agent-profiles-and-toolsets.md)** (planner vs executor labels). **Recommended after [101](101-greenfield-plan-quality.md)** for richer plan card content.

**Does not step on:** **[101](101-greenfield-plan-quality.md)** (prompts only) — this story is **renderer UX** only.

## Why this story exists

**062** + **069** shipped structured plans and **Approve and run**. Users still see one opaque chat stream. The harness **works** but the **cockpit** does not communicate RPI phases: Planning → Approved → Executing → Done.

Reference: Cursor Plan Mode UX; [`docs/i-am-a-harness.md`](../../docs/i-am-a-harness.md) prioritized backlog (RPI + **098**).

## Goals

### 1. Plan card hierarchy (`PlanModeCard.tsx`)

- Scannable **steps** (title + one-line detail).
- **Files likely touched** (from `gf-plan` if present; else “Unknown until execute”).
- **Risks / verification** section when plan JSON includes them (**101** may add fields).
- Collapsed raw JSON behind “Details” disclosure.

### 2. Phase stepper / badges

States (persist per plan id in `plan-interaction-storage.ts` or extend):

| State | When | UI |
| --- | --- | --- |
| `planning` | Plan mode turn in flight | Accent pulse on composer mode |
| `pending` | Valid `gf-plan`, not approved | Approve / Cancel |
| `approved` | User approved, before run | “Ready to run” |
| `executing` | **069** auto-run stream active | Stepper + cancel |
| `done` | Turn `done` without error | Checkmark |
| `failed` | Turn error or missing plan toast (**099**) | Error styling |

### 3. Execution phase UX

- Bind **093** tool activity under executing plan: “Step 2 of 5” optional if plan steps map to tool batches (best-effort).
- Show **model + harness phase** from **097** metadata: e.g. `Executing with grok-code-fast-1 (executor profile)`.
- **Approve and run** disabled while `executing`; re-enable on `done` / `error`.

### 4. Copy alignment

- Match **069** synthetic user line behavior (do not duplicate full plan in card).
- Remind: command/edit approvals still required.

## Non-goals

- Changing `gf-plan` schema (unless **101** adds fields — consume only).
- Runner routing logic (**097**).
- Autonomous multi-step loops without checkpoints.
- Plan files on disk (**109**).

## Key files

- `src/renderer/src/components/PlanModeCard.tsx`
- `src/renderer/src/components/ChatThread.tsx`
- `src/renderer/src/lib/plan-interaction-storage.ts`
- `src/shared/agent-chat-contract.ts` (event types if needed)

## Testing

- Manual script in PR: plan → approve → run → see executing → done.
- Optional component test for stepper state transitions with mocked events.

## Acceptance criteria

- [ ] User can distinguish plan vs execution phase without reading raw JSON.
- [ ] Executing state visible from approve-and-run until turn completes.
- [ ] Model/profile label shown during execute when **097** metadata present.
- [ ] `npm run typecheck` passes.

## Related stories

- **[062](../062-agent-planning-and-multi-step-workflow.md)**, **[069](../069-plan-approve-auto-agent-turn.md)**, **[093](093-agent-tool-activity-in-chat-thread.md)**, **[099](099-plan-mode-final-contract-and-toast.md)**.

## Completion bookkeeping

When implemented: mark **098** done, update [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
