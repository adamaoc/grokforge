# 123 — Plan execute review follow-ups

**Status:** Done (2026-05-26).

**Design skill:** N/A for routing contract cleanup; read [`styleguide-design`](../../.cursor/skills/styleguide-design/SKILL.md) if the Plan card / composer status UI changes.

## Why this story exists

Code review on the uncommitted master changes found two remaining reliability seams around **Plan approve -> execute** after stories **118**, **120**, and **121**:

1. The renderer now sends approve-and-run turns through **`models.execution`**, but the shared payload, main Zod schema, unit tests, docs, and one composer tooltip still preserve or describe the old **`planWorkflowUsePlanningModel`** override.
2. The Plan card marks execute as done/failed from renderer-local activity state plus a boolean that only means an edit proposal event happened. In Velocity mode, auto-apply may fail or skip after a valid proposal, yet the card can still show execution as complete.

These are not blocking the current test suite, but they are easy places for future agents or contributors to reintroduce the old routing behavior or show overly optimistic execute status.

## Goals

### 1. Reconcile the approve-and-run routing contract

- Decide whether `planWorkflowUsePlanningModel` is truly retired or still a supported advanced path.
- If retired, remove it from:
  - `src/shared/agent-chat-contract.ts`
  - `src/main/agent-runner.ts` payload schema
  - `src/shared/agent-turn-routing.ts`
  - routing tests that assert the planning override
  - AGENTS / docs / renderer tooltips that say Plan approve-and-run stays on `models.planning`
- If supported, update renderer behavior and docs so the flag is intentionally surfaced, tested, and not contradicted by the Work/Plan copy.

### 2. Make Plan execute outcome reflect apply outcome

- Track execute outcome from durable events rather than only `agentActivitiesRef.current` and `proposalCreatedInTurnRef`.
- In **Velocity**, do not mark the Plan run as `done` until auto-apply reports a complete or partial apply result.
- If auto-apply fails, conflicts, or applies zero files, keep the proposal visible and mark the run as failed or needs-review with honest copy.
- In **Trust**, distinguish "proposal ready for review" from "files written"; avoid copy that implies disk writes already happened.

## Acceptance criteria

- [x] One canonical approve-and-run routing contract exists; tests, docs, AGENTS, renderer tooltips, and main schema agree.
- [x] A stale `planWorkflowUsePlanningModel` payload cannot silently route a normal approve-and-run execute turn to the planning model unless that path is deliberately supported.
- [x] Velocity approve-and-run with rejected/conflicting/zero-applied writes leaves the Plan card in failed or needs-review state, not completed.
- [x] Trust approve-and-run with a valid proposal clearly communicates "review/apply pending" rather than "written".
- [x] Regression tests cover execute success, edit rejection, auto-apply failure/conflict, and trust-mode pending proposal.

## Related

- **[118](118-work-vs-plan-mode-and-conversation-lifecycle.md)** — Work vs Plan and temperament
- **[120](120-post-plan-executor-routing-and-single-file-edits.md)** — executor routing / single-file bias
- **[121](121-xai-model-catalog-and-api-sync.md)** — model ids and reasoning effort
- **[069](../069-plan-approve-auto-agent-turn.md)** — original approve-and-run flow

## Completion bookkeeping

When shipped: update **Status**, [`README.md`](../README.md) post-MVP table, [`docs/harness-roadmap.md`](../../docs/harness-roadmap.md) debt table if needed, run **`npm run stories:html`**.
