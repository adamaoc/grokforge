# 002 - Extract ChatThread Agent Stream Workflow

## Goal

Move the large agent event handling flow out of `ChatThread.tsx` into a named
hook or feature controller.

## Why

`processAgentStreamEvent` is one of the most important logic blocks in the
renderer. It handles activity rows, proposals, command approvals, turn routing,
final chunks, completion, cancellation, and errors. Keeping it embedded in the
render component makes future plan/diff work harder and increases stale-closure
risk.

## Scope

Create a hook such as:

- `useAgentStreamEvents.ts`
- or `useChatThreadAgentStream.ts`

It should own:

- processing `AgentChatEventPayload`
- terminalizing running activities
- final chunk buffering updates
- done/error/cancelled cleanup paths
- command approval queue updates
- live routing updates
- live subagent updates

The hook can accept a small context object of callbacks and refs. If the context
object gets too large, split the work into smaller hooks before proceeding.

## Guardrails

- This is not a rewrite of the stream protocol.
- Do not change main/preload IPC names.
- Do not change activity payload shape.
- Keep external subscriptions in `use-chat-thread-subscriptions.ts`; this task
  extracts event processing, not subscription wiring.
- Prefer explicit action names over effects that react to state changes.

## Acceptance Criteria

- `ChatThread.tsx` no longer contains the full `processAgentStreamEvent` body.
- Stream event handling is isolated behind a named hook with a small public API.
- Existing stream states still work:
  - activity rows update
  - edit proposals appear
  - final chunks append
  - done cleans up busy state
  - cancel/error clean up correctly
- `npm run typecheck` passes.
- `npm run test` passes.

## Suggested Verification

Run focused renderer tests, then manually smoke a mock/no-key chat turn if the
app can be launched during the pass.
