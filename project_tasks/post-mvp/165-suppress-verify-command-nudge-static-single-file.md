# 165 — Suppress verify command nudge for static single-file HTML

**Status:** Not started.

**Priority:** Medium — TaskBoard runs ended with `run_command` failure after file creation failed; nudge pushed serve/verify inappropriately.

**Design skill:** N/A (runner nudge policy + shared heuristics).

**Depends on:** **[126](126-agent-terminal-command-execution.md)**, **[132](132-greenfield-plan-verification-commands.md)**, **[161](161-greenfield-work-bootstrap-prompt-appendix.md)**, **[162](162-single-file-html-creation-recovery-exception.md)**.

## Why this story exists

For trivial static single-file HTML apps, harness docs and **132** / `gf-plan-contract` say browser-open verification is preferred — no dev server required.

Yet TaskBoard dogfood showed **Step 8: RUN COMMAND Command request failed** after repeated edit failures. Likely causes:

- `buildPlanVerifyCommandNudge` fired because command intent heuristics matched generic “verify/build” patterns.
- Model attempted `npx serve`, `python -m http.server`, or similar when **no `index.html` existed on disk**.
- User denied approval or policy rejected — wasting the last tool round and adding noise to the activity stream.

Command nudges should **not** fire when:

- Static single-file HTML intent is detected, **and**
- No accepted edit proposal exists yet, **or**
- Plan verification explicitly says “open in browser” without a CLI command.

## Goal

Tighten runner nudge policy so static single-file HTML create flows do not inject `run_command` verify nudges until a file exists (or at all when browser-only verification applies).

## Agent planning — read before coding

Load **`.cursor/rules/agent-harness-engineering.mdc`**.

**Required reading (in order):**

1. [`docs/i-am-a-harness.md`](../../docs/i-am-a-harness.md) — guarded `run_command`, approval model.
2. [`docs/harness-roadmap.md`](../../docs/harness-roadmap.md) — **126** command harness.
3. [`docs/research/agentic-coding-harnesses.md`](../../docs/research/agentic-coding-harnesses.md) — permission / command gating patterns.
4. **[132](132-greenfield-plan-verification-commands.md)**, **[126](126-agent-terminal-command-execution.md)** — verification tier policy.
5. `src/shared/agent-plan-verification.ts` — `isUltraSimpleSingleFileStaticPlan`, serve command suggestions.
6. `src/shared/gf-plan-contract.ts` — browser-only verification copy.

**Code anchors:**

- `src/main/agent-runner.ts` — `buildPlanVerifyCommandNudge` injection site, `resolveCommandIntentText`, `commandIntent`.
- `src/shared/agent-final-answer-contract.ts` — `buildPlanVerifyCommandNudge`, `buildEditIntentToolNudge`.
- `src/shared/agent-command-intent.ts` — command intent resolution.
- `src/shared/agent-scaffold-strategy.ts` — `file_bootstrap` strategy.
- Shared helper from **162** (single-file HTML intent) — reuse, don’t duplicate.
- Tests: `src/shared/agent-plan-verification.test.ts`, `src/main/agent-runner-evaluation.test.ts` (**126** tag cases).

**Trace research:** Grep turn traces for `PLAN_VERIFY_COMMAND_NUDGE_MARKER` on failed TaskBoard turns; confirm injection conditions.

## Narrow acceptance criteria

- [ ] `shouldInjectPlanVerifyCommandNudge` (or equivalent gate in runner) returns false when:
  - static single-file HTML intent is detected (user text and/or approved plan), **and**
  - `editProposalCreated === false` on the current turn, **or**
  - plan verification string is browser-only / lacks CLI command patterns per **132** heuristics.
- [ ] When `scaffoldStrategy === 'file_bootstrap'` and verification is browser-only, nudge copy does not suggest serve commands as required step (align with existing **132** ultra-simple static plan tests).
- [ ] After a successful `index.html` proposal on static single-file turn, optional lightweight serve remains **allowed but not nudged** (no regression to multi-file static sites that benefit from serve hints).
- [ ] Final-answer contract still forbids claiming verify success when commands failed (**126**).
- [ ] Unit tests for nudge gate; extend **126** / **132** eval or add small runner eval asserting no verify nudge on direct Work TaskBoard failure fixture (**163** sibling).
- [ ] `npm run typecheck` + `npm run test` + relevant `npm run test:agent-eval` pass.

## Suggested implementation notes

- Prefer extending `resolveCommandIntentText` / runner guard over adding new mid-turn user messages.
- Reuse `isUltraSimpleSingleFileStaticPlan` for approve-and-run; add parallel user-text heuristic for direct Work (**161** / **162** helpers).
- Do not disable `run_command` tool entirely — only suppress **harness nudge** that pressures the model to call it.
- Log suppressed nudge in dev harness metrics (optional `nudgesSuppressed` field — only if **137** patterns make it cheap).

## Files / areas that should be touched (tight scope)

- `src/main/agent-runner.ts` — nudge injection guard.
- `src/shared/agent-plan-verification.ts` and/or `src/shared/agent-command-intent.ts` — shared predicate.
- `src/shared/agent-final-answer-contract.ts` — only if nudge builder needs strategy-aware branch.
- Tests as above.

## What is explicitly out of scope

- Changing run_command policy tiers or approval UI (**126**).
- Auto-running browser open (no OS integration).
- Removing serve suggestions from **plan mode** `gf-plan` schema text globally.

## Related

- **[161](161-greenfield-work-bootstrap-prompt-appendix.md)** — prompt says browser-only; this story aligns runner behavior.
- **[163](163-direct-work-taskboard-greenfield-eval.md)** — assert no verify nudge in failure scenario.
- **[164](164-renderer-final-answer-fence-guard.md)** — independent UX hardening.

## Completion bookkeeping

When shipped or closed: update **Status**, [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
