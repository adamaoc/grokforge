# 148 — Better incremental editing strategy (prefer surgical edits over full rewrites after plan execution)

**Status:** **Done**.

**Priority:** Medium-High — reduces unnecessary large proposals and context waste on follow-up Work turns (common pattern after TaskBoard-style and other post-plan execute sessions).

**Design skill:** N/A (harness routing + prompt policy); `@styleguide-design` only if any new routing UI hints are added (unlikely in this narrow story).

**Depends on:** **[144](144-consolidate-incremental-work-edit-policy.md)**, **[130](130-work-iterative-edit-harness.md)**, **[135](135-iterative-work-surgical-edit-enforcement.md)**, **[120](120-post-plan-executor-routing-and-single-file-edits.md)**, **[136](136-iterative-edit-scope-and-combine-heuristics.md)**.

## Why this story exists

After a plan is approved and executed (or during iterative Work on an existing project), the model still frequently jumps to large `propose_file_edits` full-file rewrites even when the user request is a small, localized, incremental change (e.g. "add dark mode toggle", "fix the delete button handler", "tweak one list item style").

This produces:
- Overly broad diffs that are harder for the user to review.
- Higher risk of introducing new bugs or crushing formatting in unrelated code (the exact TaskBoard App.tsx class of failure on follow-ups).
- Unnecessary re-transmission of large file bodies.

Existing policy files (`incremental-work-edit-policy.ts`, `iterative-work-edit.ts`, single-file bias, surgical edit enforcement) have good intent but the routing decision + prompt language still allows/encourages the "safer to just send the whole file" path too often. The model needs stronger, more automatic preference for `search_replace` (legacy) / the new `edit` tool (preferred) or tiny scoped `propose_file_edits` when the change is clearly incremental.

## Goals

1. Improve the decision heuristics / routing so that post-plan or iterative Work turns with small user requests default to targeted edits (`edit` tool with precise `edits[]`, or small `search_replace`) rather than full `propose_file_edits`.
2. Add clear, narrow escalation rules in the harness: "stay surgical unless ≥2 failures on the path this turn **or** the user explicitly asks for a rewrite **or** the file is <20 lines / already crushed".
3. Strengthen the prompt guidance in the relevant policy sections so the model has less freedom to choose the large-rewrite path for obviously incremental work.

## Narrow acceptance criteria

- [x] Updated logic in `buildIncrementalEditHarnessSections` / `resolveScaffoldStrategy` or a new narrow helper that biases toward `edit` / `search_replace` for post-execute incremental turns when file count changed is low and change description is localized.
- [x] Prompt language in `incremental-work-edit-policy.ts` and `iterative-work-edit.ts` (and any injection in `agent-harness-profile.ts`) now contains explicit "default to targeted `edit` tool or small `search_replace` for incremental changes; full `propose_file_edits` only on explicit rewrite intent or repeated surgical failure" rules.
- [x] In a post-plan Work turn with a small request on an existing file, the first edit attempt uses a surgical tool (observable in tool sample or activity) unless the plan or user text clearly signals "rewrite this component".
- [x] No regression on legitimate large-refactor or greenfield cases (they still get full `propose_file_edits` when appropriate).
- [x] `npm run typecheck` + relevant policy + harness tests pass.

## Files / areas that should be touched (tight scope)

- `src/shared/incremental-work-edit-policy.ts` — the main policy builder and fallback rules.
- `src/shared/iterative-work-edit.ts` — `INCREMENTAL_EDIT_*_LINES` and structural change guidance.
- `src/shared/agent-harness-profile.ts` — any cross-references or executor-from-plan incremental sections that pull in the above.
- Possibly a tiny helper in `src/shared/agent-scaffold-strategy.ts` or a new small file if routing needs a shared predicate (keep change <15 lines if possible).
- Tests: `src/shared/incremental-work-edit-policy.test.ts`, `src/shared/iterative-edit-scope.test.ts`, `src/shared/agent-harness-profile.test.ts` (update expectations only where wording changed).

## What is explicitly out of scope

- Changes to the core `edit` tool implementation or fuzzy matching (**146** pre-validation and **147** quality are separate).
- New UI affordances for "force surgical vs power edit" (that would be a follow-on).
- Broad changes to plan execution or greenfield bootstrap (this story is narrowly about **post-plan / iterative Work incremental turns**).
- Altering the shrink guard or cascade counting logic (**115**).
- Adding new tool surface (the `edit` tool is already preferred in recent work; this just makes the router honor it more aggressively).

## Related

- **[144](144-consolidate-incremental-work-edit-policy.md)**, **[130](130-work-iterative-edit-harness.md)**, **[135](135-iterative-work-surgical-edit-enforcement.md)**, **[136](136-iterative-edit-scope-and-combine-heuristics.md)**, **[120](120-post-plan-executor-routing-and-single-file-edits.md)** — the direct policy and routing ancestors this tightens.
- **[148** is the "stay surgical" companion to the quality enforcement in **147** and pre-validation in **146**.

## Completion bookkeeping

When shipped or closed: update **Status**, [`README.md`](../README.md) post-MVP table (add 148), run **`npm run stories:html`**.