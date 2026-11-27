# Shared Contracts

`src/shared` is for code that must be imported across process boundaries or app surfaces: main, preload, and renderer. Keep this folder small, contract-shaped, and free of Electron/Node implementation imports.

## Keep In Root

Root-level shared files should be one of:

- IPC contracts and DTOs used by preload/renderer/main.
- App-wide schemas.
- Small pure helpers shared across processes (line diffs, voice handoff text).

Examples:

- `agent/chat-contract.ts`
- `agent/provider-contract.ts`
- `agent/checkpoint-contract.ts`
- `bridge/preload-api-contract.ts`
- `workspace/search-contract.ts`
- `terminal/session-contract.ts`

## Tests

Tests sit next to the code they cover (`*.test.ts`).
