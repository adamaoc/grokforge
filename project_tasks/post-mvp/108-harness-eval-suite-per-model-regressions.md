# 108 — Harness eval suite: per-model and per-profile regressions

**Status:** Done (2026-05-19).

**Design skill:** N/A.

**Depends on:** **[103](103-agent-harness-per-model-profiles.md)** (minimum); **[104](104-agent-profiles-and-toolsets.md)** for profile-matrix cases.

## Why this story exists

**063** added deterministic agent-loop evaluation fixtures. Harness changes (prompts, tool filters, profiles) need **regression gates** before merge — Cursor’s “living harness” depends on measurement.

We must catch: “4.3 profile accidentally got fast profile prompt”, “planner still received edit tools”, “plan mode missing `gf-plan`”.

## Goals

### 1. Fixture matrix

Extend `src/main/agent-runner-evaluation.test.ts` (and shared fixtures) with cases tagged:

| Tag | Example assertion |
| --- | --- |
| `profile:grok_code_fast` | System prompt contains fast-specific marker string |
| `profile:grok_4_3` | Plan-quality instruction present |
| `agent:planner` | Tool defs exclude `propose_file_edits` |
| `agent:executor` | Includes edit tools |
| `contract:plan` | Final contract requires `gf-plan` |
| `behavior:proactive` | User says “admin page” → expect search tool in plan (mock transport) |

### 2. Mock transport enhancements

- Record `tools[]` names sent per request.
- Record `model` id per request.
- Allow tests to run same user message under two profile keys and assert diff.

### 3. CI policy

- Document in `AGENTS.md`: changing `agent-harness-profile.ts` or `agent-profile.ts` requires updating fixtures.
- Optional: `npm run test:agent-eval` script alias if suite grows.

### 4. Manual benchmark sheet (docs)

Add `docs/harness-eval-checklist.md` with 10 manual smoke flows (dual-model):

1. Fast chat: small edit with read-before-write.
2. Plan empty workspace → `gf-plan` without user fence hint.
3. Approve and run → execution model + executor profile.
4. … (complete in implementation PR)

## Non-goals

- Live API integration tests (stay mocked).
- Online A/B (**063** non-goals).

## Acceptance criteria

- [ ] At least **6** new unit tests covering profile + agent profile dimensions.
- [ ] CI runs them via `npm run test`.
- [ ] `docs/harness-eval-checklist.md` exists with dual-model scenarios.
- [ ] `npm run typecheck` passes.

## Related stories

- **[063](../063-agent-evaluation-suite-and-smartness-regressions.md)**, **[103](103-agent-harness-per-model-profiles.md)**, **[104](104-agent-profiles-and-toolsets.md)**.

## Completion bookkeeping

When implemented: mark **108** done, update [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
