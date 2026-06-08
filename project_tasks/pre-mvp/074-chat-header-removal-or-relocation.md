# 074 — Chat header removal or relocation

**Status:** Done (v1: header removed; model + thread menu in composer strip).

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` before changing `ProjectWorkspaceShell`, `ChatThread` chrome, or app header (`@styleguide-design`).

## Shipped decision

- **Removed** the dedicated top **Agent Thread** header block (title, subtitle, duplicate chrome).
- **Relocated** to the **composer** toolbar (above the input, same row as Chat/Plan mode): **Next turn** model intent (Fast vs planning id), **ModelBadge**, and **thread overflow** (refresh intelligence, last turn trace, clear history).
- **Vertical space:** message list uses full column height (`grid-rows-[minmax(0,1fr)_auto]`).

## Why this story exists

The **chat column header** (or adjacent chrome) consumes vertical space and may duplicate controls that belong elsewhere. The product direction is to **remove** it entirely **or** reduce it to zero unless something there is **genuinely essential**—in which case that control moves to a **better home** (app header, composer strip, overflow menu).

## Goals

1. **Decision:** Either **remove** the chat-specific header region **or** replace it with a **minimal** single row (document the decision in this file when shipped).
2. **Relocate** surviving controls:
   - **Model / Fast vs planning intent** (if not already only in composer-adjacent areas per **062**).
   - **Thread actions** (clear, export, debug) — overflow or Settings if rarely used.
   - **Voice** entrypoints — align with **077**.
3. **Vertical space:** measurably increase usable message list height on typical laptop resolutions.

## Scope

### Renderer

- **`ChatThread.tsx`**: identify header block(s) (titles, chips, duplicate model pickers).
- **`App.tsx` / `ProjectWorkspaceShell`**: if controls move to **window header**, reuse existing header components and avoid duplicating state sources.

### Coordination with 065

- **[065](065-launch-agent-thread-context-and-model-visibility.md)** defines **model + root context visibility**. Either:
  - **Merge** this story into **065** (single layout pass), or
  - **Sequence:** complete **065** decisions first, then **074** removes redundant chrome knowing where model context landed.

Document chosen approach in the PR.

## UX direction

- Prefer **one authoritative** place for “what model / mode am I using?”
- Avoid hamburger-only hiding of critical safety controls (command approvals stay in-thread).

## Testing

- Manual: all chat controls still reachable after header removal at **1280×720** and **narrow** chat column.
- **`npm run typecheck`**.

## Acceptance criteria

- [x] Chat header **removed** or reduced to an agreed **minimal** strip; no orphaned dead space.
- [x] Every control that was in the old header is either **removed by product decision** or **reachable** elsewhere with documentation in AGENTS or in-app tooltips.
- [x] No regression to **Plan / Chat** mode wiring (**062**).
- [x] `npm run typecheck` passes.

## Related stories

- **[065](065-launch-agent-thread-context-and-model-visibility.md)** — model/context visibility.
- **[078](078-assistant-message-actions-single-row-density.md)** — per-message chrome density (different layer than column header).

## Completion bookkeeping

When done: mark **074** done in this file, update `project_tasks/README.md`, run **`npm run stories:html`**.
