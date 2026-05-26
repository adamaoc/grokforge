# 124 — Greenfield executor code quality and proposal recovery (Phase A)

**Status:** Done (2026-05-26).

**Priority:** **Phase A** — slightly higher than **[125](125-agent-turn-activity-clarity-and-chat-vertical-space.md)** (harness reliability blocks successful multi-file execute before UI polish pays off).

**Design skill:** N/A (harness prompts, validation, runner recovery); read [`styleguide-design`](../../.cursor/skills/styleguide-design/SKILL.md) only if proposal rejection UX copy changes.

## Why this story exists

**Dogfood session (2026-05-26, greenfield Todo app):** After approving a simple multi-file plan (HTML + CSS + JS), planning worked and **HTML/CSS proposals applied**, but **`script.js` repeatedly failed validation** with messages like *corrupted / orphan closing parentheses*. Only **2 of 3** planned files landed on disk because the JS `write_file` kept getting rejected while the turn still felt “mostly done.”

This is a **harness quality and recovery** problem, not a Plan-mode routing issue (**118**, **120** already shipped). Existing guards (**115**, **116**, `agent-edit-corrupt-content.ts`, crushed-script detection) catch bad output but do not yet **steer the executor** toward clean multi-file JS on the first or second attempt, nor **recover gracefully** when one path in a batch is rejected.

## Goals

1. **Higher-quality first proposals:** Strengthen greenfield **execute** guidance so new apps prefer **`index.html` + `styles.css` + `script.js`** (or equivalent) with **real line breaks**, valid JS syntax, and **no inline crushed `<script>`** when the plan calls for separate files.
2. **JS-specific validation clarity:** Tune corrupt-content / proposal-quality checks for `.js` so true positives stay high but rejection reasons are actionable (what to fix, not generic “corrupted”).
3. **Normalization before reject:** Where safe, auto-normalize common model mistakes (glued statements, orphan `)` lines, one-line stubs) before hard rejection — align with **100** markdown normalize patterns where applicable.
4. **Partial-batch recovery:** When a multi-file `propose_file_edits` accepts some paths and rejects others (e.g. HTML ok, JS corrupt), inject a **single mid-turn recovery nudge** or final-answer contract line: re-read `rawContent`, resubmit **only failed paths** with complete file bodies — do not claim the turn fully succeeded.
5. **Single-file vs multi-file bias:** When the approved plan lists multiple concrete paths, discourage executor from stuffing all JS into `index.html`; reinforce **120** single-file bias only when the workspace/index is actually single-file post-bootstrap.
6. **Eval regressions:** Add focused harness eval cases for greenfield execute producing valid `script.js` (or honest failure after bounded retries).

## Non-goals

- Replacing corrupt-content detection with “trust the model.”
- Chat UI spinners, scrolling, or activity layout (**125**).
- Changing approve-and-run routing or Plan card apply semantics (**123**).

## Scope

- [`src/shared/agent-harness-profile.ts`](../../src/shared/agent-harness-profile.ts) — `GREENFIELD_EXECUTE_BOOTSTRAP_SECTIONS`, executor-from-plan appendices, multi-file JS guidance
- [`src/shared/agent-edit-corrupt-content.ts`](../../src/shared/agent-edit-corrupt-content.ts) — JS orphan-paren / jammed-source heuristics and rejection copy
- [`src/shared/agent-proposal-quality.ts`](../../src/shared/agent-proposal-quality.ts) / [`src/shared/agent-file-content-normalize.ts`](../../src/shared/agent-file-content-normalize.ts) — optional JS normalize pass
- [`src/main/agent-edit-proposals.ts`](../../src/main/agent-edit-proposals.ts) — `validateAgentEditProposal`, partial rejection handling
- [`src/main/agent-runner.ts`](../../src/main/agent-runner.ts) — recovery nudge when batch has accepted + rejected ops; final-answer honesty for partial execute
- [`src/shared/agent-final-answer-contract.ts`](../../src/shared/agent-final-answer-contract.ts) — partial multi-file failure appendix
- [`src/main/agent-runner-evaluation.test.ts`](../../src/main/agent-runner-evaluation.test.ts) + [`src/shared/agent-eval-tags.ts`](../../src/shared/agent-eval-tags.ts)

## Suggested eval tags

Add to `agent-eval-tags.ts` and use in `agent-runner-evaluation.test.ts` names/comments:

| Tag | Intent |
|-----|--------|
| `behavior:greenfield_execute` | Approve-and-run over empty/near-empty workspace with multi-file plan |
| `validation:js_corruption` | Reject or recover crushed/invalid `script.js` proposals |
| `recovery:partial_batch` | Some `write_file` ops accepted, one path rejected — harness nudge + honest final answer |

## Acceptance criteria

- [x] Eval or fixture: greenfield execute turn with plan paths `index.html`, `styles.css`, `script.js` — valid non-crushed `script.js` content passes validation (or deterministic reject + recovery nudge within the same turn).
- [x] Eval: intentionally corrupt `script.js` proposal triggers rejection with reason mentioning fix strategy (full file from `rawContent`, line breaks, separate file) — not a generic one-liner.
- [x] When a multi-file proposal has ≥1 accepted op and ≥1 rejected op, main injects recovery guidance once and final-answer contract forbids claiming all planned files were created.
- [x] Executor harness appendix for multi-file greenfield explicitly prefers external `script.js` over inline crushed scripts when the plan lists separate JS path.
- [x] `npm run test:agent-eval` and `npm run typecheck` pass; update corrupt-content / edit-proposal unit tests if heuristics change.

## Related

- **[101](101-greenfield-plan-quality.md)** — planner greenfield plan shape
- **[100](../100-proposal-quality-auto-normalize.md)** — markdown normalize / stub reject
- **[115](115-agent-edit-cascade-guard-after-search-replace-failures.md)**, **[116](116-agent-edit-search-replace-escalation-nudge.md)** — S&R escalation
- **[120](120-post-plan-executor-routing-and-single-file-edits.md)** — post-plan / single-file bias (do not over-apply to fresh multi-file execute)
- **[069](../069-plan-approve-auto-agent-turn.md)** — approve-and-run
- **[125](125-agent-turn-activity-clarity-and-chat-vertical-space.md)** — UI noise (Phase B)

## Completion bookkeeping

When shipped: update **Status**, [`README.md`](../README.md) post-MVP table, [`docs/harness-roadmap.md`](../../docs/harness-roadmap.md) if debt row added, run **`npm run stories:html`**.
