# 088 — Agent edits: regenerate proposal & review affordances

**Status:** Done (2026-05-18).

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` (`@styleguide-design`).

## Why this story exists

When a proposal is clearly wrong, users need a **one-click recovery**: re-read file from disk and ask the agent to try again—without manually retyping the task.

## Goals

1. **“Re-read & regenerate”** (or “Ask agent to fix proposal”) on pending proposal / diff session:
   - Re-read affected paths from disk into context.
   - Send a structured follow-up user message (or internal agent turn) referencing the failed proposal.
2. Optional: show **model reasoning** / tool activity snippet adjacent to diff when available from turn trace (**061**).
3. Keep **Discard** and **Review diff** as primary actions; regeneration is secondary.

## Scope

- Renderer: [`ChatThread.tsx`](../../src/renderer/src/components/ChatThread.tsx), diff chrome in [`EditorPane.tsx`](../../src/renderer/src/components/EditorPane.tsx).
- Reuse **`agent-chat-start`** with a composed message; no new IPC required unless batching is cleaner.

## Non-goals

- Automatic regeneration without user click.
- Multi-model planner/executor split (see **090**).

## Acceptance criteria

- [x] User can trigger regeneration from a bad proposal without leaving the workspace.
- [x] New proposal replaces pending state; old proposal discarded explicitly.
- [x] `npm run typecheck` passes.

## Implementation notes

- [`src/shared/agent-regenerate-proposal.ts`](../../src/shared/agent-regenerate-proposal.ts) builds the follow-up user message (paths, safety summaries, rejected paths, rework instructions).
- **Ask agent to fix** in the chat pending strip and in the diff review header (`regenerateLabel` / `onRegenerate` on diff session actions).
- [`AgentProposalTraceSnippet.tsx`](../../src/renderer/src/components/AgentProposalTraceSnippet.tsx) shows the last ~6 tool steps from turn trace when reviewing an agent proposal.

## Related stories

- **[061](../061-agent-debugging-telemetry-and-turn-replay.md)**.
- **[084](084-agent-edit-pre-apply-safety-warnings.md)** — warnings explain why user might regenerate.

## Completion bookkeeping

Marked **088** done; [`README.md`](../README.md) post-MVP table updated; **`npm run stories:html`** run.
