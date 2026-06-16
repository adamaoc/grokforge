# 168 — Greenfield empty workspace vs stale plan routing + tool-round budgets

**Status:** Done for Phase A/B scope (2026-06-16). Phase C-E budget/trace/docs work remains out of this pickup.

**Priority:** **High** — field report (2026-06-03, “cleared” Todo App workspace): user asked to **plan and create** a blank HTML todo app in **Work** mode, but harness routed **`postPlanIncremental: true`** + **executor** because an **old approved plan** still lives under app `userData` while the **workspace root is empty**. Turn trace `472b95d2-…`: **4 read-only** tool rounds (`list_directory`, `read_file` on plan artifact, `search_workspace`, `workspace_index`), **`maxToolIterationsHit: true`**, **`editProposalCreated: false`**, long final prose — **no file** in the workspace.

**Design skill:** N/A for routing/budgets; optional **Last agent turn trace** UI copy polish per [`.cursor/skills/styleguide-design/SKILL.md`](../../.cursor/skills/styleguide-design/SKILL.md) if Phase D adds inspector rows.

**Depends on:** **[101](101-greenfield-plan-quality.md)** (greenfield detection), **[109](109-rpi-plan-artifacts-on-disk.md)** (plan persistence), **[120](120-post-plan-executor-routing-and-single-file-edits.md)** (post-plan incremental), **[161](161-greenfield-work-bootstrap-prompt-appendix.md)** (Work greenfield bootstrap). Related: **[167](167-post-plan-zero-tool-calls-nudge.md)** (empty first tool sample on incremental turns).

## Why this story exists

Clearing **files in the workspace** does **not** clear **`userData/workspace-projects/<projectId>/plans/`**. The harness therefore mis-classifies a **greenfield recreate** as a **small post-plan edit** on an “existing project.”

| User intent (observed) | What harness did |
|------------------------|------------------|
| Empty folder, “plan out some work”, create todo app | `postPlanIncremental` + incremental enforcement |
| Wants planning or first `index.html` | Post-plan copy: **no new `gf-plan`**, prefer **`edit`** on **existing** files |
| Needs bootstrap / `propose_file_edits` | Skipped **greenfield Work bootstrap** (`!postPlanIncremental`) |
| Needs more discovery before write | Capped at **4** tool rounds (`INCREMENTAL_EDIT_MAX_TOOL_ROUNDS`) |
| Needs “proceed to edits” nudge after 2 read-only rounds | **Discovery saturation** blocked when `greenfieldWorkspace === true` |

**Comparison (ampnet-harness-p8):** CLI harness uses **`MAX_ITERATIONS = 25`** in `loop.ts` with a single `tools.ts` and three profiles. GrokForge stacks **routing × profiles × toolsets × incremental caps × nudges** — harder to reason about without a **single routing decision record** per turn (see Phase D).

### Current tool-round ceiling (reference)

| Layer | Value | Where |
|-------|-------|--------|
| Global max | **8** | `AGENT_TOOL_MAX_ITERATIONS` (`workspace-tools.ts`) |
| Executor profile | **6** | `agent-profile.ts` `maxToolRounds` |
| Planner profile | **3** | same |
| Post-plan / iterative enforcement cap | **4** | `INCREMENTAL_EDIT_MAX_TOOL_ROUNDS` (`work-edit-policy.ts`) |
| Approved plan auto-run | min(8, **6**) | `APPROVED_PLAN_EXECUTE_MAX_TOOL_ROUNDS` |
| ampnet-harness (reference) | **25** | `ampnet-harness-p8/src/harness/loop.ts` |

Field-report turn hit **4** and stopped with only read tools — not because the model chose to stop, but because **incremental cap + policy** ended the loop.

## Goals

### Phase A — Routing: empty workspace ≠ post-plan incremental

In [`shouldRoutePostPlanIncremental`](../../src/harness/plan/routing/post-plan-incremental.ts) (and call sites in [`agent-runner.ts`](../../src/main/agent-runner.ts)):

- **Do not** set `postPlanIncremental` when **`isGreenfieldWorkspace`** is true for the current project (empty or trivial index), even if `findLatestCompletedPlanArtifact()` returns a plan.
- **Or** require **at least one non-trivial file** under workspace roots before post-plan incremental applies.

When user text indicates **blank / from scratch / new app** (extend heuristics beyond `REPLAN_REQUEST_RE` — e.g. “blank app”, “empty folder”, “no files yet”):

- Prefer **Plan mode** suggestion in UI (out of scope) **or** route to **greenfield Work bootstrap** / **planner** — not executor incremental.
- Treat “**plan out** some work” on an empty tree as **replan / plan intent**, not `isLikelyEditIntent` incremental follow-up (today `create` in user text falsely triggers edit-intent incremental).

Inject **completed plan** system block only when incremental routing is actually active (not when greenfield recreate).

### Phase B — Greenfield create path when disk is empty

When `greenfieldWorkspace && !editProposalCreated` and user has create/bootstrap intent:

