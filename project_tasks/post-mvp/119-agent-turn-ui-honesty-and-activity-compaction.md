# 119 — Agent turn UI honesty and activity compaction

**Status:** Post-MVP backlog.

**Design skill:** Read `.cursor/skills/styleguide-design/SKILL.md` for activity list and toast copy (`@styleguide-design`).

## Why this story exists

**Field report (2026-05-25, ToDoApp):** Harness behavior was correct (merged proposal, one diff card) but the **UI lied by omission**:

- Four **Search & replace** activity rows → one merged proposal + “Combined multiple edits” toast.
- Assistant copy claimed **“four sequential diff reviews”** when only one review surface exists.
- **Context retrieval** showed **“Found relevant workspace context · 0 files”** on greenfield — reads like a failure.
- **“Apply file changes to finish the plan”** toast duplicated the proposal card after approve-and-run.

## Goals

1. **Activity compaction:** Collapse or roll up consecutive same-path `search_replace` activities in the live list (e.g. “Search & replace ×4 on `index.html` → 1 proposal”).
2. **Retrieval copy:** Greenfield / zero-match retrieval uses honest subtitle (e.g. “No indexed files yet”) instead of “Found … 0 files.”
3. **Final-answer hint (main):** When proposals were merged in-turn, append a short harness line so the model does not claim multiple separate diff reviews (**shared final-answer contract**).
4. **Toast dedupe:** Suppress or shorten execute-completion “Apply file changes…” when the agent proposal card is already visible (unless auto-apply failed).

## Scope

- [`src/renderer/src/components/AgentTurnToolActivityList.tsx`](../../src/renderer/src/components/AgentTurnToolActivityList.tsx)
- [`src/main/agent-runner.ts`](../../src/main/agent-runner.ts) — retrieval activity `detail` / title for `retrieval.count === 0`
- [`src/shared/agent-final-answer-contract.ts`](../../src/shared/agent-final-answer-contract.ts) — merged-proposal honesty line
- [`src/renderer/src/components/ChatThread.tsx`](../../src/renderer/src/components/ChatThread.tsx) — execute toast guard

## Acceptance criteria

- [ ] ToDoApp-style 4× S&R turn shows ≤2 activity rows or one rolled-up row with count.
- [ ] Greenfield first turn retrieval detail does not use “Found … 0 files” without context.
- [ ] Eval or unit test: final-answer contract includes merged-edit hint when `mergeAgentEditProposals` ran (or tag in runner eval).
- [ ] Execute done with visible proposal: at most one prominent apply CTA (card or toast, not both).
- [ ] `npm run typecheck` and targeted tests pass.

## Related

- **[093](../093-agent-tool-activity-in-chat-thread.md)**, **[069](../069-plan-approve-auto-agent-turn.md)**, **[116](116-agent-edit-search-replace-escalation-nudge.md)**

## Completion bookkeeping

When shipped: update **Status**, [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
