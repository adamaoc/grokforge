# 009 — Grok text API client (streaming, errors, cancellation)

**Design skill:** Only for any in-app API debugger UI; not required for core client module.

## Summary

Implement a **typed HTTP client** for xAI Grok chat/completions with **streaming** deltas, timeout, abort via `AbortController`, and structured errors. Read model ids from manifest (`models.*`) but keep API keys out of renderer (use main process or OS keychain later—**minimum**: env var in main only for dev).

## Scope

- Main-process module (preferred) exposing IPC `grok-stream-start` / chunk events / `grok-stream-cancel` **or** a single invoke that collects stream (less ideal).
- Renderer consumes chunks via `ipcRenderer.on` bridged through preload (`expose` careful API).
- Secrets: `process.env` in main, documented in `AGENTS.md` or `.env.example` (no real keys).

## Out of scope

- Tool calling / function execution (**010**).
- Voice (**013**).

## Acceptance criteria

- [x] Stream displays progressively in a minimal test harness component or existing chat (behind flag OK).
- [x] Network failure shows user-visible error (`sonner`).
- [x] Cancel stops network and clears partial state.

## Key files

- `src/main/` new module, `main.ts`, `preload.ts`, types in `src/renderer/src/types.ts` or shared.
