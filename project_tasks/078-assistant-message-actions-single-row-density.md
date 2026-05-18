# 078 — Assistant message actions: single-row density

**Status:** Done (v1: single-row footer + truncation + 40px actions).

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` before changing message list items, icon buttons, or typography (`@styleguide-design`).

## Why this story exists

Assistant messages show **Copy**, **Read aloud**, and a **model-used** note. Today these can occupy **multiple lines** and extra vertical gap, making dense threads harder to scan. The goal is to keep them **on one row** when width allows, with a **tight** fallback on narrow columns.

## Shipped (v1)

- **`ChatThread.tsx`:** Copy + Read aloud + optional **voice mic** + **`ModelBadge`** (pill) share **one** `flex-nowrap` row below the body (`mt-2 pt-1.5`, tighter than prior `mt-3 pt-2`).
- **Narrow columns:** Row does not wrap; the model segment uses **`flex-1 min-w-0 overflow-hidden`** so the badge **truncates**; full id remains on **`title`** / badge `title`.
- **Touch / a11y:** Action buttons use **`h-10 w-10`** (40px). Read aloud sets **`aria-busy`** while loading.

## Goals

1. **Primary layout:** Copy + Read aloud + model label on **one horizontal row** below the message body (or inline end-aligned per styleguide).
2. **Narrow screens:** collapse to **icon-only** buttons with tooltips and **truncate** model id with ellipsis + tooltip full string.
3. **Vertical rhythm:** reduce margin between message content and action row without hurting touch targets (min 40px hit area where applicable).

## Scope

### Renderer

- **`ChatThread.tsx`** (assistant message footer / `Message` row): flex layout, `gap`, `flex-wrap` strategy, `min-w-0` for truncation.
- **Model string:** may duplicate **065** work—if **065** introduces a shared **“model badge”** component, **consume** it here instead of ad hoc text.

## UX direction

- Icons: `lucide-react` sizes consistent with file tree / header.
- **Read aloud** loading state should not wrap the row alone; use spinner inside button or `aria-busy` on button.

## Testing

- Manual: narrow chat column (~280px usable) — controls remain usable.
- **`npm run typecheck`**.

## Acceptance criteria

- [x] At **typical** chat widths, **Copy**, **Read aloud**, and **model** attribution fit on **one line** without overlapping message text.
- [x] At **narrow** widths, layout degrades gracefully (icons + tooltips or stacked **only** when necessary—document behavior).
- [x] Vertical spacing between message body and controls is **not larger** than before unless required for a11y (document if so).
- [x] `npm run typecheck` passes.

## Related stories

- **[065](065-launch-agent-thread-context-and-model-visibility.md)** — authoritative model display decisions.
- **[077](077-voice-agent-chat-ui-polish.md)** — voice status near same chrome.

## Completion bookkeeping

When done: mark **078** done in this file, update `project_tasks/README.md`, run **`npm run stories:html`**.
