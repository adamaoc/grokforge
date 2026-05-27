# 132 — Greenfield plan verification commands (static + npm)

**Status:** Done (2026-05-26).

**Priority:** **Second** among **131–134** — after **131** reduces execute-time noise. Dogfood (2026-05-26, greenfield static Todo) produced a workable app, but the plan’s **final verification step** was effectively manual (“open in browser and test”) with **no concrete command** the executor could run via **`run_command`** after approval. Story **101** required verification in plans; **126** added executor verify nudges — this story closes the gap for **static file-bootstrap** and tightens **npm** greenfield plans.

**Design skill:** Read [`.cursor/skills/styleguide-design/SKILL.md`](../../.cursor/skills/styleguide-design/SKILL.md) if `PlanModeCard` surfaces verification commands or copy-to-terminal affordances.

## Why this story exists

| Surface | Current behavior | Dogfood gap |
|---------|------------------|-------------|
| **Planner** (`GREENFIELD_PLAN_SECTIONS`, `gf-plan-contract`) | Asks for “concrete commands” in `verification` | Static Todo plan ended with **browser-only** manual check |
| **Executor** (`buildPlanVerifyCommandNudge`, **126**) | Nudges `npm install`, `typecheck`, `build` | Examples are **npm-centric**; static plans get weak or no suggested verify |
| **Approve-and-run UX** | User sees plan steps in `PlanModeCard` | Last step not actionable in GrokForge (no command card, no copy-paste command) |

Users comparing to Codex/Cursor expect the **last plan step** to name something runnable (local static server, `npm run dev`, `npm run typecheck`) — not only “open `index.html` in a browser.”

## Goals

### 1. Planner: verification templates by project shape

Extend greenfield planner copy in [`agent-harness-profile.ts`](../../src/shared/agent-harness-profile.ts) and [`gf-plan-contract.ts`](../../src/shared/gf-plan-contract.ts):

| Plan shape | Required in `verification` string | Example step title |
|------------|-----------------------------------|--------------------|
| **Static HTML/CSS/JS** (`file_bootstrap`) | At least one **approved `run_command`** candidate | `npx --yes serve . -l 3000` or `python3 -m http.server 3000` — then manual UI check in browser |
| **npm / Vite / React** (`cli_scaffold` or `cli_then_customize`) | `npm install` (if needed), then `npm run dev` or `npm run build` / `typecheck` | Match **126** command harness |
| **All** | Forbid verification-only steps that are **only** “open in browser” without a preceding serve/build command when files are local static assets | Harness rejects vague final step in eval (soft) or nudge planner via contract |

Add a stable eval marker (e.g. `GREENFIELD_PLAN_VERIFY_COMMANDS_MARKER`) in planner appendix text.

### 2. Shared helper: suggest verification commands from plan

New or extended module (e.g. [`agent-plan-verification.ts`](../../src/shared/agent-plan-verification.ts)):

- **`suggestVerificationCommands(plan, scaffoldStrategy?)`** → readonly `{ command, purpose, tier }[]` using:
  - `plan.verification`, step titles, `filesLikelyTouched`
  - `resolveScaffoldStrategy` / `planImpliesStaticFileBootstrap` (**128**)
- Static defaults: `npx --yes serve . -l 3000`, `python3 -m http.server 3000` (document platform caveats in harness copy, not auto-run).
- npm defaults: `npm install`, `npm run dev`, `npm run typecheck`, `npm run build` as appropriate.

### 3. Executor: static-aware plan-verify nudge

- When **`buildPlanVerifyCommandNudge`** fires on greenfield execute-from-plan, include **static-appropriate** examples when strategy is **`file_bootstrap`** (not only npm examples).
- Optional mid-turn nudge: approved plan’s `verification` mentions “browser” but no `run_command` yet → inject one nudge with **suggested serve command** from helper (mirror **126** cap: once per turn).

### 4. Renderer (optional, small)

- **`PlanModeCard`**: show `verification` commands in a monospace block with “suggested for execute” label when parseable from plan JSON.
- No in-app browser preview (per **118** non-goals).

## Scope

