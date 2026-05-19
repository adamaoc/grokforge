# 111 — Harness roadmap and retrospective documentation

**Status:** Post-MVP backlog.

**Design skill:** N/A (docs only).

**Depends on:** None (can start early; update as stories ship).

## Why this story exists

Harness learnings are spread across [`docs/i-am-a-harness.md`](../../docs/i-am-a-harness.md), research notes, chat retrospectives, and **082–100** story files. Contributors need a single **program index**: what works, what failed because the harness was wrong, implementation order, and dual-model strategy.

## Goals

### 1. `docs/harness-roadmap.md` (new)

Sections:

1. **Agent = model + harness** (one paragraph + link to `i-am-a-harness.md`).
2. **Dual-model strategy** — `grok-code-fast-1` + `grok-4.3` on purpose; table mapping manifest slots → profile keys (**102** / **103**).
3. **What already works** — bullet list (tool loop, edit trust, plan contract, etc.) with story ids.
4. **Harness debt retrospective** — condensed “symptom → harness cause → fix story” table (from product research).
5. **Implementation waves** — ordered list **102 → 103 → 104 → 097 → 101 → 098 → 105–110 → 112–114** with one-line scope each.
6. **Out of scope / closed** — **090**, **089**, fenced protocol deprecation (**114**).
7. **Evaluation** — link **108**, **063**, `docs/harness-eval-checklist.md`.

### 2. Cross-links

- `AGENTS.md` agent chat section → harness roadmap.
- `docs/i-am-a-harness.md` → “Program status” link at top.
- `.cursor/rules/grokforge-overview.mdc` one-line pointer (optional, minimal).

### 3. `project_tasks/README.md` harness wave

Ensure post-MVP table and **Suggested backlog order** reflect new ids (**103–114**) — coordinate with this story’s PR or do in same PR.

## Non-goals

- Changing application code.
- Replacing `i-am-a-harness.md` (roadmap is the **index**, harness doc stays the **textbook**).

## Acceptance criteria

- [ ] `docs/harness-roadmap.md` exists and matches shipped/post-MVP story ids.
- [ ] `AGENTS.md` links to roadmap from agent section.
- [ ] `npm run stories:html` still passes (if README touched).

## Related stories

- All **102–114**; especially **[102](102-dual-model-manifest-and-harness-foundation.md)**.

## Completion bookkeeping

When implemented: mark **111** done, update [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
