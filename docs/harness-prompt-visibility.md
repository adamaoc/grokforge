# Prompt & context visibility (harness v2)

## What harness logs today

Each turn writes **`minimal/logs/<streamId>.jsonl`** under the project app data folder.

| Event `kind` | When | Useful fields |
|--------------|------|----------------|
| `turn_start` | Beginning | `modelId`, `workspaceRoot`, `messageCount`, `approxContextChars` |
| `context_snapshot` | Before first API call | `systemPrompt` (full text), `apiMessages` (roles + content lengths; tool messages summarized) |
| `compaction` | After history compact | `hiddenCount`, `summaryChars` |
| `model_step` | Each loop iteration | `promptTokens`, `completionTokens`, `totalTokens`, `toolCallCount`, `durationMs` |
| `tool` | Each tool execution | `name`, `ok`, `resultPreview`, `durationMs` |
| `turn_done` | Success | `finalChars`, `steps` |

Console mirrors key lines as `[harness] <kind> …`.

## What is not in the UI yet (bigger follow-up)

- Live “context budget” bar in chat
- Turn trace inspector panel for harness events
- Provider request/response diff vs legacy `AgentTurnSnapshot`

Those need renderer + IPC work. Harness logs already capture enough to debug “what did we send?” from the log file.

## How to inspect during dev

```bash
# After a chat turn, streamId from UI or log:
tail -f "~/Library/Application Support/GrokForge/workspace-projects/<projectId>/minimal/logs/<streamId>.jsonl"
```

Open `context_snapshot` → `systemPrompt` and per-message previews.
