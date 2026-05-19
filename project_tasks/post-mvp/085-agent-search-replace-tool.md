# 085 — Agent edits: `search_replace` tool

**Status:** Done (2026-05-18).

**Design skill:** N/A unless new review UI for patch ops; coordinate with **087**.

## Why this story exists

Full-file `write_file` makes every edit look like “delete entire file, paste new file” and encourages model mistakes. A **`search_replace`** (exact snippet) tool is the standard first step toward patch-based agents (Cursor, Claude Code, etc.).

## Goals

1. New tool: `search_replace` with `{ path, old_string, new_string }` (names TBD).
2. Resolve path under roots + ignore + sensitive rules (same as **060**).
3. Apply by reading disk, verifying `old_string` occurs **exactly once** (or define policy: zero → error, multiple → error with count).
4. Emit **proposal** or apply path consistent with **060** (prefer: build synthetic `write_file` for diff review, or store patch ops in proposal payload—decide in implementation).
5. Prompts: **prefer** `search_replace` for localized edits; reserve full `write_file` for new files or intentional full rewrites.

## Scope

### Main

- [`agent-workspace-tools.ts`](../../src/main/agent-workspace-tools.ts) — tool definition + execution.
- [`agent-edit-proposals.ts`](../../src/main/agent-edit-proposals.ts) — accept patch ops or expand to full content for diff.
- [`agent-tools.ts`](../../src/main/agent-tools.ts) — batch apply if patches fold into existing batch.

### Shared contract

- Extend [`agent-tool-schema.ts`](../../src/shared/agent-tool-schema.ts) / contract with Zod discriminated union op.

### Tests

- Exact match, not found, ambiguous multiple matches, ignore path rejection.

## Non-goals (v1 of this story)

- Fuzzy match / ellipsis placeholders.
- Unified diff apply library (defer to a follow-up if needed).

## Acceptance criteria

- [ ] Model can call `search_replace` in the agent tool loop.
- [ ] User sees a diff review before disk write (same as proposals today).
- [ ] Full `write_file` still works for new files and opt-in full rewrites.
- [ ] Vitest coverage for match semantics and path guards.
- [ ] `npm run typecheck` passes.

## Related stories

- **[060](../060-agent-first-class-edit-proposals.md)** — proposal pipeline.
- **[082](082-agent-edit-require-read-before-write.md)** — read before edit.
- **[087](087-agent-diff-hunk-review-ux.md)** — better diff presentation.

## Completion bookkeeping

When implemented: mark **085** done, update [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
