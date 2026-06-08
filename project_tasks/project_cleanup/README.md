# Project Cleanup Backlog

This folder tracks cleanup work that is not about adding product features. The
goal is to keep GrokForge pleasant to work on as an open source project: smaller
files, clearer ownership boundaries, fewer legacy leaks, and state/effect logic
that is easier for humans and agents to reason about.

## Why This Exists

GrokForge went through a large harness simplification. That was the right move,
but it left behind some oversized UI files, broad bridge surfaces, legacy helper
imports, and documentation that still points at older story-era architecture.

Cleanup tasks in this folder are meant to make future feature work smoother:
plan mode, diff review, multi-root polish, and UI fixes should have obvious
places to land instead of swelling a few giant files.

## Cleanup Standards

- Prefer files with one clear responsibility. A file above roughly 500 lines
  should earn its size; a file above 1,000 lines should be treated as a cleanup
  candidate.
- Group by product concept, not by prefix. Folder names should carry the broad
  concept so filenames can be simple: `store.ts`, `session.ts`, `MessageList.tsx`.
- Keep feature state close to the feature. Zustand is allowed for complex local
  feature state, but avoid creating one giant app-global store.
- Follow React's "You Might Not Need an Effect" guidance:
  - Effects are for external synchronization: subscriptions, IPC, DOM, timers,
    persisted settings.
  - Derived data should be computed during render with selectors, helpers, or
    `useMemo` when needed.
  - User-triggered workflows should live in event handlers/actions, not effects
    that watch for state changes after the fact.
- Keep renderer code away from legacy harness internals where possible. Prefer
  stable shared contracts and feature-local adapters.
- Comments should explain durable design constraints, not temporary story/task
  history.
- Preserve behavior during cleanup passes. Feature changes can follow once the
  structure is safer.

## Current Baseline

After the first cleanup passes:

- `src/harness/` is grouped into runtime, tools, workspace, session, model,
  profile, logging, and diff folders.
- `src/shared/` is grouped by concept, with old harness-heavy tests/contracts
  under `src/shared/legacy/`.
- `src/main/` is grouped by capability, with compatibility tests under
  `src/main/legacy/`.
- `src/renderer/src/components/chat-thread/` exists and has a first pass at
  smaller helpers/hooks plus a feature-local Zustand composer store.

Largest remaining cleanup targets:

- `src/renderer/src/components/chat-thread/ChatThread.tsx`
- `src/renderer/src/App.tsx`
- `src/renderer/src/components/chat-thread/use-chat-proposal-flow.ts`
- `src/renderer/src/components/EditorPane.tsx` effect count
- `src/renderer/src/components/TerminalPanel.tsx` effect count

## Recurring Audit

Run the lightweight cleanup audit after major cleanup passes:

```sh
npm run cleanup:audit
```

The audit reports the top 30 largest source files, the React files with the
most `useEffect` / `useLayoutEffect` calls, active renderer imports from
`harness-support`, and stale contributor-doc references to removed flat paths.
It is informational only; it does not fail CI.

Baseline after tasks 001-008:

- Largest files: `ChatThread.tsx` 1,488 lines, `App.tsx` 1,412 lines,
  `use-chat-proposal-flow.ts` 1,121 lines.
- Effect-heavy renderer files: `EditorPane.tsx` 11 effects, `App.tsx` 10,
  `TerminalPanel.tsx` 8, `ChatThread.tsx` 6.
- Active renderer imports from `harness-support`: none outside
  `src/renderer/src/lib/legacy-agent/`.
- Stale active-doc references to removed flat paths: none.

## Recommended Order

1. Continue splitting `ChatThread` render pieces.
2. Extract `ChatThread` agent stream workflow.
3. Extract pending proposal/diff workflow.
4. Extract chat thread persistence/lifecycle.
5. Split main-process IPC registration by capability.
6. Trim renderer-to-legacy imports and update contributor docs.
7. Use `npm run cleanup:audit` to choose the next oversized/effect-heavy target.

Run at minimum `npm run typecheck` and the relevant focused Vitest files after
each cleanup task. Run `npm run test` before considering a cleanup pass complete.
