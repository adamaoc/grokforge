# 071 — Chat thread scroll restore per project

**Status:** Done (v1: bottom on thread hydration per `projectId`; durable offset restore deferred).

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` before changing `ChatThread` scroll containers, list virtualization, or motion (`@styleguide-design`).

## Why this story exists

When reopening a project, the chat thread **scrolls to the top** (or default scroll origin). Users expect to land **where they left off**—almost always **near the bottom** for an active conversation—so they can continue reading and composing without manual scrolling.

## Goals

1. **Restore scroll position** when `ChatThread` mounts for a known `projectId`, preferring **bottom-anchored** behavior for active threads.
2. **Persist** enough state across sessions that a full app restart still restores a sensible position (optional v1: session-only; v2: durable `localStorage`).
3. **Avoid jank:** restoration should run after messages are measured / laid out (images, markdown, code blocks) without visible “jump” where possible.

## Scope

### Renderer

- **`src/renderer/src/components/ChatThread.tsx`**: identify the scrollable region (likely the messages list `overflow-y-auto` wrapper).
- On **`projectId`** + **`messages`** hydration from disk: compute target scroll.
- Storage key pattern (example): `grokforge.chatScroll.v1:<projectId>` storing either:
  - **Scroll offset** from bottom (preferred for growth), or
  - **Last visible message id** + offset within node, or
  - **Ratio** `scrollTop / (scrollHeight - clientHeight)` with clamping on restore.

### Edge cases

- **New project** with no history: start at bottom (or welcome), not “restored” garbage.
- **Thread shorter than viewport:** scroll position clamps to `0`.
- **Streaming in progress:** while user is at bottom, keep **stick-to-bottom**; if user scrolls up, do not force-pull down until they click “jump to latest” (optional; can defer).
- **Plan cards / tall messages:** restore after `requestAnimationFrame` or `ResizeObserver` if needed.

## UX direction

- Default for returning users: **bottom-aligned** view of the latest messages.
- If implementing “stick to bottom” only: document that scroll restore is **implicit** via always scrolling to end on open (acceptable v1 if paired with clear product intent).

## Testing

- Manual: long thread → scroll mid → switch project → return → position restored.
- Manual: close app → reopen → position restored if durable storage is in scope.
- **`npm run typecheck`**.

## Acceptance criteria

- [x] Opening a project with an existing thread does **not** always reset scroll to the top; user sees **near-prior** position or **bottom** per agreed rule.
- [x] Restoration is keyed by **`projectId`** (not display name).
- [x] No infinite scroll loops or layout thrash on restore.
- [x] `npm run typecheck` passes.

## Related stories

- **[070](070-background-agent-chat-and-dashboard-activity.md)** — remounting / streaming lifecycle may interact with when scroll runs.
- **[072](072-chat-composer-auto-grow-and-word-wrap.md)** — composer height changes can alter scroll metrics.

## Implemented (v1)

- **`ChatThread.tsx`:** `ref` on the main `overflow-y-auto` messages scroller; **`useLayoutEffect`** depends on **`projectId`** and **`messages === null`** so it runs once when the persisted thread first becomes available (not on every streaming `messages` update). Scroll uses **`scrollTop = scrollHeight - clientHeight`** plus extra **`requestAnimationFrame`** passes and a short **`setTimeout`** so markdown / layout can settle without sticking at scroll origin.

## Completion bookkeeping

When done: mark **071** done in this file, update `project_tasks/README.md`, run **`npm run stories:html`**.
