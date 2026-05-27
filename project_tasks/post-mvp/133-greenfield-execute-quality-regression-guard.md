# 133 — Greenfield execute quality regression guard (Plan → Execute)

**Status:** Done (2026-05-26).

**Priority:** **Third** among **131–134** — dogfood showed **acceptable** output on one static Todo run; recent harness work (**124**, **127**, **100**, normalize/corrupt guards) must **stay enforced** on the **approve-and-run** path so greenfield Plan → Execute does not drift. This story is **eval + contract tightening**, not new product features.

**Design skill:** N/A (harness/tests).

## Why this story exists

Greenfield quality is split across multiple shipped stories:

| Story | What it guards |
|-------|----------------|
| **124** | Crushed HTML/JS, partial-batch recovery nudges |
| **127** | Multi-file bootstrap, JSON/manifest validation on new paths |
| **100** | `normalizeAgentWriteFileContent`, proposal quality rejection |
| **128** | CLI vs file strategy (hybrid conflicts) |
| **130** | Iterative Work on *non*-greenfield repos |

Dogfood (2026-05-26) succeeded once, but there is **no dedicated eval fixture** for the full **Plan (static Todo) → Approve and run → merged proposal → valid HTML/JS** happy path after **127**/**128**/**130**. Follow-up friction (scaffold warning, manual verify) masked whether formatting/normalization regressions would reappear on the next run.

## Goals

### 1. Canonical static greenfield eval fixture

Add tagged cases in [`agent-runner-evaluation.test.ts`](../../src/main/agent-runner-evaluation.test.ts):

| Tag | Scenario |
|-----|----------|
| `behavior:greenfield_static_plan_execute_happy` | Empty index → plan prompt has **101** marker → approve-and-run with static plan artifact → `propose_file_edits` for `index.html` + assets → proposal passes validation (no corrupt-content reject on primary HTML) |
| `behavior:greenfield_static_normalized_markdown` | If plan includes `README.md`, normalized content has real newlines (not one-line glue) |

Use [`createRecordingTransport`](../../src/main/agent-eval-recording-transport.ts) + fixtures in [`agent-eval-fixtures.ts`](../../src/main/agent-eval-fixtures.ts); store minimal approved `gf-plan` JSON inline or under `src/main/fixtures/` if needed.

### 2. Assert harness sections on execute-from-plan

On greenfield execute turns, system prompt (or snapshot metadata) must include:

- `GREENFIELD_EXECUTE_BOOTSTRAP_SECTIONS` / **101** execute marker when workspace empty
- **124** / **127**-relevant quality lines (no crushed script tags; full-file `rawContent` discipline)
- **128** `SCAFFOLD_STRATEGY_ROUTING_MARKER` with **`file_bootstrap`** strategy for static plans

Failure = regression in [`agent-harness-profile.ts`](../../src/shared/agent-harness-profile.ts) wiring.

### 3. Proposal validation assertions

For the happy-path fixture, after `validateAgentEditProposal` (or eval mock of tool results):

- Primary `index.html` does not trigger `assessProposalWriteContent` corrupt flags for truncated `<script>` (**124**)
- Optional: one-line glued markdown stub still **rejected** when model sends bad `README.md` (negative sub-fixture)

### 4. Document manual smoke in harness checklist

[`docs/harness-eval-checklist.md`](../../docs/harness-eval-checklist.md) — add **Greenfield static Todo** section: Plan → verify field has command (**132**) → Execute → diff review → Apply → open served URL.

## Scope

- [`src/main/agent-runner-evaluation.test.ts`](../../src/main/agent-runner-evaluation.test.ts)
- [`src/main/agent-eval-fixtures.ts`](../../src/main/agent-eval-fixtures.ts)
- [`src/shared/agent-eval-tags.ts`](../../src/shared/agent-eval-tags.ts) — new tags
- [`src/shared/agent-edit-corrupt-content.test.ts`](../../src/shared/agent-edit-corrupt-content.test.ts) — only if new edge cases found
- [`src/shared/agent-file-content-normalize.test.ts`](../../src/shared/agent-file-content-normalize.test.ts) — static HTML/JS samples
- [`docs/harness-eval-checklist.md`](../../docs/harness-eval-checklist.md)

## Non-goals

- New normalization algorithms (fix in **100** / **127** if eval fails).
- Scaffold conflict false positives (**131**).
- Planner verification templates (**132**).
- Vite CLI scaffold eval (**127** already has partial coverage — extend only if gap found).

## Dependencies

- **Builds on:** **101**, **124**, **127**, **128**, **108** (eval harness).
- **Best after:** **131** (happy path should not emit conflict activity).

## Acceptance criteria

- [x] Eval `behavior:greenfield_static_plan_execute_happy` passes in `npm run test:agent-eval`.
- [x] Eval asserts execute prompt includes greenfield execute + scaffold strategy markers for static approved plan.
- [x] Negative sub-case: intentionally crushed one-line `index.html` proposal is **rejected** with corrupt/quality reason (document expected error substring).
- [x] Existing **124** / **127** / **128** eval tags still pass (no regressions).
- [x] Harness checklist updated with static Todo smoke steps.
- [x] `npm run typecheck` clean.

## Related

- **[124](124-greenfield-executor-code-quality-and-proposal-recovery.md)**
- **[127](127-greenfield-project-scaffolding-and-initialization.md)**
- **[128](128-greenfield-scaffold-strategy-routing.md)**
- **[108](108-harness-eval-suite-per-model-regressions.md)**
- **[132](132-greenfield-plan-verification-commands.md)** — manual checklist cross-link

## Completion bookkeeping

When shipped: update **Status**, [`README.md`](../README.md) post-MVP table, [`docs/harness-roadmap.md`](../../docs/harness-roadmap.md), run **`npm run stories:html`**.
