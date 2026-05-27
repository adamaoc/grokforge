# 128 — Greenfield scaffold strategy routing (CLI vs file-first)

**Status:** Done (2026-05-26).

**Priority:** **After [126](126-agent-terminal-command-execution.md), alongside or before [127](127-greenfield-project-scaffolding-and-initialization.md)** — **126** made CLI scaffolding possible; this story stops the model from **mixing CLI and hand-written files in the same turn**, which dogfood showed is worse than either approach alone. **127** improves bootstrap file quality and recovery; **128** owns **which path to take** and **when not to combine them**.

**Design skill:** N/A for harness-only work; read [`.cursor/skills/styleguide-design/SKILL.md`](../../.cursor/skills/styleguide-design/SKILL.md) if Plan card or execute outcome copy surfaces scaffold-strategy hints.

## Why this story exists

Story **126** shipped command approval, plan-verify nudges, and executor copy that says “prefer `run_command` for `npm create` / `npm install`.” In practice, models often **do both** in one execute turn:

| Observed hybrid behavior | Symptom | Why it hurts |
|--------------------------|---------|--------------|
| **`npm create` + hand-written `index.html` / `package.json` in same turn** | Blank or stub `index.html` proposals; `package.json` rejected as corrupt/incomplete | CLI template and manual files **fight** for the same paths; validation runs against incomplete stubs before the user approves the command |
| **CLI scaffold pending approval + immediate `propose_file_edits`** | User sees command card **and** diff review; disk state unclear | Two write surfaces with no ordering contract — user cannot tell which source of truth “won” |
| **Partial CLI success + full-file rewrite of generated tree** | `npm create` lands files; model proposes crushed one-line overwrites | Wastes generated layout; **124** rejection churn on paths the CLI already created correctly |
| **Static HTML plan + `npm create vite` anyway** | Wrong project shape; missing or duplicate entry files | No **scaffold kind** decision — harness encourages CLI generically without matching plan shape |

Users report this as **regression-like confusion** after **126**: command tooling is visible, but outcomes are **less predictable** than file-only greenfield bootstrap (**124**) or a clean CLI-first beat (Codex/Cursor field reports).

Root cause: harness copy **encourages both** `run_command` and `propose_file_edits` on greenfield execute without a **mutually exclusive strategy**, turn-phase ordering, or runner guard when both appear in one tool sample.

## Goals

### 1. Explicit scaffold strategy in harness prompts

Add a **single decision block** (greenfield execute + execute-from-plan) that the model must follow:

| Strategy | When | Tools this turn / phase | After success |
|----------|------|-------------------------|---------------|
| **`cli_scaffold`** | Plan or user asks for Vite/React/Next/npm template, `npm create`, `npm init`, or framework CLI | **`run_command` only** for create/install/init — **no** `propose_file_edits` / `search_replace` on template paths until CLI succeeds and index refreshes | `read_file` generated files; **`propose_file_edits` only for customization** (README, components, styling) |
| **`file_bootstrap`** | Plan specifies **static** multi-file site (HTML/CSS/JS) with **no** package manager / build step | **`propose_file_edits`** for all new paths — **no** `npm create` / `npm init` unless user explicitly asked | Optional **`run_command`** only for verify (`open in browser` stays manual) |
| **`cli_then_customize`** | Approved plan lists CLI step **then** customization files | **Phase 1:** command(s) only. **Phase 2** (after tool success + refresh): edits only | Never interleave command request and full-tree `write_file` in the **same** tool round |

Copy should live in [`agent-harness-profile.ts`](../../src/shared/agent-harness-profile.ts) (`GREENFIELD_EXECUTE_BOOTSTRAP_SECTIONS`, `EXECUTOR_FROM_PLAN_SECTIONS`) with a stable eval marker (e.g. `SCAFFOLD_STRATEGY_ROUTING_MARKER`).

### 2. Lightweight decision heuristic (shared + runner)

Extend [`agent-command-intent.ts`](../../src/shared/agent-command-intent.ts) and/or [`workspace-greenfield.ts`](../../src/shared/workspace-greenfield.ts):

- **`resolveScaffoldStrategy(input)`** → `'cli_scaffold' | 'file_bootstrap' | 'ambiguous'` using:
  - approved plan text (`npm create`, `vite`, `package.json` + install step vs static `index.html` only)
  - user message (“scaffold”, “initialize”, “new vite app”, “static todo page”)
  - workspace greenfield signal (**101**)
