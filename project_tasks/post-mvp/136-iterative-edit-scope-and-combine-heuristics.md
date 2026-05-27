# 136 — Iterative edit scope and combine heuristics

**Status:** Done (2026-05-27).

**Priority:** **Second** among **135–137** — complements **135** enforcement with **detection**: infer when the user’s ask fits **one file / one proposal** and guide the model before thrash accumulates. Dogfood localStorage on a vanilla Todo app is a **single-concern, 1–2 path** change (`script.js`, maybe `index.html`) — ideal for **one** `read_file` + **one** `propose_file_edits`, not many rounds of `search_replace`.

**Design skill:** N/A (harness).

## Why this story exists

**130** tells the model “one proposal per turn” in prose. The harness does not **compute** scope from the user message or early tool pattern:

| Signal available | Unused today |
|------------------|--------------|
| User text: “localStorage”, “persist”, “save todos” | No `narrowEditScope` hint in system prompt |
| Active file in UI context | Mentioned in **130** appendix but not passed as **mandatory first read** in runner |
| First `read_file` already returned `rawContent` | Model still re-reads and patches incrementally |
| Multiple S&R on same file | **mergeAgentEditProposals** composes for UI — model not nudged **before** round 3 |

**135** adds hard caps and thrash nudges; **136** adds **proactive** guidance so the model chooses the right edit **shape** early.

## Goals

### 1. `resolveIterativeEditScope(input)` (shared)

New module [`iterative-edit-scope.ts`](../../src/shared/iterative-edit-scope.ts):

```ts
type IterativeEditScope = {
  kind: 'single_file' | 'few_files' | 'broad'
  likelyPaths: readonly string[]  // basenames or hints, not absolute unless from context
  preferFullFileProposal: boolean
  rationale: string  // for harness copy, not shown to user raw
}
```

Heuristics (deterministic, testable):

| Input | `kind` | `preferFullFileProposal` |
|-------|--------|----------------------------|
| Persistence/storage/API-hook verbs + 1–2 path hints | `single_file` | **true** for `.js` / `script.js` |
| “add button”, “fix typo”, CSS tweak | `single_file` | false — localized S&R OK |
| “refactor”, “across the app”, many paths in message | `broad` | false — may need multi-path proposal |
| `activeFilePath` set + short user message | `single_file` | true when file &lt; ~200 lines (optional line count from last read) |

Export marker `ITERATIVE_EDIT_SCOPE_MARKER` for eval.

### 2. Inject scope block at turn start

When `iterativeWorkEdit`, append compact section to harness turn prompt ([`buildHarnessTurnPromptSections`](../../src/shared/agent-harness-profile.ts)):

- “**Resolved scope:** single-file — implement localStorage in `script.js` with **one** `propose_file_edits` after `read_file`.”
- Do **not** emit new `gf-plan`.

### 3. Early combine recommendation (mid-turn)

In runner, after first successful `read_file` on scoped path:

- If scope is `single_file` + `preferFullFileProposal` and first tool sample is `search_replace` → inject **one** user nudge: use `propose_file_edits` with full `rawContent` instead (**135** may share builder).
- If **two** paths read but scope is `single_file` → nudge to drop unrelated paths.

Coordinate with **135** so only one mid-turn “shape” nudge fires (priority: scope → consolidation → discovery saturation).

### 4. Tests and eval

- Unit: `resolveIterativeEditScope('add localStorage for todos')` → `single_file`, `preferFullFileProposal: true`.
- Eval: `behavior:iterative_edit_scope_single_file` — system prompt contains scope marker + `script.js` hint for Todo fixture.

## Scope

- [`src/shared/iterative-edit-scope.ts`](../../src/shared/iterative-edit-scope.ts) *(new)* + tests
- [`src/shared/iterative-work-edit.ts`](../../src/shared/iterative-work-edit.ts) — wire `shouldRouteIterativeWorkExecutor` exports if needed
- [`src/shared/agent-harness-profile.ts`](../../src/shared/agent-harness-profile.ts) — scope section builder
- [`src/main/agent-runner.ts`](../../src/main/agent-runner.ts) — pass `activeContext.activeFilePath`, inject scope + early nudge
- [`src/main/agent-runner-evaluation.test.ts`](../../src/main/agent-runner-evaluation.test.ts)
- [`src/shared/agent-turn-routing.ts`](../../src/shared/agent-turn-routing.ts) — only if routing metadata should expose scope for traces (**137**)

## Non-goals

- ML classification of user intent.
- Automatic application of proposals (**118** temperament unchanged).
- Changing merge logic in [`agent-edit-proposal-merge.ts`](../../src/shared/agent-edit-proposal-merge.ts) — consume outcomes, don’t rewrite merge.
- Greenfield flows.

## Risks

| Risk | Mitigation |
|------|------------|
| **Wrong scope blocks valid multi-file work** | `broad` fallback when message lists ≥3 paths or “refactor” |
| **Conflicts with 135 nudges** | Document nudge priority in runner; eval both stories together |
| **Active file wrong root** | Scope hints use basename; absolute path only from context when validated |

## Dependencies

- **Builds on:** **[130](130-work-iterative-edit-harness.md)**, **[120](120-post-plan-executor-routing-and-single-file-edits.md)** (single-file bias pattern).
- **Best with:** **[135](135-iterative-work-surgical-edit-enforcement.md)** shipped or in same PR wave — shared nudge builders.

## Acceptance criteria

- [x] Unit tests cover localStorage, typo fix, and multi-file refactor messages.
- [x] Eval: iterative Work + localStorage → turn system sections include `ITERATIVE_EDIT_SCOPE_MARKER` and single-file guidance.
- [x] Eval: `search_replace` as first edit on `single_file` + `preferFullFileProposal` → full-file proposal nudge (once).
- [x] Regression: post-plan incremental edit does not get iterative scope block (**120**).
- [x] `npm run typecheck` and tests pass.

## Related

- **[135](135-iterative-work-surgical-edit-enforcement.md)**
- **[130](130-work-iterative-edit-harness.md)**
- **[100](100-proposal-quality-auto-normalize.md)** — full-file quality
- **[082](../082-agent-read-before-write.md)** — read before write (if story exists; else agent-tool-loop rules)

## Completion bookkeeping

When shipped: update **Status**, [`README.md`](../README.md) post-MVP table, [`docs/harness-roadmap.md`](../../docs/harness-roadmap.md), run **`npm run stories:html`**.
