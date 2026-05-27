# 139 — Iterative Work search_replace quality guidance (first-attempt success)

**Status:** Done (2026-05-27).

**Priority:** **Second** among **138–140** — dogfood “remove todo button” failed **`search_replace`** repeatedly because `old_string` likely did not match disk/`rawContent` (guessed handlers, wrong whitespace, line-number field misuse). **116** escalates **after** failure; **138** forces switch sooner. **139** reduces **first-attempt** failures so iterative Work rarely enters the failure loop.

**Design skill:** N/A (harness prompts + tool descriptions).

## Why this story exists

The harness tells models to use `search_replace` with exact `old_string` (**AGENT_TOOL_LOOP_CORE**), but iterative Work turns lack **action-specific** guidance:

| Gap | Symptom on small UI edits |
|-----|---------------------------|
| No checklist before first S&R | `old_string` from memory or numbered `content` field |
| Tool description is generic | Model patches wrong function or minified one-line script |
| No pattern for “add button / remove handler” | Multiple tries tweaking overlapping regions |
| Error payload is terse | Model retries with minor edits instead of re-copying `rawContent` |

**130** appendix mentions localized S&R for large files but not **how** to build a reliable `old_string` for vanilla JS todo apps.

## Goals

### 1. Iterative Work S&R appendix (harness profile)

Add `WORK_ITERATIVE_SEARCH_REPLACE_SECTIONS` in [`agent-harness-profile.ts`](../../src/shared/agent-harness-profile.ts) (included when `iterativeWorkEdit`):

1. **Before first `search_replace`:** `read_file` target path; copy `old_string` **only** from **`rawContent`** (never from `content` line numbers).
2. **Context window:** include **3–8 complete lines** above and below the change; `old_string` must appear **exactly once** in the file.
3. **`contentHash`:** pass through from latest `read_file` on that path.
4. **Vanilla JS todo apps:** prefer editing the **event listener / render function** block as one contiguous span; for “add remove button”, extend the todo item template and `deleteTodo` handler in **one** patch.
5. **When file is one long line or &lt;20 lines:** skip S&R — use **`propose_file_edits`** immediately (**138** aligns).

Stable marker: `WORK_ITERATIVE_SR_QUALITY_MARKER` (eval).

### 2. Executor tool description override

In [`agent-harness-profile.ts`](../../src/shared/agent-harness-profile.ts) `toolDescriptionOverrides` for `search_replace` when `iterativeWorkEdit`:

- Emphasize verbatim copy, once-only match, and `rawContent`.
- Link to line-number strip behavior (**116**) if `old_string` looks like numbered lines.

Wire through [`agent-workspace-tools.ts`](../../src/main/agent-workspace-tools.ts) / snapshot builder (**105**) so override applies to xAI `tools` array on iterative turns only.

### 3. Pre-edit intent hint (runner, optional)

When `iterativeWorkEdit` + `isLikelyEditIntent` + message matches **localized UI** regex (`add\s+.*button`, `remove\s+todo`, `delete\s+button`, `click handler`):

- Inject **one** system or user hint **before first tool sample** (not after failure): “Localized UI edit — read `script.js` (or active file), then one precise `search_replace` with multi-line `old_string` from `rawContent`, or `propose_file_edits` if the file is short.”

Once per turn; coordinate with **136** scope resolver (prefer single file).

### 4. Richer `search_replace` not-found errors

In [`agent-search-replace-tool.ts`](../../src/main/agent-search-replace-tool.ts) / [`agent-search-replace.ts`](../../src/shared/agent-search-replace.ts):

- On not found: include **`rawContent` hint** (already partial in **116**), plus **first 120 chars** of closest line or “0 matches / N substring matches” if cheap to compute.
- Do **not** implement fuzzy apply — guidance only.

### 5. Eval / unit tests

- Unit: iterative harness sections contain `WORK_ITERATIVE_SR_QUALITY_MARKER`.
- Eval: iterative Work + “add delete button” → first tool_sample system/tools include SR quality override text.
- Manual checklist row in [`docs/harness-eval-checklist.md`](../../docs/harness-eval-checklist.md).

## Scope

- [`src/shared/agent-harness-profile.ts`](../../src/shared/agent-harness-profile.ts)
- [`src/shared/iterative-work-edit.ts`](../../src/shared/iterative-work-edit.ts) — optional `isLocalizedUiEditIntent(userText)` helper
- [`src/shared/agent-search-replace.ts`](../../src/shared/agent-search-replace.ts)
- [`src/main/agent-search-replace-tool.ts`](../../src/main/agent-search-replace-tool.ts)
- [`src/main/agent-turn-snapshot-builder.ts`](../../src/main/agent-turn-snapshot-builder.ts) — tool overrides on snapshot
- [`src/main/agent-runner.ts`](../../src/main/agent-runner.ts) — pre-edit hint injection
- [`src/shared/agent-harness-profile.test.ts`](../../src/shared/agent-harness-profile.test.ts)
- [`src/main/agent-runner-evaluation.test.ts`](../../src/main/agent-runner-evaluation.test.ts)

## Non-goals

- Changing S&R matching algorithm to fuzzy/LSP (**085** scope).
- **138** post-failure blocks (separate story).
- **137**/**140** metrics (separate).
- Auto-generating `old_string` from AST.

## Risks

| Risk | Mitigation |
|------|------------|
| **Prompt bloat** | Iterative-only sections; slim default tool loop unchanged |
| **Over-biasing to full-file proposal** | Copy says “short file → propose_file_edits”; **139** still allows S&R when file is multi-line |

## Dependencies

- **Builds on:** **[130](130-work-iterative-edit-harness.md)**, **[116](116-agent-edit-search-replace-escalation-nudge.md)**, **[085](085-agent-search-replace-tool.md)**, **[103](103-agent-harness-per-model-profiles.md)**.
- **Best with:** **[138](138-iterative-work-search-replace-escalation.md)** — success path + failure path together in dogfood.
- **Related:** **[136](136-iterative-edit-scope-and-combine-heuristics.md)**.

## Acceptance criteria

- [x] Eval: `iterativeWorkEdit` turn includes `WORK_ITERATIVE_SR_QUALITY_MARKER` in harness sections.
- [x] Eval: tool definition for `search_replace` on iterative turn mentions `rawContent` and once-only match (snapshot or transport assertion).
- [x] Unit: `isLocalizedUiEditIntent('add a remove todo button')` true; `refactor entire app` false.
- [x] Manual: remove-todo button request → first S&R succeeds **or** fails once with error hint sufficient to succeed on second read+patch without hitting max iterations.
- [x] Non-iterative Work/default profile tool descriptions unchanged (spot-check eval).
- [x] `npm run typecheck` and tests pass.

## Related

- **[138](138-iterative-work-search-replace-escalation.md)**
- **[135](135-iterative-work-surgical-edit-enforcement.md)**
- **[100](100-proposal-quality-auto-normalize.md)**

## Completion bookkeeping

When shipped: update **Status**, [`README.md`](../README.md) post-MVP table, [`docs/harness-roadmap.md`](../../docs/harness-roadmap.md), run **`npm run stories:html`**.
