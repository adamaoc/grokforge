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
