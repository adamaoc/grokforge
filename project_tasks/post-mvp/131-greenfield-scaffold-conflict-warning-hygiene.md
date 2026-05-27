# 131 — Greenfield scaffold conflict warning hygiene (file-bootstrap false positives)

**Status:** Done (2026-05-26).

**Priority:** **First** among **131–134** — dogfood (2026-05-26, clean greenfield Todo static HTML Plan → Execute) showed a **“Harness: scaffold strategy conflict”** activity row even when the run was a successful **file-only bootstrap** with **no CLI scaffold step** and no user-visible hybrid behavior. That erodes trust in **128** and feels like a regression after scaffold-strategy routing shipped.

**Design skill:** N/A (harness + activity copy); read [`.cursor/skills/styleguide-design/SKILL.md`](../../.cursor/skills/styleguide-design/SKILL.md) only if conflict recovery UI changes surface in chat.

## Why this story exists

Story **128** introduced `resolveScaffoldStrategy()`, `detectScaffoldConflict()`, and a mid-turn **`buildScaffoldStrategyNudge`** with a visible activity title **`Harness: scaffold strategy conflict`**. The intent was to stop **CLI + hand-written template files in the same round** on greenfield execute.

Recent dogfood on a **clean static Todo app** (Plan mode → Approve and run → multi-file `index.html` / CSS / JS, **no** `npm create` / `package.json`):

| Observed | Expected for `file_bootstrap` |
|----------|------------------------------|
| Activity row **“Harness: scaffold strategy conflict”** appeared during execute | **No** scaffold-strategy nudge when the model follows file-bootstrap only |
| User had to interpret an internal harness conflict while the run was otherwise healthy | Warnings only when the harness **actually** blocked or corrected harmful hybrid sampling |
| No CLI approval card; static files applied successfully | `detectScaffoldConflict` should not treat benign patterns as `cli_on_static` or `hybrid_same_round` |

Likely false-positive sources (verify in PR):

- **`hybrid_same_round`** when the model samples a **non-scaffold** `run_command` (e.g. `npx serve`, `python -m http.server`, `open`) in the same round as `propose_file_edits` — `toolSampleHasRunCommand` is true but `isCliScaffoldCommand` is false; conflict detection may still fire on `ambiguous` strategy.
- **`ambiguous`** from plan heuristics (`planImpliesNpmScaffold` + `planImpliesStaticFileBootstrap` both true) → nudge on any edit+cmd round even when commands are verify-only.
- **`cli_on_static`** when `file_bootstrap` is resolved but a verify/install command appears before edits complete (should be allowed or classified separately).
- Activity title always says **“conflict”** even when the nudge is informational and the next sample recovers immediately (**134** may refine copy; **131** owns **when** to fire).

## Goals

### 1. Narrow conflict detection for `file_bootstrap`

- Extend [`detectScaffoldConflict`](../../src/shared/agent-scaffold-strategy.ts) (or helpers) so **`file_bootstrap`** only flags:
  - **`cli_on_static`** when `run_command` is a **mutating scaffold** command (`npm create`, `npm init`, `create-vite`, etc. per **128** `CLI_SCAFFOLD_CMD_RE`) — **not** verify/serve/open helpers.
  - **`hybrid_same_round`** only when the same round includes **scaffold-class** CLI **and** edit tools — not verify-only `run_command` + edits.
- When strategy is **`ambiguous`**, prefer **plan step analysis** (`planImpliesStaticFileBootstrap` vs `planImpliesNpmScaffold`) before injecting a conflict nudge; if plan is clearly static-only, resolve to **`file_bootstrap`** for conflict purposes.

### 2. Suppress or downgrade noise when strategy is already honored

- If the tool sample is **edits-only** and strategy is **`file_bootstrap`** → **no** nudge.
- If the tool sample is **CLI scaffold-only** and strategy is **`cli_scaffold`** / **`cli_then_customize`** phase 1 → **no** nudge.
- Optional: track **recovery** — if the nudge was injected and the **next** sample complies, do not re-emit the activity row on subsequent rounds (one nudge per conflict **kind** per turn remains; **128**).

### 3. Activity and eval honesty

- Rename or subtitle activity when the harness is **correcting** vs **blocking** (e.g. “Scaffold strategy: use file proposals only” vs generic “conflict”) — coordinate with **134** if split.
- Eval: static greenfield plan → execute with **only** `propose_file_edits` samples → **zero** `Harness: scaffold strategy conflict` activities.
- Eval: static plan + same-round `run_command` with `npx serve` or `python -m http.server` + edits → **no** scaffold-strategy nudge (verify commands are not scaffold).

