# 109 — RPI plan artifacts on disk (structured handoff)

**Status:** Post-MVP backlog.

**Design skill:** N/A (optional renderer “Open plan folder” link).

**Depends on:** **[104](104-agent-profiles-and-toolsets.md)**, **[062](../062-agent-planning-and-multi-step-workflow.md)**.

## Why this story exists

Plans today live as **`gf-plan` JSON inside chat markdown** (**062**). Martin Richards / Cursor patterns use **durable artifacts**: `spec.md`, `plan.json`, living files the human and agent annotate. This reduces **handoff context loss** between plan → execute (**069**) and supports backflow (“implementation found gap → update plan file”).

Reference: [`docs/i-am-a-harness.md`](../../docs/i-am-a-harness.md) § Martin Richards RPI; Reddit handoff loss.

## Goals

### 1. Storage layout (app data, not user repo)

`userData/workspace-projects/<projectId>/plans/<planId>/`:

| File | Content |
| --- | --- |
| `plan.json` | Parsed `GfPlan` schema from **062** + metadata (`createdAt`, `status`, `supersededBy`) |
| `plan.md` | Human-readable render for external tools |
| `threadMessageId` | link to chat anchor |

Do **not** write `.grokproject.json` into user workspace unless user opts in (future).

### 2. Lifecycle

- On valid `gf-plan` parse in assistant message → upsert `plan.json`.
- On approve (**062** / **069**) → set `status: approved`.
- On supersede → mark old plan `superseded`.
- **Approve and run** synthetic message may reference `planId` instead of duplicating full JSON (bounded handoff).

### 3. Execute turn context

- **`agent-runner.ts`** — When `approvedPlanId` present, inject compact pointer: “Approved plan: `plans/<id>/plan.json` — read via tool if needed” plus first N chars summary.
- Optional main-only `read_plan` tool or reuse `read_file` on app-data path with guard.

### 4. Backflow (v1 light)

- User message “revise plan” creates new plan version file; old remains for audit.

## Non-goals

- Full `spec:research` → `spec.md` pipeline (optional stretch).
- Grok Build handoff (story **018** closed).

## Testing

- Unit: parse fence → writes `plan.json` with expected steps.
- Unit: approve updates status.
- Manual: approve and run → execute turn references plan id; agent can open plan file.

## Acceptance criteria

- [ ] Valid plans persisted under app data with stable id.
- [ ] Execute turn handoff uses plan id + summary, not full JSON dump in synthetic user line.
- [ ] `npm run typecheck` and `npm run test` pass.

## Related stories

- **[069](../069-plan-approve-auto-agent-turn.md)**, **[101](101-greenfield-plan-quality.md)**, **[098](098-planning-mode-execute-ux-polish.md)**.

## Completion bookkeeping

When implemented: mark **109** done, update [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
