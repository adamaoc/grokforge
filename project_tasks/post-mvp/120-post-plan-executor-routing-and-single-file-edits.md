# 120 — Post-plan executor routing and single-file edit bias

**Status:** Post-MVP backlog.

**Design skill:** N/A (harness prompts + tool bias); minor composer hint if needed.

## Why this story exists

**Field report (2026-05-25):** After an approved greenfield plan and a working `index.html`, follow-ups (“add remove button”, “dark mode styling”) still triggered **full Plan · tools** cycles and **many `search_replace`** tool calls on a **single file** instead of a tight **executor** pass with one **`propose_file_edits`** (or one composed proposal).

Depends on **[118](118-work-vs-plan-mode-and-conversation-lifecycle.md)** for composer defaulting to **Work** after the first plan; this story covers **harness** behavior when the user is already in Work mode or sends incremental requests.

## Goals

1. **Post-artifact routing:** If the project has an **approved** or **superseded** plan artifact (**109**) and the user message is a small incremental change (heuristic: short text, mentions existing file, no “re-plan” / “from scratch”), bias **executor** profile + **`models.execution`** (or `chat_default`) — not planner + new `gf-plan`.
2. **Single-file workspace:** When index stats show **one primary file** (or only `index.html` under root), nudge **`propose_file_edits`** with full `rawContent` after one `read_file` — discourage 3+ `search_replace` on the same path in one turn (align with **116**).
3. **Optional:** Surface a one-line composer hint in Work mode: *“Incremental edits — no new plan unless you switch to Plan.”*

## Non-goals

- Disabling Plan mode or `gf-plan` for explicit “plan again” requests.
- Changing merge logic (**shared agent-edit-proposal-merge**).

## Scope

- [`src/shared/agent-harness-profile.ts`](../../src/shared/agent-harness-profile.ts) — executor appendix for post-plan / single-file
- [`src/shared/agent-turn-routing.ts`](../../src/shared/agent-turn-routing.ts) or [`src/main/agent-runner.ts`](../../src/main/agent-runner.ts) — optional intent heuristic (keep **097** canonical)
- [`src/shared/agent-final-answer-contract.ts`](../../src/shared/agent-final-answer-contract.ts) — edit-intent nudge variants
- [`src/main/agent-runner-evaluation.test.ts`](../../src/main/agent-runner-evaluation.test.ts) — regression tag

## Acceptance criteria

- [ ] Eval: approved plan exists + “add delete button” user line → executor tools, no `gf-plan` requirement on final answer.
- [ ] Eval or manual: single-file todo HTML follow-up prefers `propose_file_edits` over 4× S&R when model complies.
- [ ] Explicit “create a new plan” / Plan mode still produces `gf-plan`.
- [ ] `npm run test:agent-eval` passes for touched profiles.

## Related

- **[118](118-work-vs-plan-mode-and-conversation-lifecycle.md)**, **[101](101-greenfield-plan-quality.md)**, **[116](116-agent-edit-search-replace-escalation-nudge.md)**, **[104](104-agent-profiles-and-toolsets.md)**

## Completion bookkeeping

When shipped: update **Status**, [`README.md`](../README.md) post-MVP table, [`docs/harness-roadmap.md`](../../docs/harness-roadmap.md) debt table if needed, run **`npm run stories:html`**.
