# 094 — Agent context: file pinning and cross-turn memory

**Status:** Done (2026-05-18).

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` for pin UI (`@styleguide-design`).

## Why this story exists

**058** added attachments and editor selection for the **next** message. Users want **stronger continuity**: files/folders that stay in context across turns, and lightweight **memory** of what the agent already read so it does not re-ask or forget decisions.

## Goals

### Pinning (v1)

- **Pin** files or folders (beyond one-shot attachments) with a visible strip in composer or context header.
- Pinned paths included in `activeContext` / retrieval bias until unpinned (cap count, respect ignore rules).
- Persist pins per project in app storage (not user repo).

### Memory (v1 — bounded)

- Optional summary block per thread: “Files read this session”, “Decisions” (auto from tool trace, capped chars)—injected into system context on later turns.
- Not full RAG re-architecture; build on **057** index + trace metadata.

## Non-goals

- Unlimited chat history to model (stay within **039** budgets).
- Cross-project memory.

## Acceptance criteria

- [ ] User can pin/unpin at least N workspace paths per project.
- [ ] Pinned paths appear in agent context for subsequent turns until removed.
- [ ] Documented char/token budget impact in story PR notes.
- [ ] `npm run typecheck` passes.

## Related stories

- **[058](../058-agent-context-attachments-and-selection-workflow.md)**, **[039](../039-context-budget-and-retrieval-governance.md)**, **[057](../057-agent-retrieval-and-project-intelligence-v2.md)**.

## Completion bookkeeping

When implemented: mark **094** done, update [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