- **`planImpliesCliScaffold(plan)`** / **`planImpliesFileBootstrap(plan)`** — narrow regex + plan `filesLikelyTouched` heuristics (avoid false positives on “add button” in populated repos).

**Runner ([`agent-runner.ts`](../../src/main/agent-runner.ts)):**

- When **`cli_scaffold`** and first tool sample includes **`propose_file_edits`** / **`search_replace`** without a prior successful scaffold command this turn → inject **one** mid-turn nudge (`buildScaffoldStrategyNudge` in [`agent-final-answer-contract.ts`](../../src/shared/agent-final-answer-contract.ts)): stop hand-written template files; run CLI first.
- When **`file_bootstrap`** and sample includes **`run_command`** with `npm create` / `npm init` → nudge: use file proposals only unless user asked for CLI.
- When **same tool round** samples both `run_command` and edit tools on greenfield execute → nudge to **pick one strategy**; prefer CLI when plan names framework CLI, else file bootstrap.
- Optional **soft guard:** if `cli_scaffold` and command still **awaiting approval**, defer edit-tool execution message to model (document in PR — only if nudge alone insufficient).

### 3. Reduce conflicting same-turn behavior

- Final-answer contract: if command **awaiting approval** or **rejected**, do not claim scaffold files are ready; if CLI succeeded but edits failed, say which phase completed (**126** command honesty + scaffold phase copy).
- Activity / plan execute UI (**123**): when command approval pending during greenfield execute, surface “CLI scaffold step awaiting approval — file proposals may be premature” (reuse `formatPlanExecutePendingSummary` pattern from **126**).
- Planner (**[`gf-plan-contract.ts`](../../src/shared/gf-plan-contract.ts)**): optional one-line **`scaffoldStrategy`** hint in plan quality copy (`cli` vs `static_files`) — structured schema field **only if prompts fail eval**.

### 4. Safety and non-regression (mandatory)

- **Commands still require approval** (**126** / **059**) — no auto-run, no velocity bypass.
- **Existing-project Work mode:** heuristic must **not** fire on incremental edits (**120**); gate on `isGreenfieldWorkspace()` + scaffold intent, not bare `npm` in user text.
- **Post-plan incremental:** no scaffold-strategy nudges when **120** post-plan routing applies.
- **Trust / Velocity:** file review semantics unchanged (**118**); strategy routing does not auto-apply commands or files.

## Scope

- [`src/shared/agent-command-intent.ts`](../../src/shared/agent-command-intent.ts) — `resolveScaffoldStrategy`, plan/message helpers (or new `agent-scaffold-strategy.ts` if cleaner)
- [`src/shared/workspace-greenfield.ts`](../../src/shared/workspace-greenfield.ts) — optional `scaffoldIntentFromPlan(plan)` helper
- [`src/shared/agent-harness-profile.ts`](../../src/shared/agent-harness-profile.ts) — strategy table in greenfield execute / execute-from-plan sections; rebalance fast profile so “bias to propose_file_edits” applies to **file_bootstrap** only
- [`src/shared/agent-final-answer-contract.ts`](../../src/shared/agent-final-answer-contract.ts) — `buildScaffoldStrategyNudge`, hybrid-scaffold honesty appendix
- [`src/main/agent-runner.ts`](../../src/main/agent-runner.ts) — detect hybrid tool samples; inject nudge; track `scaffoldStrategy` per turn for final contract
- [`src/shared/gf-plan-contract.ts`](../../src/shared/gf-plan-contract.ts) — planner copy: declare `cli` vs `static_files` in plan when obvious
- [`src/renderer/src/lib/plan-execute-outcome.ts`](../../src/renderer/src/lib/plan-execute-outcome.ts) — optional pending CLI + file proposal copy (coordinate **126**)
- [`src/main/agent-runner-evaluation.test.ts`](../../src/main/agent-runner-evaluation.test.ts) — hybrid and strategy-routing fixtures
- [`src/shared/agent-command-intent.test.ts`](../../src/shared/agent-command-intent.test.ts) / new strategy tests
- Docs: [`docs/harness-eval-checklist.md`](../../docs/harness-eval-checklist.md) — manual “CLI-only first turn” smoke

## Non-goals

- Replacing **`propose_file_edits`** with shell heredocs or `echo > file` for routine edits.
- Auto-running `npm create` without approval (**126** owns policy).
- Full **`gf-plan` schema** redesign (`scaffoldKind` enum in JSON) unless prompt + heuristic evals fail.
- **127** validation/normalization work (JSON normalize, `package.json` recovery) — reference, don’t duplicate.
- Blocking edit tools **hard** at the tool-filter layer (prefer nudge + contract first; hard filter only if eval proves nudge insufficient).

