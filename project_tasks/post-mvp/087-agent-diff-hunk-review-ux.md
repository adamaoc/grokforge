# 087 — Agent diff review: hunk-focused UX

**Status:** Done (2026-05-18).

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` (`@styleguide-design`).

## Why this story exists

Full-file Monaco diff for a 3-line change shows a **wall of red/green**, which feels like the agent deleted the project. Users need **hunk-oriented** review (like git) and optionally **per-hunk** accept/reject once **085** provides patch semantics.

## Goals

1. Default diff view emphasizes **changed regions** (collapsed unchanged context, or scroll to first change).
2. Show change summary: files touched, +/- line counts per file.
3. **v1 stretch:** per-hunk accept/reject if proposal model supports multiple ops; otherwise per-file only.
4. Works for agent proposals and git diff sessions (**048**) where feasible.

## Scope

### Renderer

- [`GroupedDiffView.tsx`](../../src/renderer/src/components/GroupedDiffView.tsx), [`DiffEditorPane.tsx`](../../src/renderer/src/components/DiffEditorPane.tsx).
- Monaco options: `hideUnchangedRegions`, diff algorithm tweaks, or custom hunk list UI above Monaco.

### Dependencies

- Easier after **085** (`search_replace`); full-file proposals can still use Monaco’s unchanged-region hiding.

## Acceptance criteria

- [x] Opening a small edit no longer feels like “entire file replaced” by default (unchanged regions collapsed or de-emphasized).
- [x] Per-file +/- stats visible in diff header.
- [x] `npm run typecheck` passes; manual review on TSX file with localized change.

## Implementation notes

- Monaco `hideUnchangedRegions` + `revealFirstDiff` on mount in `DiffEditorPane`.
- Line +/- stats via `src/shared/diff-line-stats.ts`; session summary bar in `GroupedDiffView`; editor header uses same totals in `EditorPane`.
- Per-hunk accept/reject deferred (v1 stretch); apply remains per-file / apply-all.

## Related stories

- **[014](../014-monaco-diff-and-multi-root-grouping.md)**, **[046](../046-agent-proposed-edits-diff-review.md)**.
- **[085](085-agent-search-replace-tool.md)**.

## Completion bookkeeping

Marked **087** done; [`README.md`](../README.md) post-MVP table updated; **`npm run stories:html`** run.
