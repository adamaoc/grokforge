# 162 — Single-file HTML creation recovery exception (153 policy tune)

**Status:** Done (2026-05-30).

**Priority:** High — creation incremental recovery (153) blocks large bootstraps that conflict with explicit “one html file” user intent.

**Design skill:** N/A (validation thresholds + recovery nudges).

**Depends on:** **[153](153-enforce-creation-incremental-recovery.md)**, **[149](149-improved-recovery-loop-after-rejected-proposals.md)**, **[160](160-html-normalize-before-prevalidate.md)**, **[161](161-greenfield-work-bootstrap-prompt-appendix.md)**.

## Why this story exists

After **≥2** integrity rejections on a **new path**, **153** enforces:

- `CREATION_RECOVERY_MAX_SCAFFOLD_LINES = 32`
- `CREATION_RECOVERY_MAX_SCAFFOLD_CHARS = 1200`

via `assessCreationRecoveryBootstrapBlock` in `agent-creation-recovery-enforcement.ts`.

For TaskBoard-style requests (“keep this all as **1 single html file**”), a valid kanban prototype cannot fit that box. The model then:

1. Gets `AGENT_EDIT_MINIMAL_SCAFFOLD_REQUIRED_REASON` on every full-file retry.
2. Keeps calling `propose_file_edits` instead of the **`edit`** tool path the nudge recommends.
3. Never reaches an accepted proposal before **151** force-final.

Recovery policy is correct for **broken repeated full-file rewrites** but needs a **single-file HTML exception** when user intent is explicit.

## Goal

When creation incremental recovery is active for a **new `.html` path** and user/plan text explicitly requests a **single-file HTML app**, allow a **bounded but usable** bootstrap path — either raised thresholds or a mandated two-step recipe (shell → `edit` script) — without weakening anti-crush validation.

## Agent planning — read before coding

Load **`.cursor/rules/agent-harness-engineering.mdc`**.

**Required reading (in order):**

1. [`docs/i-am-a-harness.md`](../../docs/i-am-a-harness.md) — validation gates, honesty contracts, incremental recovery philosophy.
2. [`docs/harness-roadmap.md`](../../docs/harness-roadmap.md) — prototype write failure wave.
3. [`docs/research/agentic-coding-harnesses.md`](../../docs/research/agentic-coding-harnesses.md) — § patch strategies, incremental file creation in Pi/OpenCode (how others bootstrap large files).
4. [`docs/research/grokforge-harness-engineering-notes.md`](../../docs/research/grokforge-harness-engineering-notes.md).
5. **[153](153-enforce-creation-incremental-recovery.md)**, **[149](149-improved-recovery-loop-after-rejected-proposals.md)**, **[148](148-better-incremental-editing-strategy.md)** — incremental vs full rewrite policy.
6. **[144](144-consolidate-incremental-work-edit-policy.md)** — keep recovery copy consistent with consolidated policy.

**Code anchors:**

- `src/shared/agent-creation-recovery-enforcement.ts` — thresholds, `assessCreationRecoveryBootstrapBlock`.
- `src/shared/agent-final-answer-contract.ts` — `buildCreationIncrementalRecoveryNudge`, honesty markers.
- `src/main/agent-runner.ts` — creation recovery state, nudge injection, `recordCreationScaffoldAccepted`.
- `src/main/agent-edit-proposals.ts` — passes enforcement sets into validation.
- `src/shared/iterative-edit-scope.ts` — single-file scope detection (reuse, don’t fork).
- Tests: `src/shared/agent-creation-recovery-enforcement.test.ts`, `src/main/agent-runner-evaluation.test.ts` (**156** may need updating).

**Intent detection research task:** Survey existing heuristics before adding new regex:

- `isLikelyEditIntent`, `resolveIterativeEditScope`, `planImpliesStaticFileBootstrap`, user text in **156** fixture `TASKBOARD_PROTOTYPE_USER_PROMPT`.

Prefer **one shared helper** e.g. `userRequestsSingleFileHtml(userText, plan?)` in `src/shared/` (not runner-local).

## Narrow acceptance criteria

- [ ] Shared helper detects explicit single-file HTML intent (user text and/or approved plan with only `index.html` or “single-file” wording).
- [ ] When creation recovery is enforced for a new `.html` path **and** single-file HTML intent is true, one of these **documented strategies** is implemented:
  - **Strategy A (threshold bump):** Raised limits for first scaffold only (e.g. ≤80 lines / ≤4000 chars) — still subject to post-normalize integrity gates.
  - **Strategy B (two-step recipe):** Default scaffold max stays 32/1200 but nudge + rejection reason mandate: (1) HTML shell + column markup, **no script**; (2) after accept, **`edit`** to append `<script>` in one or more chunks.
- [ ] Non-single-file greenfield paths (multi-file static, `App.tsx`, etc.) keep **153** defaults unchanged.
- [ ] After first accepted scaffold on the path, `recordCreationScaffoldAccepted` lifts enforcement — incremental extension via `edit` / normal propose paths works.
- [ ] Updated `buildCreationIncrementalRecoveryNudge` (or sibling HTML-specific nudge after first crushed `.html` rejection) tells the model **exactly** which strategy applies.
- [ ] Final-answer honesty (**152**) still fires when recovery unmet.
- [ ] Unit tests for helper + enforcement block; update **156** eval if threshold strategy changes expected rejection counts.
- [ ] `npm run typecheck` + `npm run test` + `npm run test:agent-eval` pass.

## Suggested implementation notes

- **Do not** weaken `detectObviousCrushedRawContent` or skip integrity checks — only adjust **size enforcement** or **recovery instructions**.
- Strategy B may interact better with **160** (normalize repairs script after shell exists on disk).
- If choosing Strategy A, document why in story PR notes (tradeoff: larger bad proposals could slip through normalize — post-gates must still catch).
- Coordinate with **151**: force-final threshold unchanged unless eval proves loops still burn 8 rounds.

## Files / areas that should be touched (tight scope)

- `src/shared/agent-creation-recovery-enforcement.ts` — conditional thresholds or bypass for single-file HTML.
- New small module e.g. `src/shared/agent-single-file-html-intent.ts` + tests (if helper doesn’t fit existing files cleanly).
- `src/shared/agent-final-answer-contract.ts` — nudge copy for HTML single-file recovery.
- `src/main/agent-runner.ts` — pass user/plan context into validation options if needed.
- `src/main/agent-edit-proposals.ts` — wire context into `assessCreationRecoveryBootstrapBlock`.
- Tests + eval updates as above.

## What is explicitly out of scope

- Removing creation incremental recovery entirely.
- Auto-splitting user’s single-file request into multi-file `index.html` + `script.js` without user consent.
- Harness-generated template files on disk (future idea).
- Reviewer auto-repair (**150** follow-up).

## Related

- **[153](153-enforce-creation-incremental-recovery.md)** — baseline enforcement this story tunes.
- **[160](160-html-normalize-before-prevalidate.md)** — validation repair should land first or ship together.
- **[163](163-direct-work-taskboard-greenfield-eval.md)** — eval should cover this policy path.

## Completion bookkeeping

When shipped or closed: update **Status**, [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
