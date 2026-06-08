# 001 - Split ChatThread Message Rendering

## Goal

Reduce `src/renderer/src/components/chat-thread/ChatThread.tsx` by extracting
message-list rendering into focused components without changing chat behavior.

## Why

`ChatThread.tsx` still owns too much JSX. Message rendering, welcome state,
tool activity blocks, plan cards, markdown actions, and context footers are all
mixed with send/stream/proposal workflows. This makes UI polish risky because a
small visual change requires reading the whole chat runtime.

## Scope

Extract renderer-only components under `src/renderer/src/components/chat-thread/`:

- `ChatMessageList.tsx`
- `ChatMessageItem.tsx`
- `ChatWelcomePanel.tsx` or equivalent
- `ChatContextChips.tsx` if the composer/header context chip area can move cleanly

Keep data flow simple. If a component needs many callbacks, pause and decide
whether it belongs closer to a hook/store instead.

## Guardrails

- Do not change persistence, streaming, agent events, or proposal behavior.
- Keep the existing public `@/components/ChatThread` re-export.
- Avoid introducing new global state.
- Keep rendering components mostly presentational.
- Avoid story-number comments in new code.

## Acceptance Criteria

- `ChatThread.tsx` loses at least 400 lines.
- Message rendering is readable without scrolling through agent-stream logic.
- Existing message features still render:
  - user and assistant markdown
  - assistant message actions
  - plan cards
  - tool activity lists
  - subagent blocks
  - turn context footer/row
  - welcome suggestions
- `npm run typecheck` passes.
- `npm run test` passes.

## Nice To Have

- Add small rendering tests only if extracting pure formatting helpers or
  branch-heavy components exposes easy test seams.
