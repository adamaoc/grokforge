# 062 — Agent planning and multi-step workflow

**Status:** Done (v1 shipped).

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` before changing chat mode controls, plan UI, approval flows, task lists, or agent activity displays.

## Shipped (v1)

- **Two axes:** **Chat / Plan** conversation mode is a segmented control **above the composer** (`ChatThread.tsx`); it is the **only** source of `activeContext.chatMode` for `agentChatStart`. The header **Fast | planning model** chip picks `models.default` vs `models.planning` only — it no longer sets `chatMode`.
- **Persistence:** Conversation mode per project: `localStorage` key `grokforge.conversationMode.v1:<projectId>` (`conversation-mode-storage.ts`). Plan approve / cancel / step checkboxes: `grokforge.planInteraction.v1:<projectId>` (`plan-interaction-storage.ts`). Clearing chat clears plan interaction storage for that project.
- **Structured plan:** Shared Zod + helpers in `src/shared/gf-plan-contract.ts` (fence id **`gf-plan`**). Renderer strips the fence from markdown and renders **`PlanModeCard`** (`src/renderer/src/components/PlanModeCard.tsx`).
- **Agent instructions:** When `chatMode === 'plan'`, `buildInitialMessages` in `src/main/agent-runner.ts` appends plan-mode system text requiring one valid `` `gf-plan` `` JSON fence in the final answer.
- **Revise path:** Sending a new user message calls `supersedePendingPlansBeforeNewUserMessage` so earlier **pending** plans show **Superseded**.
- **Tests:** `src/shared/gf-plan-contract.test.ts`.

**Deferred:** Auto-start agent turn on approve → **[069 — Plan approve triggers agent execution](069-plan-approve-auto-agent-turn.md)** (Option B).

## Why this story exists

The agent thread should support a workflow where it investigates, presents a scoped plan, lets the user approve or revise, then executes in controlled steps with visible progress—without feeling like a model spraying changes.

## Locked product decisions (stakeholder)

1. **After Approve plan — v1:** **Option A** — approval updates UI + persistence; the **user sends the next message** to drive execution. **Option B** is **[069](069-plan-approve-auto-agent-turn.md)**.
2. **Structured plan payload:** Fenced **`gf-plan`** JSON in assistant `content` (Zod in shared contract).
3. **Checklist progression:** Manual step checkoffs v1 (`PlanModeCard`).
4. **Revise / cancel:** Revise = follow-up user message (supersedes pending plans). Cancel = local state on the card.
5. **Plan vs model:** Orthogonal controls — composer **Chat | Plan** vs header model chip.

## Goals

- Make planning a real agent workflow, not model selection.
- Allow the agent to gather context, propose an implementation plan, and wait for approval.
- Track multi-step progress inside the chat thread.
- Keep execution steps user-governed: reads/search can happen automatically in agent turns; commands/edits keep existing approvals.

## Proposed workflow

1. User sets **Plan** mode (composer), then sends a message.
2. Agent may use read/search tools to investigate.
3. Assistant message includes a structured **`gf-plan`** block rendered as **PlanModeCard**.
4. User can **approve**, **revise** (next message), or **cancel**.
5. Approved plan shows a **checklist** with manual checkoffs.
6. Command/edit tools keep normal approvals (unchanged).

## UI requirements

- **Chat | Plan** with the composer; model chip separate in header.
- Plan cards compact in the chat column.
- Approve does not bypass command/edit safety.

## Agent contract

- Fence: **`gf-plan`** (distinct from `grokforge-agent-tools`).
- Persisted as assistant `content` in `thread.jsonl` v1; plan UI state in `localStorage` (checklist not in JSONL v1).

## Testing

- [x] Plan mode adds main-process instructions; model can emit `gf-plan` when Plan is on.
- [x] Approve / cancel / supersede on new message behave predictably.
- [x] Chat JSONL unchanged schema; `gf-plan` is plain string content.
- [x] Command/edit flows unchanged.

## Acceptance criteria

- [x] **Chat | Plan** is composer-adjacent and is the **sole** source of `chatMode` for the agent (decoupled from the model picker).
- [x] Plan mode produces a structured, reviewable plan card (from `gf-plan` JSON).
- [x] Users can approve, revise (supersede), or cancel per semantics.
- [x] Approved plans show step checklists (manual checkoffs v1).
- [x] Planning uses normal tool loop (read/search without auto-apply edits).
- [x] Plan approval does not skip command/edit approval boundaries.

## Related

- **[069 — Plan approve triggers agent execution](069-plan-approve-auto-agent-turn.md)** — Option B.

## Completion bookkeeping

When this story ships: update its **Status** line, the progress table in [`README.md`](README.md), and run **`npm run stories:html`** at the repo root so [`stories.html`](stories.html) stays in sync.
