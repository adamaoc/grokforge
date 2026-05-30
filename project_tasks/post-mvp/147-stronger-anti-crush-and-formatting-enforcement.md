# 147 — Stronger anti-crush and formatting enforcement (prompt + validation hardening)

**Status:** **Done**.

**Priority:** High — directly targets the root generative cause of mangled first proposals (TaskBoard App.tsx and similar recent crushed full-file outputs).

**Design skill:** N/A (harness prompts, contracts, and validation rules); `@styleguide-design` only for any new rejection messaging copy.

**Depends on:** **[124](124-greenfield-executor-code-quality-and-proposal-recovery.md)**, **[100](100-proposal-quality-auto-normalize.md)**, **[139](139-iterative-work-search-replace-quality-guidance.md)**, **[002](002-shadcn-ui-baseline.md)** (Code Quality Contract foundation from earlier work).

## Why this story exists

Despite the existing `CODE_QUALITY_CONTRACT`, `JAVASCRIPT_CODE_QUALITY_RULES`, `isUnacceptableCrushedMarkdownProposal`, `needsSourceLayoutRepair`, and repeated prompt injections ("one statement per line", "real line breaks", "no glued tokens"), the model still frequently emits crushed, minified, or poorly formatted code on the **first** `propose_file_edits` or large write attempt — especially on medium-to-large files during greenfield execute or post-plan Work.

Recent concrete example (TaskBoard `src/App.tsx`): the initial proposal was a single-line blob of glued JSX/TS + broken event handlers + formatting collapse. It reached the user because the generative interface ("here is the entire new file content") gives the model too much freedom to collapse under token or time pressure. Existing post-hoc repairs and rejections help on retry but do not prevent the bad first output.

The problem is a combination of:
- Insufficiently aggressive / specific language in the contracts and harness profiles for "medium-to-large files".
- Validation that is good at *detecting* but not yet strong enough at *preventing* via prompt pressure + strict pre-accept rules.
- Lack of a "formatting tax" or hard requirement that makes minified output expensive for the model to produce.

## Goals

1. Make crushed / glued / minified output **much more expensive** for the model by strengthening the rules in the Code Quality Contract and all injection points (executor profiles, iterative Work sections, final-answer contracts, greenfield bootstrap).
2. Tighten detection heuristics (`agent-proposal-quality.ts`, `agent-edit-corrupt-content.ts`) with more specific patterns for common failure modes on JS/TS/TSX and larger files.
3. Add a narrow post-generation strict formatting gate (or normalization + re-validate) so that a proposal is only accepted if it meets a higher bar after any auto-repair passes.
4. Provide clearer "penalties" language ("GrokForge will reject and charge an extra round for any proposal that still contains glued statements after normalization").

## Narrow acceptance criteria

- [x] `CODE_QUALITY_CONTRACT` and `SHORT` version updated with stronger, file-size-aware rules (e.g. "On files > ~80 lines: zero tolerance for any glued statements or >2 consecutive lines without proper breaks; first violation triggers hard rejection + explicit re-read instruction").
- [x] All major injection sites (`agent-harness-profile.ts` AGENT_TOOL_LOOP_CORE + GREENFIELD_*/EXECUTOR sections, `agent-final-answer-contract.ts`, `gf-plan-contract.ts`, `incremental-work-edit-policy.ts`) contain the strengthened language.
- [x] Detection in `agent-proposal-quality.ts` / `agent-edit-corrupt-content.ts` catches at least two additional common crush patterns (documented in the PR) with actionable rejection messages.
- [x] A proposal containing crushed content on a medium+ file is rejected (or normalized + re-validated and rejected if still bad) **before** it becomes a user-visible diff.
- [x] No behavior change for already-clean proposals.
- [x] Unit tests updated / added for the new detection cases; `npm run typecheck` + `npm run test` pass.

## Files / areas that should be touched (tight scope)

- `src/shared/agent-code-quality-contract.ts` — primary contract text (the single source of truth).
- `src/shared/agent-harness-profile.ts` — all places that inject the contract or have their own edit-quality paragraphs.
- `src/shared/agent-final-answer-contract.ts` — final-answer and recovery sections.
- `src/shared/gf-plan-contract.ts` — plan quality lines.
- `src/shared/incremental-work-edit-policy.ts` + `src/shared/iterative-work-edit.ts` — Work/iterative guidance.
- `src/shared/agent-proposal-quality.ts` and/or `src/shared/agent-edit-corrupt-content.ts` — detection rule strengthening (narrow additions only).
- `src/shared/agent-file-content-normalize.ts` — if a stricter post-normalize gate is added.
- Relevant tests: `src/shared/agent-proposal-quality.test.ts`, `src/shared/agent-harness-profile.test.ts`, `src/main/agent-edit-proposals.test.ts`.

## What is explicitly out of scope

- Any change to the `edit` tool (multi-edit) path or `search_replace` — this story is about `propose_file_edits` / full write_file quality.
- Introducing a real formatter (Prettier) or running external tools at proposal time.
- Large architectural changes (e.g. moving all writes through a new "formatted edit" primitive).
- UI copy or rejection toast improvements beyond the minimal model-facing messages.
- Work on incremental vs full-rewrite routing (**148** is a separate story).
- New eval tags or broad harness eval additions (minimal test updates only to cover the rule changes).

## Related

- **[124](124-greenfield-executor-code-quality-and-proposal-recovery.md)** and **[139](139-iterative-work-search-replace-quality-guidance.md)** — direct predecessors on quality and first-attempt success.
- **[100](100-proposal-quality-auto-normalize.md)** — the normalize layer this strengthens.
- **[060](060-agent-first-class-edit-proposals.md)**, **[115](115-agent-edit-cascade-guard-after-search-replace-failures.md)** — proposal and guard context.

## Completion bookkeeping

When shipped or closed: update **Status**, [`README.md`](../README.md) post-MVP table (add 147), run **`npm run stories:html`**. Add a short note to the Code Quality Contract header if the contract itself changed.