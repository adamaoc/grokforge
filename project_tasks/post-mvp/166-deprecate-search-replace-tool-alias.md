# 166 — Deprecate `search_replace` tool alias (consolidate on `edit`)

**Status:** Not started.

**Priority:** Harness hygiene — reduces duplicate tool schemas, token overhead, and model confusion after the Pi-style **`edit`** tool shipped. Safe to schedule after iterative Work stabilization (**130–140**, **144**) and TaskBoard wave (**160–165**).

**Design skill:** N/A (harness / agent tool surface only).

**Depends on:** **[085](085-agent-search-replace-tool.md)** (original S&R tool), **[104](104-agent-profiles-and-toolsets.md)** (toolsets), **[108](108-harness-eval-suite-per-model-regressions.md)** (eval updates). Related policy: **[115](115-agent-edit-cascade-guard-after-search-replace-failures.md)**, **[116](116-agent-edit-search-replace-escalation-nudge.md)**, **[138](138-iterative-work-search-replace-escalation.md)** — metrics and nudges today use the `search_replace` name.

## Why this story exists

GrokForge exposes **two** model-facing edit primitives that share one implementation path:

| Tool | Role today |
|------|------------|
| **`edit`** | Primary Pi-style `{ path, edits: [{ oldText, newText }], expectedContentHash }` |
| **`search_replace`** | Documented legacy alias; also accepts snake_case **`old_string` / `new_string`** single-hunk form |

Both route through [`tool-executor.ts`](../../src/harness/tools/tool-executor.ts) → [`search-replace-tool.ts`](../../src/harness/diff/search-replace-tool.ts) → reviewable proposal. Keeping both:

- Wastes tool-definition tokens in every executor turn.
- Splits model behavior despite prompts saying “prefer `edit`”.
- Leaves harness copy, metrics (`search_replace_escalation`), routing (`EDIT_TOOL_NAMES`), and evals tied to the legacy tool name.

**Non-goal:** Removing patch/fuzzy-match logic — only the **second tool name** and redundant schema entry.

Reference: [`src/harness/tools/TOOLS.md`](../../src/harness/tools/TOOLS.md) (inventory + ampnet comparison).

## Goals

### Phase 1 — Stop advertising `search_replace` to the model

- Remove `search_replace` from [`AGENT_TOOL_DEFINITIONS`](../../src/harness/tools/workspace-tools.ts) and [`AGENT_TOOLSET_EDIT`](../../src/harness/profiles/contracts/toolset.ts) so [`buildToolDefinitionsForTurn`](../../src/harness/tools/workspace-tools.ts) no longer sends it to xAI.
- **Keep** executor handling for `name === 'search_replace'` (compat shim): parse args, run same path as `edit`, optional dev-only log `deprecated_tool:search_replace`.

### Phase 2 — Absorb legacy param shape on `edit`

- Extend **`edit`** JSON schema + [`SearchReplaceToolArgsSchema`](../../src/harness/diff/search-replace-tool.ts) so models can still send optional **`old_string` / `new_string`** (same validation as today’s legacy branch).
- Document in `edit` description: prefer `edits[]`; `old_string`/`new_string` accepted for compatibility only.

### Phase 3 — Rename harness copy and observability (user-facing text → `edit`)

Sweep strings and constants that tell the model or user “use search_replace”:

| Area | Examples |
|------|----------|
| Prompts | [`harness-profile.ts`](../../src/harness/profiles/harness-profile.ts) `AGENT_TOOL_LOOP_CORE`, [`context.ts`](../../src/harness/context/context.ts), [`final-answer-contract.ts`](../../src/harness/policy/final-answer/final-answer-contract.ts) |
| Routing | [`scaffold-strategy.ts`](../../src/harness/routing/scaffold-strategy.ts) `EDIT_TOOL_NAMES`, [`iterative-work-edit.ts`](../../src/harness/routing/iterative-work-edit.ts) |
| Metrics / nudges | `search_replace_escalation`, `HARNESS_NUDGE_*`, cascade guard messages — **rename to `edit_*` or generic `patch_edit_*`** while preserving behavior |
| Runner | [`agent-runner.ts`](../../src/main/agent-runner.ts) tool-round instrumentation |
| Docs | [`TOOLS.md`](../../src/harness/tools/TOOLS.md), [`AGENTS.md`](../../AGENTS.md) if referenced |

Internal module filenames (`search-replace-tool.ts`, etc.) may stay; rename only if a follow-up cleanup is cheap.

### Phase 4 — Remove compat shim and contract member

- Delete `search_replace` branch from [`tool-executor.ts`](../../src/harness/tools/tool-executor.ts) `isAllowedToolName` / edit dispatch.
- Remove `'search_replace'` from [`AgentChatToolName`](../../src/shared/agent-chat-contract.ts) and any UI activity labels that branch on tool name.
- Update eval mocks in [`agent-runner-evaluation.test.ts`](../../src/main/agent-runner-evaluation.test.ts) and shared `*.test.ts` files to call **`edit`** instead of **`search_replace`**.

## Non-goals

- Changing proposal → diff review → apply semantics (**060**, **047**).
- Replacing [`propose_file_edits`](../../src/harness/tools/workspace-tools.ts) for new files / large refactors.
- Renaming **085** story file or rewriting historical post-MVP narrative (085 remains the record of introducing patch edits).

## Acceptance criteria

- [ ] Executor/default/approved-plan turns expose **one** structured edit tool: **`edit`** (plus `propose_file_edits`, read tools, `run_command` as today).
- [ ] Models can still succeed with legacy `old_string`/`new_string` payloads **via `edit`** after Phase 2.
- [ ] Harness nudges, escalation, and iterative Work guards behave as before **138** / **116** (eval tags updated, not removed).
- [ ] `npm run test` passes; harness eval cases that mocked `search_replace` use `edit`.
- [ ] [`TOOLS.md`](../../src/harness/tools/TOOLS.md) lists a single edit primitive; no “legacy alias” row for `search_replace`.

## Suggested implementation order

1. Phase 1 + Phase 2 (one PR — hide tool, extend `edit` schema).
2. Phase 3 (copy/metrics sweep; can split by folder: `policy/` → `profiles/` → `main/agent-runner`).
3. Phase 4 + eval updates (second PR after dogfood or eval green).

## Related stories

- **[085](085-agent-search-replace-tool.md)** — introduced `search_replace`.
- **[114](114-deprecate-fenced-agent-tools-protocol.md)** — precedent for deprecating a duplicate write surface.
- **[115](115-agent-edit-cascade-guard-after-search-replace-failures.md)**–**[140](140-search-replace-failure-loop-observability.md)** — policy built on S&R name; update during Phase 3.
- **[148](148-better-incremental-editing-strategy.md)** — surgical vs full rewrite (unchanged; tool name only).

## Completion bookkeeping

When implemented: mark **166** **Done**, update [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
