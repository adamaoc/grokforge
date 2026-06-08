# 003 - Extract ChatThread Proposal And Diff Workflow

## Goal

Move pending edit proposal, review, apply, discard, regenerate, and diff-session
logic out of `ChatThread.tsx`.

## Why

Diff review is one of the features we expect to rebuild/polish after the minimal
harness cleanup. The current proposal flow is too interwoven with message state,
toasts, editor callbacks, safety warnings, and plan execution. Pulling it into a
focused hook makes future diff work less likely to destabilize chat streaming.

## Scope

Create a hook such as:

- `usePendingProposal.ts`
- `useProposalDiffReview.ts`
- or `useChatProposalFlow.ts`

It should own:

- `pendingProposal`
- `pendingEditSafety`
- merge incoming proposals
- normalize proposal content
- review proposal with reviewer
- apply batch
- undo last applied batch
- discard proposal
- regenerate proposal follow-up
- fix failed edit follow-up
- open pending/applied diff sessions

Keep disk/editor callbacks as injected dependencies from `ChatThread` or App.

## Guardrails

- Preserve existing safety checks and toasts.
- Do not change `ParsedAgentToolBatch` shape.
- Do not change app-level diff session contracts in this task.
- Do not add new plan-mode behavior.
- Avoid moving old harness-support contracts deeper into renderer; if possible,
  define renderer-facing proposal types in a shared or chat-thread adapter.

## Acceptance Criteria

- `ChatThread.tsx` no longer owns proposal apply/discard/review/regenerate
  implementation details.
- Proposal workflow has a named return value that the render layer can use.
- Existing proposal UI still supports:
  - review diff
  - apply
  - discard
  - normalize
  - reviewer
  - undo
  - regenerate
  - fix failed edit
- `npm run typecheck` passes.
- `npm run test` passes.

## Nice To Have

- Add focused tests for pure proposal helpers if new helper functions are
  introduced.
