# 160 — HTML normalize-before-prevalidate (fix 146 ordering vs repair)

**Status:** Done (2026-05-30).

**Priority:** Critical — highest-leverage fix for TaskBoard-style loops where repairable crushed HTML is rejected before `normalizeAgentWriteFileContent` runs.

**Design skill:** N/A (shared validation + main proposal path).

**Depends on:** **[146](146-pre-validation-for-edit-proposals.md)**, **[100](100-proposal-quality-auto-normalize.md)**, **[133](133-greenfield-execute-quality-regression-guard.md)**, **[153](153-enforce-creation-incremental-recovery.md)**.

## Why this story exists

Story **146** added `detectObviousCrushedRawContent` on the **raw** `write_file` payload inside `validateAgentEditProposal`, **before** disk I/O and **before** `normalizeAgentWriteFileContent`.

GrokForge already has HTML/JS repair in `agent-file-content-normalize.ts` (`reflowHtmlEmbeddedBlocks`, `repairJammedHtmlScriptInner`, `repairCrushedHtmlScriptBlocks`). Dogfood repro (TaskBoard single-file HTML, 2026-05-30) shows payloads that:

1. Fail raw pre-validation with `AGENT_EDIT_RAW_CRUSHED_PREVALIDATION_REASON` (“crushed or minified…”).
2. Would **pass** `assessProposalWriteContent` **after** normalization.

The harness is therefore rejecting fixable content and burning tool rounds on identical retries — the opposite of **100**’s “normalize + reject” intent.

## Goal

Align pre-validation with normalization so **repairable** crushed HTML (especially inline `<script>` in `.html` files) is normalized first, then gated — while still rejecting truly unrecoverable garbage before diff review.

## Agent planning — read before coding

Load **`.cursor/rules/agent-harness-engineering.mdc`** and follow its change proposal structure (goal, brittleness reduction, exact change, side effects, test plan).

**Required reading (in order):**

1. [`docs/i-am-a-harness.md`](../../docs/i-am-a-harness.md) — agent vs harness; validation as harness quality gate.
2. [`docs/harness-roadmap.md`](../../docs/harness-roadmap.md) — prototype write failure recovery wave (**151–156**).
3. [`docs/research/agentic-coding-harnesses.md`](../../docs/research/agentic-coding-harnesses.md) — § validation / patch quality patterns in OpenCode, Pi, T3 (how others order normalize vs reject).
4. [`docs/research/grokforge-harness-engineering-notes.md`](../../docs/research/grokforge-harness-engineering-notes.md) — internal notes on brittle harness loops (if present).
5. [`docs/field-reports/README.md`](../../docs/field-reports/README.md) + TaskBoard dogfood context in **[156](156-taskboard-prototype-failure-regression-eval.md)**.

**Code anchors to inspect first:**

- `src/main/agent-edit-proposals.ts` — validation order (creation recovery block → raw pre-validation → normalize → `assessProposalWriteContent`).
- `src/shared/agent-edit-corrupt-content.ts` — `detectObviousCrushedRawContent`, `assessProposalWriteContent`.
- `src/shared/agent-file-content-normalize.ts` — `normalizeAgentWriteFileContent`, HTML embedded script repair.
- `src/main/agent-edit-proposals.test.ts`, `src/shared/agent-edit-corrupt-content.test.ts`.
- Fixture: `staticTodoCrushedIndexHtml()` in `src/main/agent-eval-fixtures.ts`.

**Repro command (local sanity check before/after):**

```bash
npx tsx -e "
import { staticTodoCrushedIndexHtml } from './src/main/agent-eval-fixtures.ts';
import { normalizeAgentWriteFileContent } from './src/shared/agent-file-content-normalize.ts';
import { assessProposalWriteContent, detectObviousCrushedRawContent } from './src/shared/agent-edit-corrupt-content.ts';
const raw = staticTodoCrushedIndexHtml();
const path = '/proj/index.html';
console.log('pre raw:', detectObviousCrushedRawContent(raw, path));
const norm = normalizeAgentWriteFileContent(raw, path);
console.log('post norm:', assessProposalWriteContent(norm, { resolvedPath: path, isNewFile: true }));
"
```

Document any fixture where pre-validation and post-normalization disagree — those are the cases this story must fix.

## Narrow acceptance criteria

- [ ] For `.html` / `.htm` `write_file` ops on the `propose_file_edits` path, normalization runs **before** raw crushed pre-validation **or** pre-validation is skipped when normalized content passes `assessProposalWriteContent`.
- [ ] At least one unit test proves: raw content that triggers `AGENT_EDIT_RAW_CRUSHED_PREVALIDATION_REASON` but normalizes to valid HTML → **accepted proposal** (not rejected at pre-validation).
- [ ] Truly unrecoverable crushed JS (still fails `assessProposalWriteContent` after normalize) continues to reject — no weakening of post-normalize gates.
- [ ] Standalone `.js` / `.ts` / `.tsx` paths: behavior unchanged or strictly safer (do not broadly skip 146 for code files without explicit test coverage).
- [ ] `search_replace`-derived writes keep existing ordering (146 explicitly scoped to `propose` path).
- [ ] No new heavy dependencies (no AST parser).
- [ ] `npm run typecheck` + `npm run test` + focused `npm run test:agent-eval` tags for corrupt HTML / greenfield execute pass.

## Suggested implementation notes

**Preferred approach (pick one, document in PR):**

1. **HTML-first reorder:** For `isHtmlLikeContent` / `.html?` paths, call `normalizeAgentWriteFileContent` once, then run `detectObviousCrushedRawContent` + `assessProposalWriteContent` on the normalized string (use normalized content for the proposal body).
2. **Repair-aware skip:** Add `wouldNormalizeFixCrushedProposal(raw, path)` helper; skip raw pre-validation when true, but still fail if post-normalize assess fails.

Avoid duplicating normalize passes (max one extra normalize for HTML on the propose path).

Coordinate with **153**: a normalized-and-accepted scaffold should still respect creation-recovery size limits when enforced.

## Files / areas that should be touched (tight scope)

- `src/main/agent-edit-proposals.ts` — reorder or branch validation pipeline.
- `src/shared/agent-edit-corrupt-content.ts` — optional helper for “repairable crushed” detection; keep 146 reason strings stable for recovery counters.
- `src/shared/agent-file-content-normalize.ts` — only if a tiny exported helper avoids duplication.
- Tests: `src/main/agent-edit-proposals.test.ts`, `src/shared/agent-edit-corrupt-content.test.ts`; extend **133** / **156** evals if behavior changes.

## What is explicitly out of scope

- Weakening `detectObviousCrushedRawContent` thresholds globally to “pass more stuff.”
- Full HTML/JS parser or browser-based validation.
- Changes to renderer diff UI.
- Auto-applying normalized content without user review (normalization only affects proposal validation content, not Velocity auto-apply policy).

## Related

- **[146](146-pre-validation-for-edit-proposals.md)** — introduced the ordering this story corrects.
- **[100](100-proposal-quality-auto-normalize.md)** — normalize foundation.
- **[161](161-greenfield-work-bootstrap-prompt-appendix.md)** — prompt-side complement (ship after or in parallel; **160** is validation-side).
- **[156](156-taskboard-prototype-failure-regression-eval.md)** — may need fixture update if happy path now accepts repaired HTML.

## Completion bookkeeping

When shipped or closed: update **Status**, [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**. Add a note to [`docs/harness-eval-checklist.md`](../../docs/harness-eval-checklist.md) if manual repro steps change.
