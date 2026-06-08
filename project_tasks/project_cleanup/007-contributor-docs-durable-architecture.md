# 007 - Make Contributor Docs Durable

## Goal

Trim and update contributor-facing docs so they describe the current architecture
without relying on temporary story/task history.

## Why

This is an open source project. Contributors should be able to open `README.md`,
`AGENTS.md`, and folder READMEs and understand the stable architecture. Story
numbers are useful as history, but they should not be the main way to understand
current code.

## Scope

Review and update:

- `README.md`
- `AGENTS.md`
- `src/harness/README.md`
- `src/shared/README.md`
- `src/main/README.md`
- `src/renderer/src/components/chat-thread/` docs if added

Move or summarize old story-era details instead of keeping long feature-history
blocks in `AGENTS.md`.

## Guardrails

- Keep security and process-boundary rules prominent.
- Keep current commands accurate.
- Keep folder maps accurate.
- Avoid deleting useful historical project tasks; this task is about current
  contributor docs.
- Do not add comments/docs that point to tasks likely to be removed soon.

## Acceptance Criteria

- `AGENTS.md` is shorter and current-facing.
- Current source paths are correct.
- Harness-vs-app boundaries are described clearly.
- Legacy areas are labeled without drowning contributors in old implementation
  details.
- No active docs point at removed flat files such as old `src/main/agent-runner.ts`.

## Suggested Verification

Run a stale-path scan after edits:

```bash
rg "src/main/(agent-runner|manifest|chat-store|workspace-search|git\\.ts|voice-realtime|terminal-session|app-project-store)" README.md AGENTS.md src docs
```
