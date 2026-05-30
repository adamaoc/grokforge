# 158 — Collapsible voice mode bar

**Status:** Done (2026-05-30).

**Priority:** UI vertical-space wave **157–159** — second story; reclaims a full **h-20** footer row in the main workspace when voice is idle.

**Design skill:** **Required** — [`.cursor/skills/styleguide-design/SKILL.md`](../../.cursor/skills/styleguide-design/SKILL.md) (`@styleguide-design`).

**Depends on:** **[013](../013-voice-full-duplex-pipeline.md)** (voice pipeline), **[113](113-voice-realtime-harness-profile-alignment.md)** (harness profile badges — display only).

## Why this story exists

[`VoiceControls`](../../src/renderer/src/components/VoiceControls.tsx) is mounted at the bottom of the center column in [`App.tsx`](../../src/renderer/src/App.tsx) as a **fixed h-20 bar** with border, large mic button, model/harness badges, status copy, and **Continue in agent chat** — **even when idle**.

Most sessions are typed agent chat. The idle voice bar permanently consumes vertical space comparable to a second toolbar, pushing terminal, editor, and chat content upward. Search and Terminal already live as **compact header pills** in [`ProjectHeader`](../../src/renderer/src/components/ProjectHeader.tsx); voice should follow the same **expand-on-demand** pattern.

**Goal:** voice stays one tap away, but **does not occupy a full row** until the user opens or starts a session.

## Goals

### 1. Collapsed by default

- When voice is **idle** (not active, not connecting, no error requiring attention), render **no full-width bar**.
- Collapsed state: **zero** or **minimal** height in the layout (no reserved h-20 gutter).

### 2. Compact control in the header chrome

- Add a **Voice** control adjacent to **Search** and **Terminal** in `ProjectHeader` (mic icon or small pill — match existing rounded-full button style).
- Tooltip: start/stop voice; show disabled state when `project.voice.defaultVoiceMode === 'off'` (same rules as today).
- Optional subtle **active** indicator (accent dot or pill tint) when a session is live but the bar is collapsed — do not rely on the old footer for “is listening” affordance alone.

### 3. Expandable voice panel

- Clicking the compact control (or starting voice from it) **expands** the full voice UI (current mic button, status text, model badges, **Continue in agent chat**, error retry).
- Panel placement options (pick one in implementation):
  - **A.** Slide-up **sheet / popover** anchored below header or above composer (preferred — no permanent row).
  - **B.** Temporarily show the existing bottom bar only while `isActive || status === 'connecting' || status === 'error'` (auto-collapse on stop).
- **Collapse** via: stop session, explicit close chevron, or Escape (if modal/sheet).
- Use existing **framer-motion** patterns where other panels animate (**141** collapsibles).

### 4. No voice behavior changes

- Reuse [`useVoiceSession`](../../src/renderer/src/hooks/useVoiceSession.ts) (or equivalent) wiring from `App.tsx` — same IPC, handoff, and transcript append paths.
- Do not change realtime WebSocket, mic capture, or **Continue in agent chat** semantics (**113**).

## Scope

- [`src/renderer/src/components/VoiceControls.tsx`](../../src/renderer/src/components/VoiceControls.tsx) — split **compact trigger** vs **expanded panel** props; support controlled `open` / `onOpenChange` if needed.
- [`src/renderer/src/components/ProjectHeader.tsx`](../../src/renderer/src/components/ProjectHeader.tsx) — new voice button + pass-through callbacks from `App`.
- [`src/renderer/src/App.tsx`](../../src/renderer/src/App.tsx) — lift voice open state; remove unconditional full-width footer mount when collapsed.
- Optional: small helper [`src/renderer/src/lib/voice-ui-state.ts`](../../src/renderer/src/lib/voice-ui-state.ts) for “should show expanded panel” derived state.

## Non-goals

- Top bar context strip (**157**).
- Editor empty state (**159**).
- Voice model routing, harness appendix text, or Settings voice defaults.
- Push-to-talk UX (**AGENTS.md** known simplification).
- macOS mic permission flow changes (**026**).

## Acceptance criteria

- [ ] Fresh project open, voice idle: center column **does not** show the full **h-20** `VoiceControls` bar.
- [ ] **Voice** control visible in header next to Search / Terminal (or documented exception if platform drag region blocks — must still be one-click reachable).
- [ ] Start voice from compact control → expanded UI shows status progression (connecting → listening → …) identical to today.
- [ ] Stop voice → UI collapses back; no stale “Voice Session Active” footer row.
- [ ] **Continue in agent chat** still available while session active (expanded panel).
- [ ] `defaultVoiceMode: off` disables control with clear tooltip; no regression vs current disabled mic.
- [ ] Expand/collapse animation feels smooth (no layout jump that loses chat scroll position).
- [ ] `npm run typecheck` passes; manual smoke: start → speak → stop → handoff once.

## Related

- **[021](../021-header-chrome-minimal-branding.md)** — header pill pattern for Search/Terminal.
- **[157](157-compact-top-bar-context-strip.md)**, **[159](159-editor-empty-state-and-global-shortcuts.md)** — sibling vertical-space stories.
- **[113](113-voice-realtime-harness-profile-alignment.md)** — voice harness badges in expanded panel only.

## Completion bookkeeping

When shipped: update **Status**, [`README.md`](../README.md) post-MVP table (add **158**), run **`npm run stories:html`**.
