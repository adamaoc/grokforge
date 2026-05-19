# 107 — Context offload for large tool results

**Status:** Done (2026-05-19).

**Design skill:** N/A (optional renderer “context compressed” chip later).

**Depends on:** **[105](105-agent-turn-snapshots.md)**, **[039](../039-context-budget-and-retrieval-governance.md)**.

## Why this story exists

Long agent turns suffer **context rot**: huge `read_file` or `search_workspace` payloads fill the window; quality drops even with **039** budgets. LangChain Deep Agents offload to filesystem and replace with **pointer + preview**.

GrokForge already has root-scoped `read_file`; the gap is **automatic** offload + stable paths in the message history.

Reference: [`docs/i-am-a-harness.md`](../../docs/i-am-a-harness.md) § Context Management for Deep Agents.

## Goals

### 1. Offload policy (shared)

`src/shared/agent-context-offload.ts`:

| Rule | Value (tunable) |
| --- | --- |
| Trigger | Tool result UTF-8 size > **N** chars (e.g. 12_000) OR > **M** tokens estimate |
| Storage | `userData/workspace-projects/<projectId>/agent-offload/<turnId>/<toolCallId>.txt` |
| Pointer message | Short tool result: path, line count, sha256, preview first **K** lines |
| Retrieval | Agent must `read_file` the offload path (under app data alias or explicit `offload://` virtual path — **prefer real path in tool result with clear label**) |

**Security:** Offload dir is **not** under user workspace roots; only main process reads/writes. Do not expose arbitrary path write to model.

### 2. Runner integration

- After tool execution in **`agent-runner.ts`**, post-process result before appending to messages.
- Replace bloated content in provider history; keep full blob on disk for **061** replay.
- Respect **105** snapshot: offload decision recorded in snapshot metadata.

### 3. Budget interaction

- Offloaded content does not count toward **039** `toolResults` budget as full text — counts as pointer size only.
- Pins (**094**) unaffected.

### 4. Optional summarization (v1 minimal)

- Defer LLM summarization of old turns to follow-up.
- v1: offload only, no summarize.

## Non-goals

- Offloading user chat messages.
- Cross-project offload GC (best-effort delete offload files older than 7 days in same story or **110**).

## Testing

- Unit: 50k char tool result → pointer < 2k chars; file exists on disk.
- Unit: needle test — agent given pointer can `read_file` offload path via main-only handler or re-injected read.
- Eval (**108**): fixture “large search result → follow-up question about match line”.

## Acceptance criteria

- [ ] Tool results above threshold are offloaded automatically with pointer in thread.
- [ ] Context budget report shows reduced tool-result weight after offload.
- [ ] `npm run typecheck` and `npm run test` pass.

## Related stories

- **[039](../039-context-budget-and-retrieval-governance.md)**, **[108](108-harness-eval-suite-per-model-regressions.md)**.

## Completion bookkeeping

When implemented: mark **107** done, update [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
