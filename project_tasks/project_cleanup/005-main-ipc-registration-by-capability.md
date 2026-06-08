# 005 - Split Main IPC Registration By Capability

## Goal

Reduce `src/main/main.ts` by moving IPC handler registration into capability
folders while keeping `main.ts` as the Electron entrypoint.

## Why

`src/main/main.ts` is still over 1,300 lines. The new main folder layout is
cleaner, but IPC registration still centralizes project, workspace, chat,
terminal, voice, git, settings, and agent handlers in one file.

## Scope

Add registration modules such as:

- `src/main/project/register-ipc.ts`
- `src/main/chat/register-ipc.ts`
- `src/main/workspace/register-ipc.ts`
- `src/main/terminal/register-ipc.ts`
- `src/main/voice/register-ipc.ts`
- `src/main/git/register-ipc.ts`
- `src/main/xai/register-ipc.ts`
- `src/main/agent/register-ipc.ts`

Each module should accept the small dependencies it needs, for example current
project accessors or `BrowserWindow`.

## Guardrails

- Keep `src/main/main.ts` as the configured Electron entrypoint.
- Do not change IPC channel names in this task.
- Do not change preload API shape in this task.
- Avoid creating a generic dependency object with every app variable.
- Keep each registration file scoped to one capability.

## Acceptance Criteria

- `src/main/main.ts` is materially smaller and easier to scan.
- Each IPC capability has a local registration module.
- Existing preload contract tests still pass.
- `npm run typecheck` passes.
- `npm run test` passes.

## Suggested Order

Start with low-risk groups:

1. project/recent IPC
2. workspace search/fs mutate IPC
3. git IPC
4. terminal IPC
5. voice/TTS IPC
6. agent IPC last
