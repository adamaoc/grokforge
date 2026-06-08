# 069 — Plan approve triggers agent execution (062 follow-up)

**Status:** Done (v1: **Approve and run** starts one fast `chatMode` turn on **`models.execution`** with a short synthetic user line; no settings toggle.)

**Depends on:** [062 — Agent planning and multi-step workflow](062-agent-planning-and-multi-step-workflow.md) (v1 with **Option A**: approve updates UI + persistence only; user sends the next message to execute).

**Design skill:** `.cursor/skills/styleguide-design/SKILL.md` for any new thread UI or confirmation flows.

## Why this story exists

062 v1 deliberately avoids automatically starting an agent turn when the user approves a plan (clearer boundaries, less surprise, simpler cancellation). Many products auto-run execution after plan approval (**Option B**). This story adds that path once plan cards, persistence, and approvals are stable.

## Goals

- After **Approve and run**, start **one** agent turn: the thread already contains the structured `gf-plan`; a **short synthetic user message** is appended (visible + persisted) so the model executes in **fast** `chatMode` with **`models.execution`** routing (not default chat).
- Clear UX: loading state, stream id, cancel, and explicit copy that **command** and **edit** approvals still apply per tool policy.
- Do not bypass `run_command` approval, `propose_file_edits` review, or agent-writes mode settings.

## Out of scope (v1 of this story)

- Multi-turn autonomous execution loops without user checkpoints.
- Replacing manual checklist toggles from 062 (they may still be used for visibility).

## Acceptance criteria

- [x] **Approve and run** is the only path (no approve-only toggle).
- [x] Auto-started turn references the in-thread plan via a **bounded** synthetic user line (`src/renderer/src/lib/approved-plan-auto-run.ts`); full plan JSON is not duplicated in that line.
- [x] Command/edit safety unchanged from pre-approve behavior (`run_command` / `propose_file_edits` / agent-writes mode).
- [x] Cancel during auto-started turn behaves like any other agent cancel.

## Completion bookkeeping

When this story ships: update its **Status** line, the progress table in [`README.md`](README.md), and run **`npm run stories:html`** at the repo root so [`stories.html`](stories.html) stays in sync.
