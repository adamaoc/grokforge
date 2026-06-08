# GrokForge agent tools

Reference for built-in harness tools: what exists, how they run, and how that compares to **ampnet-harness-p8** (`ampnet-harness-p8/src/harness/tools.ts`).

## Mental model

GrokForge evolved from the [harness 101 project](https://github.com/adamaoc/harness-101/) (xAI function tools + profile allowlists + tool loop), but targets a **desktop IDE** with multi-root workspaces, **reviewable edit proposals**, content-hash staleness checks, and richer safety policy. Tools are split across several modules instead of a single `tools.ts` file.

```
Model tool_call
    → tool-executor.ts (dispatch + policy)
        → workspace-tools.ts     (read / list / search / index)
        → diff/* + validateAgentEditProposal   (edit / search_replace / propose_file_edits)
        → run-command-tool.ts    (run_command + user approval)
        → subagent/runner.ts     (spawn_subagent)
    → tool result JSON → thread / compaction / UI events
```

**Apply path (after user approves):** `write-batch.ts` applies `propose_file_edits` batches on disk (IPC), separate from the in-loop proposal builder.

---

## Tool inventory (GrokForge)

| Tool                 | Toolset   | Primary use                                                     | Executor path                                         | Notes                                                                 |
| -------------------- | --------- | --------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------- |
| `workspace_index`    | read_only | Compact, ignore-aware tree of all manifest roots                | `workspace-tools.ts` → index store                    | Optional `refresh`                                                    |
| `list_directory`     | read_only | One directory listing (filtered)                                | `workspace-tools.ts`                                  | Replaces ampnet `list_files`; respects ignore globs + sensitive paths |
| `read_file`          | read_only | Line-range read with `contentHash`, `rawContent`, numbered view | `workspace-tools.ts`                                  | Capped lines/chars; tracks reads for edit policy                      |
| `search_workspace`   | read_only | Ripgrep-style scan across roots                                 | `workspace-tools.ts`                                  | Max 50 hits, skips binary/large/secret paths                          |
| `edit`               | edit      | **Preferred** Pi-style `edits[]` on existing files              | `tool-executor.ts` → `search-replace-tool` → proposal | Requires `expectedContentHash`; never writes directly                 |
| `search_replace`     | edit      | Legacy alias for `edit` (single or multi `edits`)               | Same as `edit`                                        | Iterative Work mode can block after repeated failures                 |
| `propose_file_edits` | edit      | Batch `write_file` / `delete_file` (review UI)                  | `tool-executor.ts` → `validateAgentEditProposal`      | New files or rare full rewrites; max 32 ops                           |
| `run_command`        | command   | One-shot shell in a workspace root                              | `run-command-tool.ts`                                 | **Always** user-approved; command policy + scaffold checks            |
| `spawn_subagent`     | (profile) | Read-only explorer child session                                | `tool-executor.ts` → `subagent/runner.ts`             | Parent only; not nested in child sessions                             |

Schemas live in `workspace-tools.ts` (`AGENT_TOOL_DEFINITIONS` + `AGENT_SPAWN_SUBAGENT_DEFINITION`). Per-turn API list: `buildToolDefinitionsForTurn()` (profile filter + optional description overrides).

---

## Profile → allowed tools

Profiles compose named toolsets from `profiles/contracts/toolset.ts`:

| Toolset     | Tools                                                                |
| ----------- | -------------------------------------------------------------------- |
| `read_only` | `workspace_index`, `list_directory`, `read_file`, `search_workspace` |
| `edit`      | `edit`, `search_replace`, `propose_file_edits`                       |
| `command`   | `run_command`                                                        |
| `full`      | read_only + edit + command                                           |

| Profile    | Allowed tools                   | Edits | Commands | Max tool rounds (typical)       |
| ---------- | ------------------------------- | ----- | -------- | ------------------------------- |
| `planner`  | read_only only                  | no    | no       | 3                               |
| `executor` | full + `spawn_subagent`         | yes   | yes      | 6 (approved plan auto-run)      |
| `default`  | full + `spawn_subagent`         | yes   | yes      | 8 (`AGENT_TOOL_MAX_ITERATIONS`) |
| `explorer` | read_only only (child subagent) | no    | no       | 5 (`SUBAGENT_MAX_TOOL_ROUNDS`)  |

Resolved per turn via `resolveAgentProfileId()` (plan mode → planner; execution / approved plan → executor).

Enforcement: `isToolAllowedForProfile()` in `tool-executor.ts` before execution; schemas filtered by `filterToolDefinitionsForProfile()`.

---

## How each cluster is used in the harness

### Read / explore (`workspace-tools.ts`)

- **Paths:** Multi-root `GrokProjectManifest`; resolves relative paths against active root, then other roots. Also allows reads under chat staging, agent offload, and plan artifacts (not general workspace writes).
- **Guards:** `shouldIgnoreFsEntry`, `isLikelySensitivePath` (`.env`, keys, etc.), binary detection (NUL in head), size caps.
- **Retrieval:** `buildLexicalRetrievalContext()` auto-injects ranked file snippets into context (pins, attachments, index ranking) — no separate “retrieval tool”; exploration is tool-driven + automatic retrieval.
- **Same-turn reads:** `AgentToolExecutionContext.recordPathRead` + turn read registry feed edit validation (read-before-write).

### Edit (`tool-executor.ts` + `diff/`)

- **No direct disk write from the model.** All edit tools produce an `AgentEditProposalPayload` merged per turn (`mergeAgentEditProposals`), emitted as `edit_proposal` phase for UI diff review.
- **`edit` / `search_replace`:** Parsed by `SearchReplaceToolArgsSchema`, converted to internal write batch via `resolveSearchReplaceToWriteBatch` (fuzzy match, reverse-order apply, chaining within turn).
- **`propose_file_edits`:** Zod `AgentToolBatchPayloadSchema` (`contracts/tool-schema.ts`); `expectedContentHash` on updates, sentinel for creates (`shared/agent-content-hash`).
- **Policy hooks:** cascade guard (block repeated failing search_replace), creation recovery scaffolds, code quality contract in tool descriptions, scaffold template validation when writes imply greenfield.

### Commands (`run-command-tool.ts`, `run-command.ts`)

- Model supplies `rootId`, `command`, `purpose`; optional `timeoutMs`.
- `evaluateAgentCommandRisk()` may hard-block; scaffold commands validated against expected Vite template.
- `ctx.waitForCommandApproval()` gates execution; progress/events stream to UI.

### Subagents (`spawn_subagent`)

- Replaces ampnet **`delegate`** with a stricter contract: v1 profile is **`explorer`** only (read-only toolset), compact JSON summary back to parent (not full child transcript in tool result).
- Child sessions persisted under `subagent/session-store.ts`; uses same `executeAgentToolCall` + explorer profile.

### Execution context (`execution-context-builder.ts`)

Per tool call builds `AgentToolExecutionContext`: project/stream ids, manifest, active UI context (tabs, selection, pins, attachments), abort signal, throttled progress emit, command approval waiter, read registry.

### Write batch apply (`write-batch.ts`)

Used when the **user accepts** a proposal (main/IPC), not during model tool rounds. Applies operations with hash/precondition checks, undo snapshots, layout normalization.

---

## Limits and budgets (GrokForge)

| Limit                          | Value                             | Where                                                    |
| ------------------------------ | --------------------------------- | -------------------------------------------------------- |
| Tool rounds per turn           | 8 default; 6 executor; 5 explorer | `AGENT_TOOL_MAX_ITERATIONS`, profiles, subagent contract |
| Total tool result chars / turn | 80_000                            | `AGENT_CONTEXT_BUDGETS.toolTotalResultMaxChars`          |
| Read file default / max lines  | context budget contract           | `AGENT_READ_FILE_*` in `workspace-tools.ts`              |
| Search results                 | 50                                | `AGENT_SEARCH_MAX_RESULTS`                               |
| Proposal batch ops             | 32                                | `AGENT_TOOL_MAX_OPS`                                     |
| Per-file write payload         | 512_000 chars                     | `AGENT_TOOL_MAX_CONTENT_CHARS_PER_FILE`                  |

Tool results can be offloaded/compacted per `compaction/` policy (separate from this folder).

---

## Module map

| File                                     | Role                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| `index.ts`                               | Public exports for harness/main                                                      |
| `workspace-tools.ts`                     | Tool JSON schemas, read/list/search/index, retrieval helpers, `executeWorkspaceTool` |
| `tool-executor.ts`                       | Central dispatch: profile, budget, edits, commands, subagent                         |
| `execution-context-builder.ts`           | Construct per-call `AgentToolExecutionContext`                                       |
| `run-command-tool.ts` / `run-command.ts` | Command tool + subprocess runner                                                     |
| `write-batch.ts`                         | Apply/undo approved batches on disk                                                  |
| `contracts/tool-contract.ts`             | Batch protocol version, op types, IPC result shapes                                  |
| `contracts/tool-schema.ts`               | Zod batch schema; legacy fence strip for display                                     |
| `contracts/execution-context.ts`         | Execution context type + progress throttling                                         |
| `contracts/run-command-contract.ts`      | Timeout bounds                                                                       |
| `helpers/scaffold-command.ts`            | `npm create` / Vite scaffold helpers                                                 |

Edit matching and proposal validation live under `src/harness/diff/` (not in `tools/`).

---

## Comparison: ampnet-harness-p8 vs GrokForge

Both projects expose **xAI Chat Completions function tools** filtered by **profile allowlists**, executed in a multi-iteration agent loop. ampnet is a minimal CLI harness; GrokForge is the full IDE harness.

### Tool surface

| Concern            | ampnet-harness-p8                                                     | GrokForge                                                                                                                       |
| ------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **List / explore** | `list_files` (one level, cwd only)                                    | `list_directory` + `workspace_index` + `search_workspace`                                                                       |
| **Read**           | Full file, relative to `process.cwd()`                                | Line range, hash, `rawContent`, format warnings, multi-root                                                                     |
| **Write**          | `write_file` — **immediate** disk write + unified diff in tool result | **No direct write tool.** `edit` / `search_replace` / `propose_file_edits` → reviewable proposal → user apply via `write-batch` |
| **Delete**         | —                                                                     | `propose_file_edits` → `delete_file` op                                                                                         |
| **Shell**          | —                                                                     | `run_command` with approval + policy                                                                                            |
| **Subagent**       | `delegate` → planner or reviewer child (full reply text)              | `spawn_subagent` → explorer only (compact artifact)                                                                             |
| **Staleness**      | None                                                                  | `expectedContentHash` on edits; conflict detection on apply                                                                     |
| **Path safety**    | Simple `resolvePath` prefix check on cwd                              | Multi-root manifest guard, ignore globs, sensitive path denylist                                                                |
| **Implementation** | Single `tools.ts` (~200 lines)                                        | Split: schemas, executor, diff, policy, subagent                                                                                |

### Profiles

| ampnet profile | Tools                                           | GrokForge analogue                                                            |
| -------------- | ----------------------------------------------- | ----------------------------------------------------------------------------- |
| `planner`      | `read_file`, `list_files`                       | `planner` — read_only toolset (richer reads)                                  |
| `implementer`  | read + `write_file` + `list_files` + `delegate` | `default` / `executor` — full toolset + `spawn_subagent` (no immediate write) |
| `reviewer`     | read + list                                     | No dedicated reviewer profile; use `explorer` subagent or planner             |

ampnet **implementer** maps closest to GrokForge **executor**, except writes are synchronous in ampnet and proposal-based in GrokForge.

### Loop behavior

|                | ampnet                           | GrokForge                                                               |
| -------------- | -------------------------------- | ----------------------------------------------------------------------- |
| Max iterations | 25 fixed (`loop.ts`)             | 8 default; profile-specific; separate subagent cap                      |
| Tool filtering | `getToolSchemas(allowedTools)`   | `buildToolDefinitionsForTurn` + profile + harness description overrides |
| Compaction     | `maybeCompact` on message count  | Full compaction cluster (tool offload, turn snapshots, thread memory)   |
| Observability  | Hidden turn snapshots in session | Turn traces, activity stream, edit proposal events                      |

### When to look at ampnet for reference

- **Simplest end-to-end tool loop:** `ampnet-harness-p8/src/harness/loop.ts` + `tools.ts`
- **Immediate write + diff feedback:** ampnet `write_file` pattern (GrokForge intentionally does not expose this to the model)
- **Delegate / subagent spawn:** ampnet `delegate` + `subagent.ts` — conceptual predecessor to `spawn_subagent`

### When to stay in GrokForge docs/code

- Edit proposals, fuzzy `search_replace`, merge-in-turn: `src/harness/diff/`
- Command approval and risk tiers: `src/harness/policy/command/`
- Profile resolution and toolsets: `src/harness/profiles/`
- Live orchestration: `src/main/agent/runner.ts` bridges the current main process to the minimal harness; legacy tool execution references remain compatibility context.

---

## Quick reference: ampnet tool names → GrokForge

| ampnet       | GrokForge equivalent                                                       |
| ------------ | -------------------------------------------------------------------------- |
| `list_files` | `list_directory` (and often `workspace_index` first)                       |
| `read_file`  | `read_file` (richer response; use `contentHash` for edits)                 |
| `write_file` | `edit` or `propose_file_edits` (`write_file` op), then user approves apply |
| `delegate`   | `spawn_subagent` (explorer-only, summarized result)                        |

---

## Related reading

- Harness overview: `src/harness/README.md`
- ampnet tools source: `ampnet-harness-p8/src/harness/tools.ts`
- ampnet profiles: `ampnet-harness-p8/src/harness/profiles.ts`
- Toolsets: `src/harness/profiles/contracts/toolset.ts`
- Shared tool names / IPC: `src/shared/agent-chat-contract.ts`
