# 061 — Agent debugging, telemetry, and turn replay

**Status:** Done (v1 shipped).

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` before changing agent activity UI, context preview, settings, or debug dialogs.

## Shipped (v1)

- **Contract:** `src/shared/agent-turn-trace-contract.ts` — Zod schema v1, result types, max **12** trace files per project.
- **Persistence:** `src/main/agent-turn-trace-store.ts` — `workspace-projects/<id>/agent-traces/`, mtime prune, `sanitizeTraceForExport` / `redactUserHomeInString`, `replayRetrievalPreviewFromLatestTrace` (lexical retrieval only; no model replay).
- **Capture:** `src/main/agent-turn-trace-builder.ts` + wiring in `src/main/agent-runner.ts` (`runTurnJob` / `runAgentTurn`) — retrieval snapshot, tool step metadata, assistant stream char count, outcomes `completed` | `cancelled` | `error` | `timeout`.
- **IPC / preload:** `get-last-agent-turn-trace`, `export-sanitized-agent-turn-trace`, `replay-agent-retrieval-preview` (registered in `agent-runner.ts`; exposed on `window.electron` via `preload.ts` + `preload-api-contract.ts`).
- **UI:** `src/renderer/src/components/AgentTurnTraceInspector.tsx` — opened from **ProjectHeader** and **ChatThread** thread menus (“Last agent turn trace…”).
- **Tests:** `src/main/agent-turn-trace-store.test.ts` (sanitize / home redaction).

Telemetry is **local only** (no third-party); clearing/deleting a project removes its trace directory with existing project storage deletion.

## Why this story exists

As the agent gets smarter, failures become more subtle. The user may ask “why did it look at that file?”, “why didn’t it read the open tab?”, “why did it stop?”, or “what did it actually send to the model?” Story **034** added compact activity rows, but not a developer-grade debugging surface.

This story adds inspectability without cluttering normal chat.

## Goals

- Capture a structured per-turn debug trace under app storage.
- Let developers inspect what context, retrieval, tools, limits, and errors were involved.
- Make failed turns easier to diagnose and replay.
- Avoid logging secrets, raw API keys, or sensitive file contents.

## Trace contents

For each agent turn, store a compact record:

- turn id / stream id
- model id and chat mode
- timestamps and duration
- active context snapshot
- retrieval candidates and chosen context reasons
- tool calls requested and executed
- tool result sizes/truncation, not necessarily full contents
- errors/cancel/timeout state
- final answer metadata

Content policy:

- redact sensitive paths/content
- do not store API keys
- avoid storing full tool results by default; store summaries and optional dev-mode detail
- allow clearing traces with project data

## UI

- Add “Inspect last agent turn” from chat thread options or context preview.
- Show:
  - context layers
  - retrieval choices
  - tool timeline
  - limits hit
  - warnings/errors
- Add copy/export of a sanitized debug bundle for bug reports.

## Replay

V1 replay can be limited:

- replay retrieval/tool planning against current workspace without calling the model, or
- export a sanitized bundle for manual analysis.

Do not require deterministic model replay in V1.

## Testing

- [x] Trace writer redacts sensitive paths and strips obvious secret-ish strings on export (`agent-turn-trace-store.test.ts`).
- [x] Cancelled/error/timeout turns persist traces with matching `outcome` (wired in `runTurnJob` `finally`).
- [x] Clearing project data removes traces (traces live under `workspace-projects/<id>/`; same deletion path as project storage).
- [x] Debug UI handles missing trace (empty / placeholder copy until a turn runs); old trace versions skipped on read if schema parse fails (reader tries next file).

## Acceptance criteria

- [x] Each agent turn can produce a sanitized debug trace.
- [x] Users can inspect the last turn without raw chat/tool noise in normal chat.
- [x] Trace includes retrieval and tool timeline metadata.
- [x] Sensitive data is redacted or omitted.
- [x] Debug bundles can help diagnose user-reported agent issues.

