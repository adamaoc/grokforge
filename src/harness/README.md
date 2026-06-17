# GrokForge Harness

This is the minimal agent runtime used by text agent chat. It intentionally keeps the base small: one active workspace root, direct file tools, a compact model/tool loop, and JSONL session/log output. Larger product features such as plan mode, reviewable diff application, richer context retrieval, and multi-root orchestration should be added through explicit runtime boundaries rather than by expanding one large harness module.

## Folders

| Folder | Role |
| --- | --- |
| `runtime/` | Turn entrypoint, model/tool loop, lightweight compaction, iteration caps |
| `tools/` | Tool definitions and execution: `list_files`, `read_file`, `write_file`, `edit`, `run_command` |
| `workspace/` | Active-root selection and path guards |
| `profile/` | Work + Plan profiles, turn routing, system prompts |
| `context/` | Plan-mode project snapshot (doc paths, stack hints) |
| `model/` | Non-streaming xAI Chat Completions client |
| `session/` | Per-stream in-memory history with JSONL persistence |
| `logging/` | Per-stream JSONL harness logs |
| `diff/` | Local edit/search primitives and diff stats used by minimal tools and UI helpers |
| `agent/` | Small agent utility helpers such as content hashing |

## Public Surface

Import runtime entrypoints from `src/harness/index.ts`. Avoid deep imports from app code unless a module is explicitly a low-level helper such as `diff/line-stats`. Renderer compatibility with old agent contracts belongs in `src/renderer/src/lib/legacy-agent/`, not inside this runtime.

Current public exports include:

- `runAgentHarnessTurn`
- `runHarnessTurnLoop`
- `resolveHarnessWorkspace`
- `resolveWithinWorkspace`
- `buildHarnessSystemPrompt`
- `harnessTurnRouting`
- `resolveHarnessProfileKey`

## Model step timeouts

Harness v2 applies a **per-model-step** abort timeout on each non-streaming xAI request in the
tool loop (`src/harness/runtime/model-step-timeout.ts`). This is separate from the tool-round
iteration cap and from legacy multi-minute turn budgets.

| Phase | Default timeout |
| --- | --- |
| Early steps (0–7) | 3 minutes |
| Late steps (8+) | +1 minute |
| Deep steps (12+) | +1 additional minute |
| Large context (24+ visible messages) | +45 seconds |
| Hard cap (any step) | 5 minutes |

When a step times out, `run-turn.ts` surfaces a harness error that mentions partial disk
changes may already exist, and the harness log records a `model_step` event with
`outcome: "timeout"`, `durationMs`, and `timeoutMs`.

Compaction summarization uses the base timeout only (no adaptive bonuses).

## Turn errors and partial progress (GFAPP-010)

**Investigation (post GFAPP-007 / GFAPP-009):** The original Scaffold-Test repro was a model-step
timeout after mutating tools had already run. GFAPP-009 added adaptive timeouts and a generic
timeout message. In harness v2 Work mode, `write_file` / `edit` produce **reviewable proposals**
(not disk writes) unless the user applies them or velocity auto-apply runs at turn end — a turn
that ends in `phase: error` skips end-of-turn auto-apply.

`run-turn.ts` therefore tracks successful `write_file`, `edit`, and `run_command` calls and
appends contextual hints via `formatHarnessTurnErrorMessage()`:

- **Proposals only** — points users at edit proposals already in the chat.
- **`run_command` success** — reminds users to refresh the file tree for possible disk changes.
- **Timeouts** — replace the generic disk-only copy with hints that match what actually happened
  in the turn.

Non-goals remain: listing every touched path, turn receipts, renderer-only toasts.

## Tests

Harness tests live next to the code they cover under `__tests__/` folders. Run them with:

```sh
npm run test:harness
```

## Notes For Future Features

- Keep the minimal tool loop direct and understandable.
- Put UI compatibility at the event/contract boundary, not inside the core loop.
- `run_command` uses a thin adapter (`tools/run-command.ts`) over `harness-support` policy/spawn; main-process approval IPC lives in `src/main/agent/command-approval.ts`.
- When adding plan mode, diff review, or multi-root support, introduce small modules with narrow interfaces and tests before wiring renderer behavior.
- Comments should explain current invariants and safety decisions. Historical story/task references belong in docs, not source comments.

Runtime logs remain under `userData/workspace-projects/<projectId>/minimal/logs/`.
