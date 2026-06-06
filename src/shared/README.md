# Shared Contracts

`src/shared` is for code that must be imported across process boundaries or app surfaces: main, preload, renderer, and the minimal harness. Keep this folder small and contract-shaped.

## Keep In Root

Root-level shared files should be one of:

- IPC contracts and DTOs used by preload/renderer/main.
- App-wide schemas that are not tied to old harness behavior.
- Small primitives used by the minimal harness, such as model messages and content hashes.

Examples:

- `agent/chat-contract.ts`
- `agent/model-message.ts`
- `agent/content-hash.ts`
- `bridge/preload-api-contract.ts`
- `workspace/search-contract.ts`
- `terminal/session-contract.ts`

## Legacy

`legacy/` holds contracts, helpers, and tests for older agent/harness features that are still referenced by compatibility UI or old support modules. Moving something into `legacy/` does not mean it is useless; it means it is not part of the current minimal harness base.

When a legacy feature is rebuilt for the minimal harness, prefer creating a narrow new contract in root shared rather than moving the old file back unchanged.

## Tests

Legacy-focused shared tests live under `legacy/__tests__/`. Root shared tests should cover root shared contracts only.
