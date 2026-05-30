# 155 — Compact visible edit failure UI

**Status:** Done (2026-05-30).

**Priority:** Medium — makes repeated proposal failures understandable without flooding the chat.

**Design skill:** `@styleguide-design` for renderer activity and issue-card presentation.

**Depends on:** **[119](119-agent-turn-ui-honesty-and-activity-compaction.md)**, **[125](125-agent-turn-activity-clarity-and-chat-vertical-space.md)**, **[151](151-stop-repeated-same-path-proposal-failures.md)**, **[152](152-failed-edit-final-answer-honesty-contract.md)**.

## Why this story exists

The screenshots show a stack of repeated red "Edit proposal failed" rows. That detail is useful for debugging, but it is noisy for someone who asked for a prototype. The user should see one clear issue summary with the affected path, failure reason, and outcome.

## Goal

Compact repeated edit proposal failures in the chat activity UI into a single visible issue card while preserving enough detail for debugging.

## Acceptance criteria

- [x] Repeated failures for the same path and failure class collapse into one issue row/card with a count.
- [x] The compact card shows the path, short reason, and whether a file was actually created or changed.
- [x] Full raw failure details remain accessible through the existing trace/debug affordance.
- [x] Final-answer honesty state from story **152** is visually aligned with the activity card.
- [x] The UI remains readable in narrow panes and follows GrokForge dark/accent token patterns.

## Suggested implementation notes

- Keep this as presentation compaction, not a replacement for trace data.
- Use existing activity grouping components where possible.
- Avoid new permanent settings until dogfood proves a need.

## Completion bookkeeping

When shipped or closed: update **Status**, [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
