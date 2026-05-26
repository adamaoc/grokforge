# 127 — Greenfield project scaffolding and initialization

**Status:** Post-MVP backlog.

**Priority:** **Lower than [126](126-agent-terminal-command-execution.md)** — CLI scaffold/install commands should be dependable first; this story improves multi-file bootstrap and validation either way, but full “`npm create vite`” success path is **much easier after 126**.

**Design skill:** N/A for harness-only phases; read [`.cursor/skills/styleguide-design/SKILL.md`](../../.cursor/skills/styleguide-design/SKILL.md) if proposal rejection copy, Plan card scaffold summary, or Settings scaffolding hints change.

## Why this story exists

Users are **satisfied with GrokForge on existing projects** — incremental edits, diff review, Work-mode follow-ups, and merge proposals feel solid after **118–120** and **124**. **Greenfield / new repo** flows remain the main weakness:

**Observed during testing (2026-05-25 – 2026-05-26, ToDoApp / TaskBoard dogfood):**

| Problem | Symptom | Harness area |
|---------|---------|----------------|
| **Hand-rolled scaffold** | Model writes `package.json`, `vite.config.ts`, etc. via `propose_file_edits` instead of `npm create` | Missing or unused **126** command loop; executor copy still file-first |
| **Validation churn** | `package.json`, `.js`, or crushed one-line configs **rejected** as corrupt/incomplete; user sees “failed” with little recovery | `agent-edit-corrupt-content`, `agent-proposal-quality`, **124** partial-batch |
| **Multi-file partial success** | 2/3 planned files land; assistant or Plan card overstates “done” | **124** recovery nudge; **123** / **125** outcome copy |
| **Wrong project shape** | Inline `<script>` in `index.html` when plan asked for `script.js` | **101** / greenfield execute appendix; browser `SyntaxError` after apply |
| **No dependency install** | Plan lists `npm install` but disk has no `node_modules`; user must run terminal manually | **126** gap |
| **Re-planning on follow-ups** | Fixed by **118** / **120** for existing trees — must not regress when tightening greenfield rules |

Codex/Cursor comparisons ([`docs/field-reports/codex-todoapp-comparison.md`](../../docs/field-reports/codex-todoapp-comparison.md), [`cursor-todoapp-comparison.md`](../../docs/field-reports/cursor-todoapp-comparison.md)) show competitors **default to CLI scaffold + multi-file layout** in one beat. GrokForge’s trust harness is appropriate; we need **higher first-try success** without weakening review gates on existing repos.

## Goals

### 1. Improve scaffold success rate (files + structure)

- **Planner (`gf-plan`):** For “new app / new project” intents, prefer explicit **project shape** (Vite+React+TS vs static HTML) and a **concrete file manifest** including `package.json` fields, entry files, and **CLI steps** (delegated to **126** when shipped).
- **Executor (approve-and-run / velocity execute):** Prefer **official layout** (e.g. `index.html` + `styles.css` + `script.js` *or* Vite `src/` tree) per plan — no crushed one-line JSON/JS/CSS (**100**, **124**).
- **Single-file vs multi-file:** Heuristic in **`workspace-greenfield.ts`** + index stats — don’t apply single-file **120** bias to fresh multi-file plans.

### 2. Validation and normalization tuned for bootstrap files

- **`package.json` / `tsconfig` / `vite.config.*`:** Distinguish **invalid JSON** (reject) from **minified but valid** one-line JSON (normalize when safe, like markdown **100**).
- **New-file bootstrap:** Skip or soften pre-apply warnings that scare users on intentional full-file creates (**124** already started this — extend to config manifests).
- **Actionable rejection copy:** Tell the model to re-read `rawContent`, fix specific keys, or use **`run_command`** for `npm create` / `npm init` when hand-written manifest keeps failing.

### 3. Retry and recovery without brittle loops

- One **mid-turn recovery nudge** when scaffold batch has mixed accept/reject (**124** pattern) — add **`package.json`-specific** guidance.
- Cap retry fan-out (align with **116** S&R limits) so greenfield turns don’t stall in “thinking.”
- Final-answer contract: honest partial scaffold (“created `index.html` and `styles.css`; `package.json` rejected — fix: …”).

### 4. Work with terminal execution (**126**)

- When **126** is available: executor should **`run_command`** for `npm create`, `npm install`, `git init`, then **`read_file`** / **`propose_file_edits`** only for customization — not reinventing the template tree by hand.
- When **126** is not yet shipped: still improve file-only scaffold quality; document manual terminal fallback in plan card copy.

### 5. Regression prevention (mandatory)

- **Existing projects** (non-greenfield index, approved plan already on disk): **no new planner cycles** for small Work-mode edits (**120**).
- **Do not relax** corrupt-content rules for normal `.js` / `.ts` edits in mature repos — scope bootstrap detection to **`isGreenfieldWorkspace()`** or “all paths new this turn.”
- **Trust / Velocity:** file approval semantics unchanged (**118**); scaffolding story does not bypass diff review.
- Eval gate: add greenfield scaffold cases; run full **`npm run test:agent-eval`** before merge.

## Scope

