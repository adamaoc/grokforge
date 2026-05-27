# 141 — Conversation-first chat layout and tool activity shell

**Status:** Done (2026-05-27).

**Priority:** **Highest** among UI/UX stories **141–143** — three Todo app screen recordings (Plan → Execute → Work follow-ups, including localStorage and remove-button edits) showed the chat column feeling **cramped and tool-heavy**: the **“Work · tools” / “Plan · tools”** block plus step list consumes large vertical space, pushing **messages and the composer** down during long or imperfect agent runs. **[125](125-agent-turn-activity-clarity-and-chat-vertical-space.md)** improved spinner honesty, density, and scroll-to-error — but the activity feed still reads as **primary** rather than **secondary** to the conversation.

**Design skill:** **Required** — [`.cursor/skills/styleguide-design/SKILL.md`](../../.cursor/skills/styleguide-design/SKILL.md) (`@styleguide-design`) for layout, motion, collapsible patterns, and dark zinc aesthetic.

## Why this story exists

| Observed (Todo videos) | Current UI |
|------------------------|------------|
| Many **Work tool round** rows during iterative Work | [`AgentTurnToolActivityList`](../../src/renderer/src/components/AgentTurnToolActivityList.tsx) expands when live + ≥3 steps or errors (**125**) |
| User scrolls past tools to read assistant text | Activity block sits **above** streaming assistant content in [`ChatThread`](../../src/renderer/src/components/ChatThread.tsx) |
| Failed runs feel endless | Expanded list shows every round; middle collapse helps live only |
| Conversation-first goal | Section title **“Work · tools”** frames tools as the main artifact |

**119** compacted duplicate S&R rows; **125** tightened padding and error summary — **141** changes **information architecture**: tools are **supporting detail**, chat is **hero**.

## Goals

### 1. Default collapsed / auto-collapse lifecycle

- **While live:** collapsed **summary strip** by default — one line: status + step count + optional error chip (expand to see steps).
- **Auto-expand** only when: user expands, **new error** on live turn, or user preference `grokforge.chat.activityAlwaysExpand` (Settings optional, default off).
- **On turn `done` / `error` / `cancelled`:** auto-**collapse** within ~300ms (respect user manual expand during live).
- Persist last user choice per session in `sessionStorage` optional; default **collapsed** for completed turns in history.

### 2. Compact summary strip (conversation-first)

Replace dominant header copy (coordinate **[142](142-ui-copy-and-status-hierarchy-cleanup.md)** for final strings):

- Live: **“Working…”** + `N steps` + subtle accent pulse (not full panel border stack).
- Done: **“Finished”** or **“Needs attention”** (errors) — chevron to expand.
- **Max height** when expanded: e.g. `max-h-[min(40vh,280px)]` with **internal scroll** so transcript + composer keep space.
- Move **scope line** (`Scope · root · file`) inside expanded body only.

### 3. Progressive disclosure patterns

Pick **one** primary pattern in PR (spike both if cheap):

| Pattern | Notes |
|---------|--------|
| **A. Inline collapsible** (evolution of current list) | Lowest risk; default collapsed + internal scroll |
| **B. Bottom sheet / drawer** | “View steps (N)” opens overlay; chat thread unaffected — best for long runs |

Non-regressive: proposal cards, plan cards, and command approval cards stay **inline** in thread (not in drawer).

### 4. Chat column breathing room

- Reduce vertical gap between assistant messages and tool strip (`mb-1.5` audit in `ChatThread`).
- Ensure **composer** remains visible: `min-h-0` flex chain on chat column; optional `sticky` composer footer within chat panel.
- Live turn: **pin scroll** to proposal/error (**125** behavior preserved) without expanding activity panel height.

### 5. Grouped timeline (optional within 141)

- Roll consecutive **read_file** on same path into one row: “Read `script.js` ×2”.
- Keep **119** S&R rollup; extend to **Work tool round** wrappers if rounds are surfaced as parent rows.

## Scope

- [`src/renderer/src/components/AgentTurnToolActivityList.tsx`](../../src/renderer/src/components/AgentTurnToolActivityList.tsx) — collapse lifecycle, max-height, summary strip
- [`src/renderer/src/components/ChatThread.tsx`](../../src/renderer/src/components/ChatThread.tsx) — placement, scroll, `defaultExpanded` / `forceExpanded` policy, composer layout
- [`src/shared/agent-activity-display.ts`](../../src/shared/agent-activity-display.ts) — summary title helpers (strings coordinated with **142**)
- [`src/renderer/src/lib/chat-activity-panel-prefs.ts`](../../src/renderer/src/lib/chat-activity-panel-prefs.ts) *(new, optional)* — localStorage/session prefs
- [`src/renderer/src/components/ui/sheet.tsx`](../../src/renderer/src/components/ui/sheet.tsx) — only if pattern B
- Manual: three Todo flows in recordings — Plan execute, Work localStorage, Work remove button

## Non-goals

- Changing harness tool loop or activity **payload** shape from main (renderer-only unless new summary fields needed).
- Removing tool activity entirely (users still need errors and command approval visibility).
- Light theme or layout redesign of sidebar / editor split.
- Copy pass (**142**) — use placeholder strings if needed, finalize in **142**.

## Risks

| Risk | Mitigation |
|------|------------|
| **Users miss errors when collapsed** | Error chip on summary; auto-expand on error; amber summary border |
| **Regression on plan execute progress** | Keep step X of Y inside expanded section |
| **Drawer hides approval cards** | Command approval stays inline in `ChatThread`, not in drawer |

## Dependencies

- **Builds on:** **[125](125-agent-turn-activity-clarity-and-chat-vertical-space.md)** **(done)**, **[119](119-agent-turn-ui-honesty-and-activity-compaction.md)** **(done)**, **[093](../093-agent-tool-activity-in-chat-thread.md)**.
- **Complements:** **[142](142-ui-copy-and-status-hierarchy-cleanup.md)** (labels on summary strip).
- **Independent of:** harness stories **135–140**.

## Acceptance criteria

### Layout & lifecycle

- [x] **Manual (Todo Plan execute):** During live run, activity summary ≤ **one line** of vertical space until user expands; assistant streaming text visible without scrolling past full step list.
- [x] **Manual (Todo Work, many tool rounds):** Expanded list scrolls internally; composer remains on screen at common window sizes (1280×800, 1440×900).
- [x] **Manual:** Turn completes → activity panel collapses to summary (unless user pinned expand).
- [x] **Manual:** Live turn with tool error → summary shows issue count; expanding shows failed row without hunting.

### Regression

- [x] Command approval card and `edit_proposal` diff card still visible without opening activity drawer.
- [x] **125** scroll-to-proposal on validation failure still works.
- [x] Subagent block (`SubagentActivityBlock`) layout consistent with new activity shell.

### Quality

- [x] `npm run typecheck` passes; unit tests for collapse policy helper if extracted.
- [x] No new `emerald-*` Tailwind; accent tokens only per styleguide.

## Related

- **[125](125-agent-turn-activity-clarity-and-chat-vertical-space.md)**
- **[119](119-agent-turn-ui-honesty-and-activity-compaction.md)**
- **[130](130-work-iterative-edit-harness.md)** — many tool rounds in Work mode (harness; UI must stay calm)
- Dogfood: three Todo app screen recordings (Plan + Work)

## Completion bookkeeping

When shipped: update **Status**, [`README.md`](../README.md) post-MVP table, [`docs/harness-roadmap.md`](../../docs/harness-roadmap.md) if UX wave indexed, run **`npm run stories:html`**.
