# 100 — Proposal quality: auto-normalize and apply guard

**Status:** Done (2026-05-18).

**Design skill:** N/A (shared normalize + proposal card / apply UX).

## Why this story exists

Execution proposals often arrived with crushed one-line HTML/CSS/JS. Safety warnings appeared but users could still apply unreadable diffs.

## Goals

1. Reflow crushed `<style>` / `<script>` interiors in HTML without shredding multi-line files.
2. Second normalize pass in `validateAgentEditProposal` when layout still needs repair.
3. Confirm before Apply when severity is **severe** (collapsed / messy layout).

## Scope

- [`src/shared/agent-file-content-normalize.ts`](../../src/shared/agent-file-content-normalize.ts) — `reflowHtmlEmbeddedBlocks`
- [`src/main/agent-edit-proposals.ts`](../../src/main/agent-edit-proposals.ts) — double normalize when needed
- [`src/renderer/src/components/ChatThread.tsx`](../../src/renderer/src/components/ChatThread.tsx) — `confirmApplyDespiteSevereSafety`

## Acceptance criteria

- [x] HTML todo scaffold normalizes to lines under ~200 chars in tests.
- [x] Apply all / diff Apply asks for confirmation on severe layout issues.
- [x] `npm run typecheck` and `npm run test` pass.

## Related stories

- **[084](084-agent-edit-pre-apply-safety-warnings.md)**, **[083](083-agent-edit-prompting-minimal-change.md)**

## Completion bookkeeping

When shipped: update this **Status**, [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
