# 161 — Greenfield Work bootstrap prompt appendix (direct creation, no plan)

**Status:** Done (2026-05-30).

**Priority:** High — empty-folder Work turns currently miss the rich HTML/JS bootstrap copy that only injects on approve-and-run.

**Design skill:** N/A (harness prompt strings only); `@styleguide-design` only if composer copy references new UX nudges.

**Depends on:** **[101](101-greenfield-plan-quality.md)**, **[127](127-greenfield-project-scaffolding-and-initialization.md)**, **[128](128-greenfield-scaffold-strategy-routing.md)**, **[160](160-html-normalize-before-prevalidate.md)** (validation-side complement; can ship in parallel).

## Why this story exists

`GREENFIELD_EXECUTE_BOOTSTRAP_SECTIONS` in `agent-harness-profile.ts` injects only when **all** of:

- `ctx.executeFromApprovedPlan === true`
- `ctx.greenfieldWorkspace === true`
- harness profile `grok_code_fast`

Direct **Work** mode on an **empty greenfield** folder (TaskBoard repro: “single html file” prototype) gets **none** of that appendix. Meanwhile:

- `shouldRouteIterativeWorkExecutor` **explicitly excludes** greenfield workspaces (**130**).
- `singleFilePrimary` is false when the index has zero files.
- `resolveScaffoldStrategy` often returns `null` because user text like “single html file” / “taskboard prototype” does not match `STATIC_USER_RE` in `agent-scaffold-strategy.ts`.

The model receives generic code-quality rules but not greenfield-specific guidance: multi-line HTML, inline script formatting, when **not** to run `npm create`, browser-only verification, etc. That prompt gap contributes to crushed single-file proposals and wasted tool rounds.

## Goal

When a **fast / Work** turn targets a **greenfield workspace** with **edit/create intent** and **without** approve-and-run, inject a **Work-safe subset** of greenfield bootstrap guidance — without duplicating full plan-mode or execute-from-plan blocks.

## Agent planning — read before coding

Load **`.cursor/rules/agent-harness-engineering.mdc`**. Do **not** add TaskBoard-specific copy; keep guidance general (harness engineering anti-pattern: project-specific prompt tuning).

**Required reading (in order):**

1. [`docs/i-am-a-harness.md`](../../docs/i-am-a-harness.md) — § per-model profiles, plan vs execute, context delivery.
2. [`docs/harness-roadmap.md`](../../docs/harness-roadmap.md) — greenfield / dual-model program.
3. [`docs/research/agentic-coding-harnesses.md`](../../docs/research/agentic-coding-harnesses.md) — how OpenCode/Hermes/Pi split **plan** vs **build** system prompts; note prompt layering patterns.
4. [`docs/research/grokforge-harness-engineering-martin-fowler.md`](../../docs/research/grokforge-harness-engineering-martin-fowler.md) — stability / separation of concerns (if relevant to prompt scope).
5. [`docs/field-reports/agent-harness-comparison.html`](../../docs/field-reports/agent-harness-comparison.html) — happy path: Plan → approve → execute vs direct Work.
6. Story **[118](118-work-vs-plan-mode-and-conversation-lifecycle.md)** — when Work vs Plan is intentional product behavior.

**Code anchors:**

- `src/shared/agent-harness-profile.ts` — `buildHarnessTurnPromptSections`, `GREENFIELD_EXECUTE_BOOTSTRAP_SECTIONS`, `HarnessPromptTurnContext`.
- `src/shared/agent-scaffold-strategy.ts` — `STATIC_USER_RE`, `resolveScaffoldStrategy` (expand heuristics carefully).
- `src/shared/workspace-greenfield.ts` — `isGreenfieldWorkspace`, static bootstrap plan hints.
- `src/shared/iterative-work-edit.ts` — why greenfield excludes iterative Work (do not conflate).
- `src/main/agent-runner.ts` — `harnessCtx` assembly (~line 1277).
- Tests: `src/shared/agent-harness-profile.test.ts`, `src/main/agent-runner-evaluation.test.ts`.

