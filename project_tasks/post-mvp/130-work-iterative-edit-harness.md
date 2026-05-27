# 130 — Work iterative edit harness (non-greenfield stability)

**Status:** Done (2026-05-26).

**Design skill:** N/A (harness only).

## Why this story exists

**129** fixed Work-mode instability on **populated** repos (package.json or large file counts). Dogfood still showed **default** profile and weak incremental guidance on **smaller existing projects** (e.g. vanilla HTML/JS without `package.json`) and heavy duplicated prompt/nudge text during long edit sessions.

## Goals

1. **Broad routing:** Any **non-greenfield** Work turn with edit intent → **executor** + **execution** model (not only `isPopulatedWorkspace`).
2. **Structured harness:** `WORK_ITERATIVE_EDIT_MARKER` appendix — bounded discovery, surgical edits, one proposal per turn.
3. **Explore bias:** Replace default “discover before proposing” with **≤2 read-only rounds** on iterative turns.
4. **Lighter prompts:** Slim final-answer contract and brief mid-turn nudges when iterative appendix is active; keep validation in `agent-edit-corrupt-content`.

## Non-goals

- Replacing **120** post-plan routing or **129** activity/timeout fixes.
- Removing corrupt-content or cascade guards.

## Scope

- [`src/shared/iterative-work-edit.ts`](../src/shared/iterative-work-edit.ts)
- [`src/shared/agent-turn-routing.ts`](../src/shared/agent-turn-routing.ts), [`src/shared/agent-profile.ts`](../src/shared/agent-profile.ts)
- [`src/shared/agent-harness-profile.ts`](../src/shared/agent-harness-profile.ts), [`src/shared/agent-final-answer-contract.ts`](../src/shared/agent-final-answer-contract.ts)
- [`src/main/agent-runner.ts`](../src/main/agent-runner.ts)
- Eval: [`src/main/agent-runner-evaluation.test.ts`](../src/main/agent-runner-evaluation.test.ts) (`routing:iterative_work_no_replan`)

## Acceptance criteria

- [x] Eval: small vanilla repo (no package.json, non-greenfield) + edit message → **executor** + `WORK_ITERATIVE_EDIT_MARKER`.
- [x] Existing `routing:existing_project_no_replan` still passes with harness 130 sections.
- [x] Discovery saturation nudge fires at **2** read-only rounds on iterative turns.
- [x] `npm run test:agent-eval` and unit tests pass.

## Related

- **[129](129-iterative-work-stability-populated-workspaces.md)**, **[120](120-post-plan-executor-routing-and-single-file-edits.md)**, **[101](../101-greenfield-plan-quality.md)**

## Completion bookkeeping

When shipped: update **Status**, [`README.md`](../README.md) post-MVP table, [`docs/harness-roadmap.md`](../../docs/harness-roadmap.md), run **`npm run stories:html`**.
