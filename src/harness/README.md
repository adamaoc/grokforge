# GrokForge Harness

This folder contains the single runtime harness used by agent chat.

## Runtime Modules

| File | Role |
|------|------|
| `run-turn.ts` | Main-process turn entry; emits IPC phases and streams final text |
| `loop.ts` | Model → tool loop with iteration budget |
| `tools.ts` | `list_files`, `read_file`, `write_file`, `edit` schemas and execution |
| `edit-tool.ts` | Direct surgical edit application with content-hash checking |
| `profile.ts` | Work profile, system prompt, routing metadata |
| `paths.ts` | Workspace-root path resolution and guard |
| `session.ts` | Per-stream JSONL message history |
| `logger.ts` | Per-stream JSONL harness logs |
| `model-client.ts` | Non-streaming xAI Chat Completions client |
| `compaction.ts` | Lightweight visible-context compaction |
| `diff/` | Kept edit primitives: fuzzy matching, search-replace, line stats |
| `agent/content-hash.ts` | Shared content-hash helpers for read/edit staleness |

## Docs

- `docs/harness-architecture.md`
- `docs/harness-deferred-features.md`
- `docs/harness-prompt-visibility.md`

Runtime logs currently remain under `userData/workspace-projects/<projectId>/minimal/logs/` so existing validation logs stay grouped with the field-report sessions.
