# 150 — Reviewer sub-agents for edit proposals

**Status:** Done (2026-05-30).

**Priority:** High — adds a critique layer for proposals before users decide whether to review or apply them.

**Design skill:** `@styleguide-design` for renderer proposal-card feedback.

**Depends on:** **[112](112-agent-subagents-child-sessions.md)**, **[146](146-pre-validation-for-edit-proposals.md)**, **[147](147-stronger-anti-crush-and-formatting-enforcement.md)**.

## Why this story exists

GrokForge already rejects clearly broken proposal payloads, but accepted proposals can still contain subtle formatting problems, obvious bugs, overly broad rewrites, or deviations from an approved plan. This story adds a dedicated reviewer role that critiques `propose_file_edits` output before the user acts on it, starting inline and non-blocking so we can test the behavior safely before moving to true spawned sub-agents.

## Phase 0 model research

As of 2026-05-30, xAI’s public model docs list `grok-4.3`, `grok-4.20-0309-reasoning`, `grok-4.20-0309-non-reasoning`, `grok-4.20-multi-agent-0309`, and `grok-build-0.1` for text/coding-style API use. The docs position `grok-4.3` as the flagship general/coding model with 1M context, structured outputs, reasoning, and strong instruction following. xAI’s Grok Build announcement positions `grok-build-0.1` as the fastest coding model, trained for agentic coding, web development, debugging, MCP/tool workflows, and served at 100+ tokens/sec with lower pricing than `grok-4.3`.

Retired fast/code slugs now redirect: `grok-code-fast-1` is recommended to migrate to `grok-build-0.1`; older Grok 4 fast reasoning/non-reasoning slugs redirect to `grok-4.3` with configured reasoning effort. For a reviewer role, the initial recommendation is **`grok-build-0.1`**: review prompts are short, proposal content is code-heavy, and the role should be low-latency and inexpensive. If dogfood shows the reviewer misses plan deviation or subtle architectural bugs, promote the reviewer model to `grok-4.3` with a strict critique prompt for higher-signal reviews.

## Implementation checklist

- [x] Phase 0 research complete + model recommendation documented
- [x] Dedicated reviewer profile + prompt created
- [x] Reviewer can be invoked manually (for testing)
- [x] Automatic post-proposal review runs for `propose_file_edits` (inline)
- [x] Review feedback is visible in the UI (attached to proposal or as a message)
- [x] Basic configuration added (enable/disable + model selection)
- [x] Tested on both small and large edit proposals
- [x] No major regressions in existing plan/work flows
- [x] Documentation updated (even if minimal)

## V1 scope

- Inline same-turn review only; no persistent child reviewer session yet.
- Focus on `propose_file_edits`, not `edit` / `search_replace`.
- Feedback-only: reviewer findings are attached to the proposal and shown in the proposal card, but they do not block Apply.
- Automatic review is opt-in through manifest `reviewer.autoReviewEdits` and thresholded by `reviewer.minChangedLines`; manual review is available from the proposal card.

## Follow-ups

- Promote reviewer execution to a real bounded sub-agent session with its own transcript.
- Add Settings UI for reviewer config once dogfood validates the defaults.
- Feed reviewer feedback back into an auto-repair loop when the verdict is `fail`.

## Verification notes

- Focused reviewer/tool-executor tests pass.
- Typecheck passes.
- Full unit suite passes, including harness eval coverage for static verify nudges and creation incremental recovery.
