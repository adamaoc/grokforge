# 106 — Unified agent tool execution context

**Status:** Done (2026-05-19).

**Design skill:** N/A.

**Depends on:** **[105](105-agent-turn-snapshots.md)** (snapshot id passed into context).

**Blocks:** **[110](110-agent-interrupted-tool-boundaries.md)**.

## Why this story exists

Tool handlers today receive disparate arguments (`manifest`, `roots`, `signal`, etc.). OpenCode/Hermes pass a rich **`ToolContext`**: session id, abort, toolCallId, agent name, permission callback, progress metadata.

A unified context improves **cancel**, **UI progress**, and future **permissions-as-data** without rewriting every tool again.

## Goals

### 1. `AgentToolExecutionContext` (shared)

`src/shared/agent-tool-execution-context.ts`:

| Field | Use |
| --- | --- |
| `projectId` | app project uuid |
| `turnId` / `streamId` | cancel correlation |
| `snapshotId` | **105** |
| `toolCallId` | xAI tool call id |
| `agentProfileId` | **104** |
| `harnessProfileKey` | **103** |
| `abortSignal` | `AbortController` from runner |
| `manifest` | `GrokProjectManifest` |
| `roots` | resolved roots |
| `emitProgress` | callback → `AgentChatEvent` activity row (**093**) |
| `recordPathRead` | turn read registry (**082**) |
| `askCommandApproval` | bridge to **059** |

### 2. Refactor tool entrypoints

- **`agent-workspace-tools.ts`** — `executeWorkspaceTool(ctx, name, args)`.
- **`run-command.ts`** / agent wrapper — use same ctx for policy + approval.
- **`agent-edit-proposals.ts`** — proposal creation reads ctx for profile + hash registry.

Keep public IPC unchanged; internal only.

### 3. Progress metadata

- Long `read_file` / `search_workspace` may call `emitProgress({ phase, detail })` without spamming (throttle 500ms).

## Non-goals

- New user-facing UI beyond existing activity list.
- Plugin/tool loading from disk (OpenCode-style).

## Testing

- Unit: mock ctx; verify abort propagates to `read_file` cancellation.
- Unit: `recordPathRead` invoked once per successful read path.

## Acceptance criteria

- [ ] All v1 agent tools invoked through a single context type.
- [ ] Cancel mid-tool aborts in-flight workspace read/search.
- [ ] `npm run typecheck` and `npm run test` pass.

## Related stories

- **[093](093-agent-tool-activity-in-chat-thread.md)**, **[059](../059-agent-command-tool-approvals.md)**, **[105](105-agent-turn-snapshots.md)**.

## Completion bookkeeping

When implemented: mark **106** done, update [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
