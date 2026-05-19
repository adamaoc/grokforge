# 084 — Agent edits: pre-apply safety warnings in diff review

**Status:** Done (2026-05-18).

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` before changing diff review cards, proposal strip, or apply actions (`@styleguide-design`).

## Why this story exists

Users apply proposals that **shrink files**, collapse to **one line** (bad JSON escaping), or **drop closing braces/tags**. Cheap heuristics before Apply prevent “oops I broke everything” without blocking legitimate large refactors.

**083** added minimal-change **prompting** only; it did not stop bad proposals in production (see field report below). **084** is the first **code-level** guardrail so the diff review UI surfaces “this will probably break the file” before Apply.

### Field report — 15MinDallas admin page (2026-05-18)

Observed in GrokForge after **082** + **083** (screenshot: user session, project **15MinDallas**):

| | |
|--|--|
| **Request** | “let's add a few more widgets to the admin area … just add them in for testing” |
| **Path** | `15-min-dallas-www/src/app/(admin)/admin/page.tsx` |
| **Agent chat claim** | “Ready for review: added three new dashboard widgets (Drafts, Subscribers, Media Items) with fake stats.” |
| **Diff reality** | **Removed** ~lines 32–64: `<aside>` sidebar (e.g. link to `/admin/media`), `<main>`, `<h1>`, and existing `grid` stat widgets (“Published”, “Total C”, “Page Vi…”). **Added** a single line: `import Link from 'next/link';` (no new widgets, no preserved JSX structure). |
| **User impact** | Applying would delete the admin layout and leave a non-functional page; summary text **contradicts** the diff. |

**Heuristics this case must trigger:**

1. **Dramatic shrink** — dozens of lines removed, net −80%+ line count.
2. **Single-line / near-empty proposal** — proposed file effectively one import vs multi-section TSX.
3. **Intent mismatch (soft)** — optional copy when user message matches “add” / “widget” but diff is mostly deletions (warning only, not a hard block).

Use this scenario as a **Vitest fixture** (synthetic original + bad proposed content) and a **manual QA checklist** item.

## Goals

When a pending proposal or diff session is shown, compute and surface warnings (non-blocking by default, strong visual for severe cases):

| Heuristic | Example signal |
|-----------|----------------|
| Dramatic shrink | New line count ≪ original (e.g. &lt; 50% lines or chars) |
| Single-line blob | Very few `\n` in proposed content vs original |
| Brace/tag balance | Rough count of `{` `}` `(` `)` or JSX closers dropped |
| Stats line | “312 lines → 48 lines (−85%)” or “+120 lines” |

Reuse [`normalizeAgentWriteFileContent`](../../src/shared/agent-file-content-normalize.ts) where relevant; offer **“Normalize line breaks”** when literal `\n` pattern detected (if not already applied).

## Scope

### Shared

- Pure functions in `src/shared/` for heuristics + unit tests (no `fs` in renderer).

### Renderer

- [`ChatThread.tsx`](../../src/renderer/src/components/ChatThread.tsx) — pending proposal card.
- [`EditorPane.tsx`](../../src/renderer/src/components/EditorPane.tsx) / [`GroupedDiffView.tsx`](../../src/renderer/src/components/GroupedDiffView.tsx) — agent diff session header.

### Optional main

- IPC is not required if review already has original + modified strings in renderer state.

## UX

- Warnings use zinc/amber tokens; severe cases use alert pattern from styleguide.
- Apply remains enabled unless product chooses “confirm dialog” for extreme shrink (document decision in story PR).

## Acceptance criteria

- [ ] At least three heuristics implemented (shrink, newline density, simple balance or stats).
- [ ] Warnings visible in proposal review before Apply (chat pending strip **and** editor diff session header).
- [ ] Vitest coverage for heuristic helpers, including a **15MinDallas-style** fixture: large TSX original → single-import proposal flags severe shrink.
- [ ] `npm run typecheck` passes.

## Related stories

- **[046](../046-agent-proposed-edits-diff-review.md)**, **[047](../047-diff-apply-discard-and-conflict-safety.md)**.
- **[082](082-agent-edit-require-read-before-write.md)** — reduces bad input; this catches what slips through.

## Completion bookkeeping

When implemented: mark **084** done, update [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