**Trace inspection:** Run a local dev turn or eval with empty root + “create a single html file prototype” and confirm whether `GREENFIELD_EXECUTE_BOOTSTRAP` marker appears in turn trace / snapshot system text **before** implementing.

## Narrow acceptance criteria

- [ ] New stable marker constant (e.g. `GREENFIELD_WORK_BOOTSTRAP_MARKER`) and appendix sections inject when:
  - `chatMode === 'fast'`
  - `greenfieldWorkspace === true`
  - `executeFromApprovedPlan !== true`
  - turn has edit/create intent (`isLikelyEditIntent(userText)` or equivalent runner flag)
  - harness profile is `grok_code_fast` or `grok_4_3` (match existing greenfield section conventions)
- [ ] Appendix includes **general** guidance for:
  - static / single-file HTML creation (multi-line source, one statement per line in JS)
  - when user explicitly requests **one HTML file**, inline `<script>` is allowed but must not be crushed/minified
  - prefer browser-open verification over dev-server commands for trivial static single-file apps
  - do **not** run `npm create` / scaffold CLI unless user asked for a framework
- [ ] Appendix does **not** duplicate full `EXECUTOR_FROM_PLAN_SECTIONS` or plan artifact references.
- [ ] `STATIC_USER_RE` (or sibling heuristic) expanded to detect common phrasing: “single html file”, “one html file”, “prototype”, “static page”, “vanilla” — **without** matching every “build/create” message (avoid false CLI/file-bootstrap conflicts).
- [ ] `resolveScaffoldStrategy` returns `file_bootstrap` for expanded static heuristics on greenfield Work turns when appropriate.
- [ ] Existing approve-and-run greenfield execute prompts unchanged (no double-injection of conflicting lines).
- [ ] Unit test: `buildHarnessTurnPromptSections` includes new marker for greenfield Work context.
- [ ] Eval or snapshot test: system prompt for empty-root Work edit intent includes marker; plan-mode and populated-workspace iterative turns do **not**.
- [ ] `npm run typecheck` + `npm run test` + `npm run test:agent-eval` pass.

## Suggested implementation notes

- Extract a shared `GREENFIELD_STATIC_FILE_RULES` slice from `GREENFIELD_EXECUTE_BOOTSTRAP_SECTIONS` to avoid drift (DRY between execute-from-plan and Work-direct).
- Keep appendix **short** (≤12 bullets) — long prompts regress other flows (**103** profile tuning lesson).
- If user text implies multi-file static (`index.html` + `styles.css` + `script.js`), retain **128** guidance: external `<script src="…">` over crushed inline JS when plan/user lists separate JS paths.
- Do not auto-switch the user to Plan mode in this story (product nudge is **future** backlog).

## Files / areas that should be touched (tight scope)

- `src/shared/agent-harness-profile.ts` — new sections + injection conditions.
- `src/shared/agent-scaffold-strategy.ts` — heuristic expansion + tests.
- `src/shared/workspace-greenfield.ts` — only if shared static-detection helpers belong here.
- `src/shared/agent-harness-profile.test.ts`, `src/shared/agent-scaffold-strategy.test.ts`.
- `src/main/agent-runner-evaluation.test.ts` — one focused system-prompt assertion.
- Optional: `src/shared/agent-eval-tags.ts` — tag for new eval case.

## What is explicitly out of scope

- Forcing Plan mode on greenfield create intents (UI/product story).
- Changing model routing or agent profiles.
- Validation pipeline changes (**160** owns that).
- Voice harness appendix changes (**113**).

## Related

- **[127](127-greenfield-project-scaffolding-and-initialization.md)**, **[128](128-greenfield-scaffold-strategy-routing.md)** — scaffold strategy ancestors.
- **[130](130-work-iterative-edit-harness.md)** — populated Work only; this story is the greenfield Work counterpart.
- **[162](162-single-file-html-creation-recovery-exception.md)** — recovery policy after prompts improve.

## Completion bookkeeping

When shipped or closed: update **Status**, [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