- [`src/shared/agent-harness-profile.ts`](../../src/shared/agent-harness-profile.ts) — `GREENFIELD_PLAN_SECTIONS` verification bullets
- [`src/shared/gf-plan-contract.ts`](../../src/shared/gf-plan-contract.ts) — planner contract lines for static vs npm verification
- [`src/shared/agent-plan-verification.ts`](../../src/shared/agent-plan-verification.ts) *(new)* — suggestion helper + tests
- [`src/shared/agent-final-answer-contract.ts`](../../src/shared/agent-final-answer-contract.ts) — `buildPlanVerifyCommandNudge` static branch
- [`src/main/agent-runner.ts`](../../src/main/agent-runner.ts) — pass verification hints from approved plan artifact
- [`src/renderer/src/components/PlanModeCard.tsx`](../../src/renderer/src/components/PlanModeCard.tsx) — optional display
- [`src/main/agent-runner-evaluation.test.ts`](../../src/main/agent-runner-evaluation.test.ts) — planner prompt contains marker; execute nudge includes serve example for static plan
- [`src/shared/agent-harness-profile.test.ts`](../../src/shared/agent-harness-profile.test.ts) / `gf-plan-contract.test.ts`

## Non-goals

- In-app browser or live preview (**118**).
- Auto-running verify without user approval (**126**).
- Changing `gf-plan` JSON schema with a structured `verificationCommands[]` unless prompt + helper fail eval (**101** optional v2 pattern).
- Fixing false-positive scaffold conflict warnings (**131**).

## Risks

| Risk | Mitigation |
|------|------------|
| **Suggest commands that fail on Windows** | Prefer cross-platform `npx serve` / `python -m http.server`; document in plan that user may substitute |
| **Over-nudging on every static execute** | Gate on plan `verification` lacking a command-like token; once per turn |
| **Conflicts with file_bootstrap “no npm create”** | Suggestions are **serve/verify** only, not scaffold |

## Dependencies

- **Builds on:** **[101](101-greenfield-plan-quality.md)**, **[126](126-agent-terminal-command-execution.md)**, **[128](128-greenfield-scaffold-strategy-routing.md)**, **[109](109-rpi-plan-artifacts-on-disk.md)** (approved plan text available at execute).
- **Soft dependency:** **[131](131-greenfield-scaffold-conflict-warning-hygiene.md)** — verify commands in same round as edits should not trigger scaffold conflict after **131**.

## Suggested eval / manual tags

| Tag | Intent |
|-----|--------|
| `behavior:greenfield_plan_static_verify_copy` | Empty workspace + static todo intent → planner prompt includes static verify marker |
| `behavior:greenfield_execute_static_verify_nudge` | Static approved plan + execute with edits but no `run_command` → nudge cites serve command |
| `behavior:greenfield_plan_npm_verify_copy` | Vite plan → verification mentions `npm run` / `typecheck` |

## Acceptance criteria

### Planner

- [x] Eval or unit: greenfield planner sections include **`GREENFIELD_PLAN_VERIFY_COMMANDS_MARKER`** (or agreed marker) with static **and** npm examples.
- [x] `gf-plan` contract text requires a **command-shaped** verification string for greenfield (not browser-only).

### Executor

- [x] Eval: static file-bootstrap approved plan → execute turn with zero `run_command` → **`buildPlanVerifyCommandNudge`** (or successor) mentions **`npx serve`** or **`python -m http.server`**.
- [x] Eval: npm/Vite plan → verify nudge still mentions `npm install` / `typecheck` / `build` (**126** regression).

### Manual

- [ ] Plan mode: “static todo app” → `gf-plan` `verification` field includes at least one copy-pasteable shell command.
- [ ] Approve and run: user can approve a **serve** or **npm run dev** command when plan names it (optional if model omits — nudge should steer).

### Quality

- [x] `npm run test:agent-eval` and unit tests pass; `npm run typecheck` clean.

## Related

- **[101](101-greenfield-plan-quality.md)** — greenfield planner appendix
- **[126](126-agent-terminal-command-execution.md)** — `run_command` + plan-verify nudge
- **[128](128-greenfield-scaffold-strategy-routing.md)** — `file_bootstrap` vs CLI
- **[131](131-greenfield-scaffold-conflict-warning-hygiene.md)** — verify+edit same round
- **[123](123-plan-execute-review-follow-ups.md)** — execute outcome copy

## Completion bookkeeping

When shipped: update **Status**, [`README.md`](../README.md) post-MVP table, [`docs/harness-roadmap.md`](../../docs/harness-roadmap.md), run **`npm run stories:html`**.
