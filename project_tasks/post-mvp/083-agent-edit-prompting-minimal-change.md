# 083 — Agent edits: minimal-change prompting

**Status:** Done (2026-05-18).

**Design skill:** N/A (prompts and tool descriptions in main/shared).

## Why this story exists

Even with read-before-write (**082**), models still **rewrite entire files** because prompts and tool copy emphasize “complete replacement content.” Better instructions reduce destructive diffs and align behavior with user intent (surgical edits).

## Goals

Update agent-facing text (system prompt, `propose_file_edits` / fence contract, `finalAnswerContract`) to require:

1. Read the current file first (`read_file`).
2. Make the **smallest change** that satisfies the request.
3. Do **not** rewrite the whole file unless the change is truly global (rename structure, new file, deliberate full rewrite).
4. Preserve imports, types, formatting, and structure not intentionally changed.
5. For long files, use chunked `read_file` (`startLine` / `maxLines`) rather than inventing missing sections.
6. Use **exact paths** from workspace roots or tool results—no guessed shortened paths.

## Scope

- [`src/main/agent-context.ts`](../src/main/agent-context.ts) — “Agent file writes” section.
- [`src/main/agent-runner.ts`](../src/main/agent-runner.ts) — tool loop + final response contract.
- [`src/main/agent-workspace-tools.ts`](../src/main/agent-workspace-tools.ts) — `propose_file_edits` / `read_file` descriptions.

## Testing

- Extend **`agent-context.test.ts`** or **063** evaluation fixtures with cases that expect minimal-edit language in built prompt (snapshot or substring).
- Manual: common “add a widget to admin page” request should more often produce smaller diffs after **082** + this story.

## Acceptance criteria

- [ ] Prompt and tool descriptions include the minimal-change rules above.
- [ ] No regression to path/ignore/safety rules from **060**.
- [ ] `npm run typecheck` passes.

## Known limitation (field report, 2026-05-18)

Prompt-only minimal-change guidance **does not reliably prevent destructive proposals**. Example after **083** shipped:

- **Project:** 15MinDallas · **File:** `15-min-dallas-www/src/app/(admin)/admin/page.tsx`
- **User ask:** “add a few more widgets to the admin area” (incremental UI change).
- **Agent summary:** claimed three new dashboard widgets (Drafts, Subscribers, Media Items).
- **Actual diff:** removed ~lines 32–64 (sidebar nav, `<main>`, existing widget grid) and proposed **one** new line (`import Link from 'next/link';`) — would break the page.

**Follow-up:** detection and UX warnings → **[084](084-agent-edit-pre-apply-safety-warnings.md)**. Structural edits → **[085](085-agent-search-replace-tool.md)**.

## Related stories

- **[082](082-agent-edit-require-read-before-write.md)** — enforcement.
- **[084](084-agent-edit-pre-apply-safety-warnings.md)** — catch catastrophic shrink before Apply.
- **[085](085-agent-search-replace-tool.md)** — structural alternative to full rewrite.

## Completion bookkeeping

When implemented: mark **083** done, update [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