- [`src/shared/workspace-greenfield.ts`](../../src/shared/workspace-greenfield.ts) — scaffold intent detection (optional: “bootstrap manifest” flag)
- [`src/shared/agent-harness-profile.ts`](../../src/shared/agent-harness-profile.ts) — `GREENFIELD_PLAN_SECTIONS`, `GREENFIELD_EXECUTE_BOOTSTRAP_SECTIONS`, Vite/React/TS templates vs static site
- [`src/shared/gf-plan-contract.ts`](../../src/shared/gf-plan-contract.ts) — optional `scaffoldKind` / `cliSteps[]` in plan schema (only if prompts insufficient)
- [`src/shared/agent-edit-corrupt-content.ts`](../../src/shared/agent-edit-corrupt-content.ts) — JSON/manifest heuristics scoped to greenfield/new paths
- [`src/shared/agent-proposal-quality.ts`](../../src/shared/agent-proposal-quality.ts) / [`src/shared/agent-file-content-normalize.ts`](../../src/shared/agent-file-content-normalize.ts) — `package.json` normalize
- [`src/main/agent-edit-proposals.ts`](../../src/main/agent-edit-proposals.ts) — validation messages, partial batch recovery variants
- [`src/main/agent-runner.ts`](../../src/main/agent-runner.ts) — scaffold retry nudge; post-scaffold index refresh (coordinate **126**)
- [`src/shared/agent-final-answer-contract.ts`](../../src/shared/agent-final-answer-contract.ts) — partial scaffold honesty
- [`src/main/agent-runner-evaluation.test.ts`](../../src/main/agent-runner-evaluation.test.ts) — greenfield Vite + static HTML fixtures
- [`docs/field-reports/`](../../docs/field-reports/) — update GrokForge comparison when shipped

## Non-goals

- Removing **`propose_file_edits`** review for scaffold files in Trust mode.
- Auto-running `npm install` without approval (**126** owns command policy).
- Full framework wizard UI in renderer (framework choice stays plan + chat).
- Monorepo / multi-root scaffold orchestration.
- Changing **`manifest.roots`** or project picker onboarding (**095**) beyond copy pointers.

## Risks

| Risk | Mitigation |
|------|------------|
| **Regression: existing-project edits** | Greenfield-only prompt appendices; eval fixture with populated index + “add delete button” must still route **executor** / **120**. |
| **Regression: over-normalize** | JSON normalize only when `JSON.parse` succeeds after normalize; never strip valid minified production configs in non-greenfield paths. |
| **False negatives** | Keep rejecting truly crushed/invalid JS; **124** tests stay green. |
| **Coupling to 126** | Story can ship Phase A (file-only quality) before Phase B (CLI-first scaffold); document order in PR. |
| **Velocity false “done”** | Reuse **123** `plan-execute-outcome` for partial scaffold paths. |

## Dependencies

- **Recommended after:** **[126](126-agent-terminal-command-execution.md)** for CLI-first scaffold (`npm create vite`, `npm install`).
- **Builds on:** **101**, **124**, **118**, **109**, **100**, **120** (do not conflate single-file bias with greenfield multi-file execute).
- **Parallel-safe with:** **122** (model picker), **117** (renderer stability).

## Suggested eval tags

| Tag | Intent |
|-----|--------|
| `behavior:greenfield_vite_scaffold` | Plan + execute produces valid `package.json` + entry files (file-only or post-`npm create`) |
| `validation:package_json` | Malformed vs one-line valid JSON handling |
| `recovery:scaffold_partial` | `package.json` rejected, HTML accepted — honest nudge + final answer |
| `routing:existing_project_no_replan` | Populated index + incremental user message → no forced `gf-plan` |

## Acceptance criteria

### Scaffolding quality

- [ ] Eval: greenfield fixture — approve-and-run with Vite+React+TS plan → valid `package.json` (parseable) and at least one entry file pass validation without manual user coaching.
- [ ] Eval: static HTML/CSS/JS plan → valid separate `script.js` (non-crushed) passes **124**-style checks.
- [ ] Eval: intentionally invalid `package.json` → rejection reason mentions fix strategy (valid JSON, use `npm init` / **126** command, full `rawContent`).

### Recovery and honesty

- [ ] Eval: partial batch (config rejected, markup accepted) → one recovery nudge; final answer does not claim full scaffold complete.
- [ ] Manual (Trust): user can Apply successful files while fixing rejected path via follow-up turn without losing prior applied work (**096** undo still works).

### Non-regression (existing projects)

- [ ] Eval: non-greenfield index + “add localStorage” / “add delete button” → **executor**, no new `gf-plan` requirement (**120**).
- [ ] Manual: mature repo incremental edit — same proposal / S&R / merge behavior as pre-story baseline; `npm run test:agent-eval` clean.

### Integration with **126** (when both shipped)

- [ ] Manual: greenfield “create Vite React TS app” plan → model requests `npm create` (or documented equivalent) via `run_command`, user approves, tree contains expected template files, then optional `propose_file_edits` for customization only.

### Docs and bookkeeping

- [ ] Field report or harness checklist entry for scaffold happy path updated.
- [ ] When shipped: update **Status**, [`README.md`](../README.md) post-MVP table, [`docs/harness-roadmap.md`](../../docs/harness-roadmap.md), run **`npm run stories:html`**.

## Related

- **[126](126-agent-terminal-command-execution.md)** — command execution (recommended first)
- **[101](101-greenfield-plan-quality.md)** — planner greenfield appendix
- **[124](124-greenfield-executor-code-quality-and-proposal-recovery.md)** — JS/partial batch recovery (Phase A done — extend, don’t duplicate blindly)
- **[120](120-post-plan-executor-routing-and-single-file-edits.md)** — post-plan routing (guard against misapplication)
- **[100](100-proposal-quality-auto-normalize.md)** — normalize patterns
- **[118](118-work-vs-plan-mode-and-conversation-lifecycle.md)** — Plan → Work lifecycle
- Field reports: [`docs/field-reports/grokforge-todoapp-comparison.md`](../../docs/field-reports/grokforge-todoapp-comparison.md)

## Completion bookkeeping

When shipped: update **Status**, [`README.md`](../README.md) post-MVP table, [`docs/harness-roadmap.md`](../../docs/harness-roadmap.md), run **`npm run stories:html`**.