- Apply **`GREENFIELD_WORK_BOOTSTRAP_SECTIONS`** (or equivalent) even if a stale plan exists — **or** clear supersede messaging: “workspace empty — create files with `propose_file_edits`, not `edit` on missing paths.”
- Fire **discovery saturation** (or a dedicated **greenfield create nudge**) after **≤2** read-only rounds — **remove** the `!greenfieldWorkspace` guard for this case, or add a parallel `buildGreenfieldCreateNudge`.
- First successful write should be **`propose_file_edits`** `write_file` for `index.html` (or plan paths), not `edit` / `search_replace` on non-existent files.

### Phase C — Tool-round budget review (increase + document)

1. Add a **single markdown table** (e.g. [`docs/harness-turn-budgets.md`](../../docs/harness-turn-budgets.md) or section in [`src/harness/tools/TOOLS.md`](../../src/harness/tools/TOOLS.md)) listing: profile, routing flags, effective `maxToolIterations`, timeout formula, and when caps apply.

2. **Raise** caps for turns that must bootstrap files (proposal — tune in implementation):

   | Turn class | Current effective max | Target (initial proposal) |
   |------------|----------------------|---------------------------|
   | Post-plan incremental (populated repo) | 4 | 4–6 (keep tight) |
   | Greenfield Work bootstrap (empty tree) | 4 (if mis-routed) | **8–12** (or global 8 un-capped) |
   | Default / executor (no incremental enforcement) | 6–8 | **10–12** |
   | Planner (plan mode) | 3 | **4–6** (plan discovery only) |

   Do **not** blindly set **25** everywhere — GrokForge turns are heavier (proposals, approval, traces). Document tradeoff vs ampnet.

3. Centralize cap resolution in one function (e.g. extend `resolveMaxToolIterationsForTurn` + `resolveIncrementalMaxToolIterations`) so `agent-runner.ts` is not the only place to discover effective limits.

### Phase D — Observability: why did the harness route this way?

Extend **`AgentTurnTraceV1.harnessMetrics`** (or top-level trace fields) with a **routing decision** block, for example:

```ts
routingDecision: {
  postPlanIncremental: boolean
  iterativeWorkEdit: boolean
  greenfieldWorkspace: boolean
  hasCompletedPlanArtifact: boolean
  effectiveMaxToolIterations: number
  incrementalEditEnforcement: boolean
  reasonCodes: string[]  // e.g. 'post_plan_blocked_greenfield_empty'
}
```

Surface the same summary in **Last agent turn trace** inspector (one collapsed “Routing” section) so debugging does not require reading 20k chars of JSON.

### Phase E — Complexity debt (document only in this story)

Add a short **“Harness routing map”** section to [`docs/harness-roadmap.md`](../../docs/harness-roadmap.md) or [`src/harness/README.md`](../../src/harness/README.md):

- One diagram: composer input → `resolvePostPlanRoutingInput` / `resolveAgentTurnRouting` / `resolveAgentProfileId` → tool defs → loop caps → nudges.
- List **candidates to consolidate** (not implement here): merge post-plan + iterative policy modules; shared nudge registry; ampnet-style single `maxIterations` with profile overrides.

**Non-goal for 168:** Full harness rewrite or deleting stories **130–140** behavior.

## Acceptance criteria

- [x] Eval: completed plan in app data + **empty** workspace + “blank app… create todo… plan out” → **`postPlanIncremental` false** (or blocked), **greenfield bootstrap** markers in system prompt, turn reaches **`propose_file_edits`** or plan mode path — not 4× read-only then final only.
- [x] Eval: populated workspace + short post-plan edit → **`postPlanIncremental` still true** (regression **120**).
- [ ] Manual: clear workspace files only, same project, recreate todo → **`index.html` proposal** or explicit Plan-mode `gf-plan` path; trace `toolSteps` includes write tool.
- [ ] Docs: harness turn budget table committed; effective max for executor default ≥ prior **8** or justified in doc.
- [ ] Trace: `routingDecision` (or equivalent) visible in last-turn inspector for the field-report scenario.
- [x] Focused regression tests and `npm run typecheck` pass for Phase A/B.

## Suggested implementation order

1. Phase A (routing guard) — fixes mis-routing immediately.
2. Phase B (greenfield create nudge + bootstrap sections).
3. Phase C (budget table + cap tweaks).
4. Phase D (trace + inspector).
5. Phase E (doc diagram).

## Related stories

- **[120](120-post-plan-executor-routing-and-single-file-edits.md)** — introduced post-plan incremental (needs greenfield empty guard).
- **[167](167-post-plan-zero-tool-calls-nudge.md)** — empty first tool sample on incremental turns.
- **[111](111-harness-roadmap-and-retrospective-doc.md)** — roadmap index for debt.
- **[166](166-deprecate-search-replace-tool-alias.md)** — tool surface (orthogonal).

## Completion bookkeeping

When implemented: mark **168** **Done**, update [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
