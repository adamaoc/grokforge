# 105 — Agent turn snapshots (stable provider rounds)

**Status:** Done (2026-05-19).

**Design skill:** N/A.

**Depends on:** **[104](104-agent-profiles-and-toolsets.md)** recommended (snapshot includes filtered tool list).

**Blocks:** **[107](107-agent-context-offload-large-tool-results.md)** (compression should not mutate active snapshot).

## Why this story exists

`agent-runner.ts` rebuilds messages, tools, and context on each tool-loop iteration. Mid-turn changes (pins updated, profile drift, tool list mutation) can cause **subtle bugs** and non-reproducible traces — Pi’s harness explicitly **snapshots** session state before each provider call.

Reference: [`docs/i-am-a-harness.md`](../../docs/i-am-a-harness.md) § Turn snapshots (Pi); research doc Pi section.

## Goals

### 1. `AgentTurnSnapshot` type (shared)

`src/shared/agent-turn-snapshot.ts`:

| Field | Frozen at round start |
| --- | --- |
| `snapshotId` | UUID |
| `turnId` / `streamId` | correlation |
| `createdAt` | ISO |
| `modelId` | string |
| `modelIntent` | `ModelIntent` |
| `harnessProfileKey` | from **103** |
| `agentProfileId` | from **104** |
| `chatMode` | `fast` \| `plan` |
| `systemMessages` | serialized system content |
| `messagesForProvider` | user/assistant/tool messages for this round |
| `toolDefinitions` | exact JSON schemas sent to xAI |
| `activeContext` | copy of turn UI context |
| `contextBudgetReport` | optional snapshot from **039** |

### 2. Runner behavior

- Before **each** xAI request in a turn (initial + after tool results), `buildTurnSnapshot()` → immutable object.
- Tool loop mutates **live** state for next round only via `buildTurnSnapshot()` again — never patch previous snapshot.
- On cancel: mark snapshot `cancelled` in trace (**061**).

### 3. Debug / replay hooks

- **061** telemetry: persist snapshot metadata (not necessarily full message bodies) under `userData/.../agent-traces/` capped.
- Dev-only IPC or log line: `lastSnapshotId` on error.

## Non-goals

- Persisting full snapshots for crash recovery (**110**).
- Subagent snapshots (**112**).

## Key files

- `src/shared/agent-turn-snapshot.ts`
- `src/main/agent-runner.ts`
- `src/main/agent-chat-model-transport.ts` — accept snapshot-derived payload only

## Testing

- Unit: two consecutive snapshots in one turn — second includes tool results; first unchanged.
- Unit: changing pin between rounds does not alter snapshot[0].messagesForProvider.

## Acceptance criteria

- [ ] Each provider call in a tool loop uses an explicit `AgentTurnSnapshot`.
- [ ] Snapshot includes model id, harness profile key, agent profile id, and filtered tool list.
- [ ] Trace metadata written in dev or when debug flag set.
- [ ] `npm run typecheck` and `npm run test` pass.

## Related stories

- **[061](../061-agent-debugging-telemetry-and-turn-replay.md)**, **[107](107-agent-context-offload-large-tool-results.md)**.

## Completion bookkeeping

When implemented: mark **105** done, update [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
