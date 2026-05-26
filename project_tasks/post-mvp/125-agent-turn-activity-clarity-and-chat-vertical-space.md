# 125 — Agent turn activity clarity and chat vertical space (Phase B)

**Status:** Done (2026-05-26).

**Priority:** **Phase B** — after **[124](124-greenfield-executor-code-quality-and-proposal-recovery.md)** (Phase A); improves diagnosis and calm during turns once proposals are more reliable.

**Design skill:** Required — read [`.cursor/skills/styleguide-design/SKILL.md`](../../.cursor/skills/styleguide-design/SKILL.md) (`@styleguide-design`) for chat layout, activity list density, and spinner/loading patterns.

## Why this story exists

**Dogfood session (2026-05-26, greenfield Todo app):** After **[119](119-agent-turn-ui-honesty-and-activity-compaction.md)** shipped activity compaction and toast dedupe, an approve-and-run execute still felt **noisy and hard to scan**:

- **Planning spinners** (Plan stepper / phase chips / tool activity “running” states) **continued after execution started** and sometimes **after the turn finished**.
- Validation failures on `script.js` were **buried** in vertical clutter — long activity lists, proposal card, Plan card, and composer chrome competed for attention.
- **Scrolling** in the chat column did not keep the latest error or proposal in view reliably during active turns.
- Duplicate **loading affordances** (`isThinking`, live tool `running` rows, plan execute phase) made it unclear what the harness was still doing.

**119** addressed misleading copy (retrieval “0 files”, merged S&R rollup, merged-edit final-answer hint, execute toast dedupe). **125** targets **layout, lifecycle-bound spinners, and scanability** during Plan → execute → review.

## Goals

1. **Spinner honesty:** Plan-phase and execute-phase loading indicators must **clear when the linked agent turn completes, cancels, or errors** — including plan message stepper vs live execute turn (`executingPlanMessageId`).
2. **One primary “busy” surface:** Avoid simultaneous ambiguous spinners (composer thinking, Plan stepper executing, activity list `running` dots) without a single canonical phase label.
3. **Vertical density:** Tighten activity list, plan card, and proposal blocks during live turns (collapsed-by-default older rows, smaller gaps, optional sticky error row) so a 3-file execute fits in less scroll depth.
4. **Scroll behavior:** When `edit_proposal`, terminal error activity, or failed validation arrives, **pin or scroll** the chat transcript so the user sees the actionable surface without manual hunt.
5. **Error prominence:** Failed tool rows and `rejected` proposal paths use consistent **amber/red** treatment and one-line summary at top of activity panel (build on **119** compaction).
6. **Toast discipline:** Extend **119** rules — no redundant success/info toasts when proposal card + Plan card already state next action; surface **partial execute** (2/3 files) in card copy, not only buried activity detail.

## Non-goals

- Changing corrupt-content validation rules (**124**).
- Replacing Monaco diff or proposal merge semantics.
- macOS black screen on resume (**117**) unless the same repro is filed with steps.

## Scope

- [`src/renderer/src/components/ChatThread.tsx`](../../src/renderer/src/components/ChatThread.tsx) — `isThinking`, `streamingStreamId`, scroll container, `pinChatToBottom`, plan execute lifecycle hooks
- [`src/renderer/src/components/AgentTurnToolActivityList.tsx`](../../src/renderer/src/components/AgentTurnToolActivityList.tsx) — density, running-state display, error summary
- [`src/renderer/src/components/PlanPhaseStepper.tsx`](../../src/renderer/src/components/PlanPhaseStepper.tsx) / [`PlanModeCard.tsx`](../../src/renderer/src/components/PlanModeCard.tsx) — phase vs `executingPlanMessageId` spinner sync
- [`src/renderer/src/hooks/usePlanExecuteLifecycle.ts`](../../src/renderer/src/hooks/usePlanExecuteLifecycle.ts) — clear executing state on `done` / `error` / `cancelled`
- [`src/renderer/src/lib/plan-interaction-storage.ts`](../../src/renderer/src/lib/plan-interaction-storage.ts) — `derivePlanUiPhase` vs live turn
- [`src/renderer/src/lib/plan-execute-lifecycle.ts`](../../src/renderer/src/lib/plan-execute-lifecycle.ts) — toast guards (extend **119**)
- [`src/renderer/src/components/ChatTurnContextUi.tsx`](../../src/renderer/src/components/ChatTurnContextUi.tsx) — optional compact turn banner

## Acceptance criteria

- [ ] **Manual:** Approve-and-run on a plan message → Plan stepper shows **executing** only while the execute stream is active; returns to **review** / **done** / **failed** within one UI frame of `done` / `error` / `cancelled` (no stuck “Planning” or infinite stepper spinner).
- [ ] **Manual:** After turn completes, no `Loader2` spinners remain in the activity list except for a new live turn.
- [ ] **Manual:** On `script.js` (or any) validation failure, user can see the failure reason **without scrolling past** more than one screen of tool rows (activity error summary or auto-scroll to failed row).
- [ ] **Manual:** With proposal card visible, no extra toast repeats “apply” or “combined edits” (**119** behavior preserved).
- [ ] **Manual:** Partial multi-file execute (some paths rejected) — Plan card or proposal header states **which paths failed** in one line.
- [ ] `npm run typecheck` passes; add renderer unit tests for phase derivation / spinner clearing if logic is extracted.

## Related

- **[119](119-agent-turn-ui-honesty-and-activity-compaction.md)** — activity compaction, retrieval copy, toast dedupe **(done)**
- **[098](098-planning-mode-execute-ux-polish.md)** — plan stepper baseline
- **[118](118-work-vs-plan-mode-and-conversation-lifecycle.md)** — Work/Plan lifecycle
- **[123](123-plan-execute-review-follow-ups.md)** — execute outcome vs auto-apply **(done)**
- **[124](124-greenfield-executor-code-quality-and-proposal-recovery.md)** — JS validation / partial recovery (Phase A)
- **[093](../093-agent-tool-activity-in-chat-thread.md)** — inline tool activity

## Completion bookkeeping

When shipped: update **Status**, [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
