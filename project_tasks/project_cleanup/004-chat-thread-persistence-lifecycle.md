# 004 - Extract ChatThread Persistence And Lifecycle

## Goal

Move chat hydration, persisted-line append, clear-thread behavior, welcome-line
updates, and project-intelligence refresh defaults out of `ChatThread.tsx`.

## Why

Thread lifecycle is legitimate side-effect work: it talks to Electron IPC,
subscribes to persisted lines, and initializes state after project changes. It
should be named and isolated so the render component does not carry persistence
details.

## Scope

Create hooks such as:

- `useChatThreadPersistence.ts`
- `useChatThreadHydration.ts`
- `useChatThreadWelcome.ts`

They should own:

- initial load from `window.electron.loadChatThread`
- corrupt-history toast handling
- fallback welcome message
- appending persisted chat lines
- clearing chat history
- updating welcome copy when project/root changes
- first-empty-greenfield default-to-plan behavior

## Guardrails

- Keep persistence IPC calls unchanged.
- Do not change chat line schema.
- Do not move persistence into Zustand unless it clearly reduces complexity.
  Zustand should hold state/actions, not hide IPC side effects.
- Follow React's effect guidance: hydration and IPC are valid effects; derived
  display lists should stay outside effects.

## Acceptance Criteria

- `ChatThread.tsx` no longer contains raw load/append/clear IPC implementation.
- Persistence hooks have explicit names and narrow dependencies.
- Clearing chat still resets visible state and plan interaction storage.
- Corrupt chat history still toasts and falls back safely.
- `npm run typecheck` passes.
- `npm run test` passes.