## Risks

| Risk | Mitigation |
|------|------------|
| **Regression: existing-project edits** | Strategy resolution returns `null` / no-op when not greenfield + not scaffold intent; eval “add button” fixture (**120**) |
| **Regression: static HTML greenfield** | `file_bootstrap` path must not nudge toward `npm create`; eval static todo plan |
| **Over-correction: CLI-only then stuck** | After successful `npm create`, nudge toward read + customize; index refresh (**126**) before phase 2 |
| **False CLI detection** | Require plan step or user text match; don’t treat “npm run test” in mature repo as scaffold |
| **Nudge fatigue** | One mid-turn nudge per strategy conflict type per turn (mirror **116** / **126** caps) |

## Dependencies

- **Builds on:** **[126](126-agent-terminal-command-execution.md)** (command path must exist), **101** (greenfield), **124** (proposal quality), **123** (execute outcome honesty), **120** (routing guards).
- **Complements:** **[127](127-greenfield-project-scaffolding-and-initialization.md)** — **128** = strategy choice; **127** = file quality once strategy is chosen.
- **Does not require:** **122** dynamic catalog.

## Suggested eval / manual tags

| Tag | Intent |
|-----|--------|
| `behavior:scaffold_cli_only_first` | Vite plan + greenfield execute → first tool sample is `run_command` only, no `propose_file_edits` |
| `behavior:scaffold_file_bootstrap_static` | Static HTML plan → `propose_file_edits` only, no `npm create` |
| `behavior:scaffold_hybrid_nudge` | Model samples CLI + edits same round → harness injects strategy nudge with marker |
| `routing:existing_project_no_scaffold_nudge` | Populated index + “add CSS” → no scaffold strategy nudge |

## Acceptance criteria

### Strategy selection

- [x] Eval: greenfield + approved plan with `npm create vite` / Vite in steps → first tool sample contains **`run_command`** and **not** `propose_file_edits` (or nudge fires before final if model mixes).
- [x] Eval: greenfield + static HTML/CSS/JS plan (no package manager) → first sample uses **`propose_file_edits`** only; no `npm create` nudge.
- [x] Eval: hybrid same-round sample (CLI + edits) → exactly one **`buildScaffoldStrategyNudge`** injected; marker present in messages.

### Recovery and honesty

- [x] Eval: CLI command rejected → final answer does not claim project scaffolded; no “files ready to apply” for template paths.
- [ ] Eval: CLI succeeds (mock) → follow-up sample may use `read_file` + targeted `propose_file_edits`; harness copy allows customization only.
- [ ] Manual: approve-and-run Vite plan → user sees command approval **before** diff review for template files (or model waits until after command).

### Non-regression

- [x] Eval: non-greenfield + incremental edit intent → **no** scaffold strategy nudge (**120**).
- [x] Eval: **126** plan-verify command nudge still fires when appropriate; **124** partial-batch nudge unchanged.
- [ ] Manual: mature repo “add delete button” → single `propose_file_edits` path; no command approval card.
- [x] `npm run test:agent-eval` passes; `npm run typecheck` clean.

### Docs and bookkeeping

- [x] [`docs/harness-eval-checklist.md`](../../docs/harness-eval-checklist.md) — add scaffold strategy smoke (CLI-first vs static file-first).
- [x] When shipped: update **Status**, [`README.md`](../README.md) post-MVP table, [`docs/harness-roadmap.md`](../../docs/harness-roadmap.md), run **`npm run stories:html`**.

## Related

- **[126](126-agent-terminal-command-execution.md)** — command execution (shipped; triggered hybrid failure mode)
- **[127](127-greenfield-project-scaffolding-and-initialization.md)** — bootstrap validation and recovery
- **[101](101-greenfield-plan-quality.md)** — planner greenfield appendix
- **[124](124-greenfield-executor-code-quality-and-proposal-recovery.md)** — crushed HTML/JS rejection
- **[120](120-post-plan-executor-routing-and-single-file-edits.md)** — post-plan routing guards
- Field reports: [`docs/field-reports/grokforge-todoapp-comparison.md`](../../docs/field-reports/grokforge-todoapp-comparison.md)

## Completion bookkeeping

When shipped: update **Status**, [`README.md`](../README.md) post-MVP table, [`docs/harness-roadmap.md`](../../docs/harness-roadmap.md), run **`npm run stories:html`**.
