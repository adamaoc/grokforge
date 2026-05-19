# 112 — Subagents as isolated child sessions

**Status:** Post-MVP backlog.

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` for child session UI in thread (`@styleguide-design`).

**Depends on:** **[104](104-agent-profiles-and-toolsets.md)**, **[105](105-agent-turn-snapshots.md)**, **[106](106-agent-tool-execution-context.md)**.

## Why this story exists

Reddit/Hermes/OpenCode patterns: **research sub-runs** with cheaper or read-only profiles keep the main thread clean and reduce context rot. GrokForge has **no** first-class subagent — only one flat tool loop.

This is **phase 2** of the harness program (after profiles + snapshots).

## Goals

### 1. Child session storage

`userData/workspace-projects/<projectId>/agent-sessions/<childSessionId>.jsonl`

- Parent `streamId` / `turnId` reference.
- Child uses `explorer` or `planner` profile with **read_only** toolset only.
- Child model: `models.planning` or configurable `models.reasoning` (**097** may define `research` intent later).

### 2. `spawn_subagent` tool (main, optional v1)

Input: `{ task: string, profile?: 'explorer' }`

- Runs bounded tool loop (max **5** rounds) in child session.
- Returns **structured artifact** JSON: `{ summary, filesRead[], searchHits[] }` — not raw transcript dump.

### 3. Parent integration

- Parent turn appends compact child artifact to context (budgeted).
- UI: collapsible “Subagent: explored codebase” block in thread (**093** style).

## Non-goals

- Parallel subagents (v2).
- Voice subagents (**113**).

## Acceptance criteria

- [ ] Child session persisted and inspectable in dev.
- [ ] Parent receives bounded structured result < 4k chars default.
- [ ] `npm run typecheck` and targeted tests pass.

## Related stories

- **[097](097-model-routing-planner-vs-executor.md)**, **[107](107-agent-context-offload-large-tool-results.md)**.

## Completion bookkeeping

When implemented: mark **112** done, update [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