## Scope

- [`src/shared/agent-scaffold-strategy.ts`](../../src/shared/agent-scaffold-strategy.ts) — conflict kinds, `detectScaffoldConflict`, optional `isVerifyOrServeCommand(command)`
- [`src/shared/agent-command-intent.ts`](../../src/shared/agent-command-intent.ts) — reuse or share command classification with **126** verify/install tiers if helpful
- [`src/main/agent-runner.ts`](../../src/main/agent-runner.ts) — gating `shouldInjectScaffoldStrategyNudge`, activity title/detail
- [`src/shared/agent-scaffold-strategy.test.ts`](../../src/shared/agent-scaffold-strategy.test.ts) — false-positive matrix
- [`src/main/agent-runner-evaluation.test.ts`](../../src/main/agent-runner-evaluation.test.ts) — tag `behavior:scaffold_file_bootstrap_no_false_conflict`
- [`docs/harness-eval-checklist.md`](../../docs/harness-eval-checklist.md) — static Todo dogfood row: no conflict activity on happy path

## Non-goals

- Removing hybrid detection for true **128** failures (Vite plan + `propose_file_edits` + `npm create` same round).
- Auto-running verify commands without approval (**126**).
- Planner changes to verification copy (**132**).
- Hard tool-filter blocking of edit tools (**128** non-goal remains).

## Risks

| Risk | Mitigation |
|------|------------|
| **Under-warning on real hybrids** | Keep existing `behavior:scaffold_hybrid_nudge` eval; add static false-positive fixtures |
| **Verify command misclassified as scaffold** | Unit tests for `npx serve`, `python -m http.server`, `npm run typecheck` vs `npm create` |
| **Ambiguous plans** | Fall back to current nudge only when both CLI scaffold and static paths appear in **steps** / `filesLikelyTouched` |

## Dependencies

- **Builds on:** **[128](128-greenfield-scaffold-strategy-routing.md)** (strategy resolution), **[126](126-agent-terminal-command-execution.md)** (command taxonomy), **[101](101-greenfield-plan-quality.md)** (static vs npm plan shape).
- **Complements:** **[134](134-harness-conflict-recovery-activity-honesty.md)** (copy when nudge does fire).

## Suggested eval / manual tags

| Tag | Intent |
|-----|--------|
| `behavior:scaffold_file_bootstrap_no_false_conflict` | Static HTML plan + file-only samples → no scaffold conflict activity |
| `behavior:scaffold_verify_command_not_hybrid` | `file_bootstrap` + serve/typecheck command + edits same round → no strategy nudge |
| `behavior:scaffold_hybrid_nudge` | *(regression)* Vite plan + `npm create` + `propose_file_edits` same round → nudge still fires |

## Acceptance criteria

### False-positive elimination

- [ ] Eval: greenfield + approved **static** Todo plan (`index.html`, `styles.css`, `script.js`, no `package.json`) → tool samples with **only** `propose_file_edits` → **no** activity titled `Harness: scaffold strategy conflict`.
- [ ] Eval: `file_bootstrap` + same-round `run_command` with **`npx serve`** or **`python -m http.server`** + `propose_file_edits` → **no** scaffold-strategy nudge.
- [ ] Unit: `detectScaffoldConflict('file_bootstrap', …)` returns `null` for verify/serve commands without CLI scaffold commands.

### Regression (true conflicts)

- [ ] Eval: `behavior:scaffold_hybrid_nudge` (**128**) still passes — Vite plan + hybrid sample → exactly one nudge with `SCAFFOLD_STRATEGY_NUDGE_MARKER`.
- [ ] Eval: `cli_on_static` still fires when `file_bootstrap` and `npm create` appear in the same round.

### Docs and quality

- [ ] Manual: greenfield static Todo Plan → Execute — user does **not** see scaffold strategy conflict on a clean successful run.
- [ ] `npm run test:agent-eval` and `npm run typecheck` clean.

## Related

- **[128](128-greenfield-scaffold-strategy-routing.md)** — scaffold strategy routing (shipped)
- **[127](127-greenfield-project-scaffolding-and-initialization.md)** — file bootstrap quality
- **[119](119-agent-turn-ui-honesty-and-activity-compaction.md)** — activity honesty patterns
- Field report context: greenfield Todo dogfood (2026-05-26)

## Completion bookkeeping

When shipped: update **Status**, [`README.md`](../README.md) post-MVP table, [`docs/harness-roadmap.md`](../../docs/harness-roadmap.md), run **`npm run stories:html`**.
