# 110 — Interrupted tool boundaries and turn receipts

**Status:** Done (2026-05-19).

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` if surfacing interrupted state in chat (`@styleguide-design`).

**Depends on:** **[106](106-agent-tool-execution-context.md)**, **[105](105-agent-turn-snapshots.md)**.

## Why this story exists

If the app crashes or the user force-quits during `run_command` or a long `read_file`, the thread has no **durable boundary** — Pi/T3 harnesses mark tool runs `interrupted` and recover from session log, not mid-flight provider streams.

## Goals

### 1. Turn receipt (shared)

Append to `chat/thread.jsonl` or sidecar `turn-receipts.jsonl`:

```json
{
  "streamId": "...",
  "status": "completed" | "cancelled" | "error" | "interrupted",
  "endedAt": "...",
  "modelId": "...",
  "harnessProfileKey": "...",
  "agentProfileId": "...",
  "toolCallsStarted": 3,
  "toolCallsCompleted": 2
}
```

On startup, scan last receipt — if `interrupted`, inject system message next turn: “Previous turn ended abruptly; re-verify workspace state.”

### 2. Per-tool status

In tool activity (**093**) metadata: `running` → `completed` | `failed` | `interrupted`.

### 3. Crash mid-tool

- Main process `will-quit` / `before-quit`: flush receipt as `interrupted` if turn in flight.
- No attempt to resume xAI stream (explicit non-goal).

## Non-goals

- Auto-retry tools without user action.
- Subagent recovery (**112**).

## Acceptance criteria

- [x] Cancelled and crashed turns persist distinguishable receipt status.
- [x] Next turn after interrupted receipt includes harness recovery hint in context (bounded chars).
- [x] `npm run typecheck` and `npm run test` pass.

## Related stories

- **[061](../061-agent-debugging-telemetry-and-turn-replay.md)**, **[106](106-agent-tool-execution-context.md)**.

## Completion bookkeeping

When implemented: mark **110** done, update [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
