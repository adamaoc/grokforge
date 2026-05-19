# 101 — Greenfield plan quality (per-profile prompts)

**Status:** Post-MVP backlog.

**Design skill:** N/A (harness prompts in shared/main).

**Depends on:** **[103](103-agent-harness-per-model-profiles.md)** — empty-workspace rules live in **`grok_4_3`** planner profile, not a one-off string in `agent-context.ts`.

**Does not step on:** **[098](098-planning-mode-execute-ux-polish.md)** (UI stepper) — prompts only.

## Why this story exists

Plan mode emits `gf-plan` (**062**, **099**), but **empty workspace** requests produce vague steps unless the user coaches the model. That is a **harness instruction** gap for the **planning model + planner profile**, not a missing SKU.

With **dual-model harnesses**, greenfield quality is primarily **`grok-4.3` + `planner` profile** responsibility.

## Goals

### 1. Empty-workspace detection

- In `agent-runner` or `agent-context`, detect “no index entries / zero roots files / new project” heuristic (define explicitly in PR).
- Inject **greenfield appendix** into planner profile system prompt when true.

### 2. Appendix content (planner / 4.3 profile)

Require plans to address:

1. **Project shape** — multi-file layout vs single HTML file; when to choose each.
2. **File list** — concrete paths under workspace roots.
3. **Verification** — `run_command` steps user can approve (typecheck, test, open file).
4. **Formatting** — no crushed one-line HTML/CSS (**100** alignment).
5. **Dependencies** — package.json, install step if greenfield app.

### 3. Execute-from-plan handoff (fast / executor profile)

- **`grok_code_fast` executor profile** appendix for **069** auto-run: respect approved plan step order; read files before edit (**082**); prefer `search_replace` (**085**).

### 4. Optional `gf-plan` schema v2

Only if prompts insufficient:

```json
"codeQuality": { "lint": "...", "structure": "..." }
```

Update `src/shared/gf-plan-contract.ts` + `PlanModeCard` display (**098** consumes).

## Non-goals

- Plan phase stepper UI (**098**).
- Runner intent resolution (**097**).
- Plan persistence on disk (**109**).

## Testing

- Extend **108** / **063**: empty manifest fixture → plan prompt contains greenfield marker.
- Manual: new project → “build a todo app” in Plan mode → plan lists multiple files + verify step without user mentioning `gf-plan`.

## Acceptance criteria

- [ ] Empty-workspace plans include file paths and verification steps in smoke test.
- [ ] Rules live in harness profile source (**103**), not duplicated ad hoc.
- [ ] Execute turn prompt references plan discipline (profile-level).
- [ ] `npm run typecheck` and `npm run test` pass.

## Related stories

- **[099](099-plan-mode-final-contract-and-toast.md)**, **[100](100-proposal-quality-auto-normalize.md)**, **[103](103-agent-harness-per-model-profiles.md)**, **[108](108-harness-eval-suite-per-model-regressions.md)**.

## Completion bookkeeping

When shipped: mark **Done**, update [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
