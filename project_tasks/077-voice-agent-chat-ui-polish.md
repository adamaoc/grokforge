# 077 — Voice agent chat: UI polish, handoff, and thread continuity

**Status:** Done (v1: coalesced voice user bubble, “Continue in agent chat” handoff + auto-stop voice, thread summary into voice session start, typecheck).

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` before changing voice controls, status text, chat integration, or handoff surfaces (`@styleguide-design`).

## Shipped (v1)

- **`useVoiceSession` / `voice-user-draft-bus`:** Coalesced in-thread user voice line + stable id; `stop()` for handoff; optional `getThreadSummaryForVoice` passed into `voiceSessionStart`.
- **`ChatThread` / `App`:** Draft bubble overlay, `voiceThreadSummaryRef`, registered handoff → stop voice then `agent-chat-start` with `buildVoiceAgentHandoffUserText`.
- **`VoiceControls`:** “Continue in agent chat” control when voice is enabled.
- **Main / shared:** `VoiceSessionStartPayload` + `threadSummary` into `voice-realtime` session update for continuity.

## Why this story exists

Voice for the agent (**013**, **026**) and **read aloud** (**027**) shipped with reliability-focused engineering. The **combined UX** in the chat surface—mic state, connection status, transcripts, errors, overlap with text composer, and overlap with **agent chat** (**034**)—still feels **rough** compared to the rest of GrokForge.

This story is the **single umbrella** for voice-in-chat work: **chrome and density**, **transcript presentation**, **voice ↔ text agent handoff**, and **thread continuity** so users can move between voice (discovery / conversation) and regular agent chat (implementation with tools) without dead ends or contradictory UI (e.g. voice strip “stuck” while Chat mode is active).

## Product direction (locked for this story)

1. **Roles:** **Voice** = research, exploration, and verbal reasoning; **text agent chat** = implementation details, file reads, tools, and edits. The app should make that split **obvious** and **easy to cross**.
2. **Handoff:** Voice should be able to **continue the same persisted thread** by **sending work into the regular agent chat path** (e.g. kick `agent-chat-start` with an explicit payload, or prefill + one action—pick one flow and document it). User can turn voice off and use chat; turning voice back on should **resume in context** of the same thread where feasible.
3. **Auto-stop voice:** When a handoff to agent chat **succeeds**, **stop the voice session** and collapse voice chrome; focus/scroll should land on the new or pending text turn. If handoff fails, do **not** silently stop voice—surface error once.
4. **Partial user speech:** Prefer **one in-progress user bubble** whose text **updates in place** across partial ASR commits, then **finalize** on end-of-turn (VAD / session events)—not three separate bubbles for three partials.

## Goals

1. **Coherent chrome:** One clear **voice status** region (idle / connecting / listening / thinking / speaking / error / handing off) with consistent iconography and color tokens (`--gf-accent`, semantic states). Voice chrome must not contradict **Chat vs Plan** / composer mode.
2. **Chat integration:** Voice transcripts in the thread match **message spacing**, typography, and **read aloud** controls without visual clutter; **voice vs text** turns remain visually distinct (**065** alignment) without noise.
3. **Handoff to agent chat:** A defined, reliable path from voice context into **`agent-chat-start`** (or equivalent), including optional **injected workspace context** (active root, active file, short summary—same family as agent chat, capped). **Honest copy** when the voice path cannot do tool/file work itself.
4. **Thread continuity:** Starting voice after text (and vice versa) uses the **same thread**; starting voice should **hydrate** realtime context from **recent persisted messages** within API/size limits (document *k* and stripping rules).
5. **Transcript coalescing:** Partial user transcripts **update a single bubble** until turn end; assistant voice can follow the same pattern if partials exist.
6. **Errors:** Mic denied, WebSocket failures, handoff failures, and timeouts use **actionable** inline or toast copy; avoid duplicate toasts from `useVoiceSession` + `ChatThread`.
7. **Density:** Avoid tall fixed panels; prefer **collapsible** details or **compact** strip when voice is idle/off.

## Scope

### Renderer (primary)

- **`src/renderer/src/hooks/useVoiceSession.ts`** — status + events needed for chrome, coalescing, and handoff triggers without leaking unnecessary internals.
- **`ChatThread.tsx`** and voice-related subcomponents — layout, labels, **single-bubble partial updates**, handoff affordances (confirm vs auto—see Open questions), scroll/focus after handoff.
- **`App.tsx`** (or thin coordinator) — wiring between voice session stop, `agent-chat-start`, and composer focus when handoff fires.

### Main / shared (only as needed)

- **`voice-realtime.ts`** / IPC — **minimal** changes if required to pass **conversation history** into a new realtime session or to receive clearer end-of-user-turn signals for coalescing finalization. Prefer **renderer-owned** coalescing first; extend main only when blocked.

### Non-goals

- Rewriting the **xAI realtime** protocol or replacing the WebSocket stack.
- Full **parity** of every agent tool inside the voice model (handoff is the supported path for heavy tool use).

## Open questions (resolve during implementation)

- **Handoff trigger:** Fully automatic after user confirms in voice vs **always** require a **“Run in agent chat”** button for the first MVP of handoff? (Auto is faster; button is safer against mis-sent text.)
- **History cap:** Max messages or tokens to inject when starting voice from an existing thread?
- **Assistant partials:** Does the realtime API expose partial assistant text in a way that maps to one bubble, or only user side for v1?

## Relationship to prior stories

- **[026 — Voice session reliability](026-voice-session-reliability.md)** — mic, transcripts, correctness baseline (done).
- **[027 — Read aloud](027-read-aloud-agent-chat-responses.md)** — TTS playback (done).
- **[034 — Agent tool loop](034-agent-tool-loop-and-workspace-intelligence.md)** — target path for implementation work after handoff.
- **[065 — Agent thread context](065-launch-agent-thread-context-and-model-visibility.md)** — keep voice vs text chrome and context strips consistent.

## UX direction

- Align with **styleguide-design**: motion subtle, focus visible, `aria-live` for status changes.
- **Dark theme** contrast for recording state (avoid “angry red” for normal listening).
- After handoff, user should never wonder **which mode is active** or whether **edits will run**.

## Testing

- Manual: macOS mic deny / allow paths; Windows spot-check if available.
- Manual: start voice → partial speech → **one** user bubble updates → end turn → finalized line persists correctly after reload.
- Manual: start voice → hand off to agent chat → voice **stops**, chrome collapses, **agent turn** runs (or clear error).
- Manual: text-only agent turn → start voice → assistant **uses prior thread context** within documented limits.
- Manual: start voice → send text → stop voice; no stuck **disabled** states.
- **`npm run typecheck`**.

## Acceptance criteria

- [x] Voice controls and statuses are **visually consistent** with GrokForge chat UI and **do not contradict** text chat mode.
- [x] Users can infer **what the app is doing** (including **handing off**) without reading logs.
- [x] **Partial user voice** is shown as **one bubble** updating in place until end-of-turn, then finalized (no “eager” stack of near-duplicate user bubbles for one utterance).
- [x] **Handoff** to regular agent chat is **implemented and reliable** (define trigger: auto after success path and/or explicit control); on success, **voice session stops** and UI reflects idle/closed voice.
- [x] **Voice restart** after text uses **thread history** into the voice session per documented limits.
- [x] Transcript lines do not **fight** markdown messages for hierarchy (headings, spacing).
- [x] `npm run typecheck` passes.

## Related stories

- **[074](074-chat-header-removal-or-relocation.md)** — voice buttons may move with header refactor.
- **[078](078-assistant-message-actions-single-row-density.md)** — read aloud control alignment.

## Completion bookkeeping

When done: mark **077** done in this file, update `project_tasks/README.md`, run **`npm run stories:html`**.
