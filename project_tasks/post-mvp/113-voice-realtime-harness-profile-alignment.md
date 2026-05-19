# 113 — Voice realtime harness profile alignment

**Status:** Done (2026-05-19).

**Design skill:** N/A (voice instructions in main); optional copy in `VoiceControls` / handoff.

**Depends on:** **[103](103-agent-harness-per-model-profiles.md)**.

## Why this story exists

Voice uses **`voice-realtime.ts`** with its own instructions — **not** the text agent harness. Users experience a **split brain**: voice cannot call tools; handoff must compensate (**077**, **091**).

Minimum fix: voice session instructions and handoff text **align** with the active **harness profile** philosophy (proactive, no path begging, clear handoff to text agent).

Stretch (explicit non-goal for v1 of this story): voice driving `agent-chat-start` directly.

## Goals

### 1. Voice instructions from profile

- Map `getModelForIntent(manifest, 'voice')` → `resolveHarnessProfileKey` → voice-specific appendix in `voice-realtime.ts` (may differ from text profiles).
- Shared constants in `src/shared/agent-harness-profile.ts` for cross-surface rules (explore before ask, handoff honesty).

### 2. Handoff payload

- **`buildVoiceHandoffUserText`** includes: user intent, voice model/profile id, “text agent will use tools”.
- Thread summary hydration (**077**) capped; document limits.

### 3. Documentation

- `AGENTS.md` voice section: voice = I/O layer; text agent = tool harness.

## Non-goals

- Full tool loop inside WebSocket realtime.
- Dual voice models experiment (unless manifest already supports).

## Acceptance criteria

- [x] Voice session update uses profile-derived instruction block.
- [x] Handoff text consistent with **091** rules.
- [x] `npm run typecheck` passes.

## Related stories

- **[013](../013-voice-full-duplex-pipeline.md)**, **[077](../077-voice-agent-chat-ui-polish.md)**, **[091](091-agent-proactive-workspace-exploration.md)**.

## Completion bookkeeping

Marked **113** done; synced [`README.md`](../README.md) post-MVP table; ran **`npm run stories:html`**.
