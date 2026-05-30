# 157 — Compact top bar: remove redundant context strip

**Status:** Done (2026-05-30).

**Priority:** UI vertical-space wave **157–159** — first of three narrow renderer stories that reclaim persistent chrome without removing capabilities.

**Design skill:** **Required** — [`.cursor/skills/styleguide-design/SKILL.md`](../../.cursor/skills/styleguide-design/SKILL.md) (`@styleguide-design`).

**Depends on:** **[021](../021-header-chrome-minimal-branding.md)** (project header), **[141](141-conversation-first-chat-and-tool-activity-shell.md)** / **[142](142-ui-copy-and-status-hierarchy-cleanup.md)** (chat hierarchy — do not reintroduce duplicate status lines).

## Why this story exists

GrokForge’s workspace chrome stacks **three layers** of overlapping context before the user reaches chat or files:

| Layer | Location | Redundant with |
|-------|----------|----------------|
| Project name + active root pill | [`ProjectHeader`](../../src/renderer/src/components/ProjectHeader.tsx) | Sidebar root selector + file tree |
| **“Next send”** row (model intent, resolved id, conversation mode) | [`ChatLiveContextStrip`](../../src/renderer/src/components/ChatTurnContextUi.tsx) in [`ChatThread`](../../src/renderer/src/components/ChatThread.tsx) | Composer **Fast / planning** chip, Work/Plan mode toggle, `turn_started.routing` badges on live turns |
| **Roots** + **Active root** + file/pinned lines | Same `ChatLiveContextStrip` | Header active-root pill, sidebar roots, per-turn **Details** dropdown on assistant messages |

The sticky strip alone is ~**two text rows** plus borders (`py-2.5`, `border-b`, inner `mt-2` / `pt-2` divider). That space is better spent on transcript and composer — especially after **141** made chat the hero column.

**Goal:** noticeably shorter top area; less harness-debugger noise; **no loss of control** over model intent, mode, or root context.

## Goals

### 1. Remove the prominent “Next send” strip

- Delete or stop rendering the full **`ChatLiveContextStrip`** block at the top of the chat scroll region (the row labeled **“Next send”** with intent badge, human label, resolved model id, and **Conversation:** chip).
- **Keep** composer controls as the sole pre-send surface:
  - Work / Plan mode toggle
  - Fast vs planning model chip group
  - Temperament / attachments as today
- **Keep** per-turn routing visibility on **live** turns via existing `turn_started.routing` badges and assistant **Details** footer — do not duplicate a third “next model” line.

### 2. De-emphasize or remove Roots / Active root from the chat header area

- Remove the **Roots** list and **Active root / File / Pinned** rows from `ChatLiveContextStrip` (component may be deleted or reduced to zero height).
- **Do not** remove root switching from the sidebar or the header’s compact active-root pill unless product review finds the pill fully redundant (default: **keep header pill**, drop chat duplicate).
- Optional minimal tweak: if the header active-root pill feels heavy next to a shorter chat column, reduce to **icon + truncated label** only — stay within header file, no sidebar refactor.

### 3. Preserve debugging / power-user paths

- **Turn context** for completed messages stays in **`AssistantMessageContextFooter`** → **Details** dropdown (`TurnContextDetailsBody`).
- **Agent activity** scope lines remain inside expanded tool activity (**141**), not resurrected as a sticky strip.
- No change to main-process routing (`resolveAgentTurnRouting`) — renderer hint fields on send stay as today.

## Scope

- [`src/renderer/src/components/ChatTurnContextUi.tsx`](../../src/renderer/src/components/ChatTurnContextUi.tsx) — remove or gut `ChatLiveContextStrip`; keep `AssistantMessageContextFooter`, `AgentActivityTurnContextBanner`, details helpers.
- [`src/renderer/src/components/ChatThread.tsx`](../../src/renderer/src/components/ChatThread.tsx) — stop mounting the sticky strip; verify composer-only model/mode UX.
- [`src/renderer/src/components/ProjectHeader.tsx`](../../src/renderer/src/components/ProjectHeader.tsx) — **optional** minor de-emphasis of active-root pill (only if needed for visual balance).
- Tests: any component tests referencing `ChatLiveContextStrip`; grep `Next send` / `ChatLiveContextStrip` in renderer.

## Non-goals

- Voice bar collapse (**158**).
- Editor empty state or shortcuts (**159**).
- Composer redesign, Settings model pickers, or manifest routing changes.
- Removing sidebar root list or file tree.
- Changing copy matrix from **142** (except deleting redundant strip strings).

## Acceptance criteria

- [ ] With a project open, the chat column no longer shows a sticky **“Next send”** row above the message list.
- [ ] User can still choose **Work / Plan**, **Fast / planning** model intent, and send turns with the same behavior as before (manual smoke: one fast turn + one plan turn).
- [ ] **Roots** and **Active root** lines are not shown in the chat header strip; active root remains discoverable via **header pill** and/or **sidebar** (at least one of these).
- [ ] Per-turn model/routing context remains available on assistant messages (**Details**) and on live turns (`turn_started.routing` badge).
- [ ] Measured or visually obvious: chat transcript starts **≥1 row higher** than before (strip + divider removed).
- [ ] `npm run typecheck` passes; no user-visible **“Next send”** string in chat chrome (`rg "Next send" src/renderer`).

## Related

- **[141](141-conversation-first-chat-and-tool-activity-shell.md)**, **[142](142-ui-copy-and-status-hierarchy-cleanup.md)**, **[125](125-agent-turn-activity-clarity-and-chat-vertical-space.md)** — prior chat vertical-space work; **157** targets **persistent** strip noise, not tool activity.
- **[158](158-collapsible-voice-mode-bar.md)**, **[159](159-editor-empty-state-and-global-shortcuts.md)** — sibling UI-space stories (independent shippable order).

## Completion bookkeeping

When shipped: update **Status**, [`README.md`](../README.md) post-MVP table (add **157**), run **`npm run stories:html`**.
