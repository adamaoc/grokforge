# 026 — Voice session reliability & verification

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` for voice controls, status, and error toasts.

## Summary

**Voice** does not appear to work reliably in manual testing. Re-verify the full path: renderer **mic capture** → IPC **`voice-audio-chunk`** → main **`voice-realtime.ts`** WebSocket ↔ xAI; playback of assistant audio back to renderer. Fix regressions, add **visible connection/session state**, and surface **actionable errors** (missing key, permission denied, socket closed).

## Scope

- Reproduce on macOS (and note Windows if applicable): session start/stop, first chunk, server VAD turn boundaries.
- Log dev-only breadcrumbs where helpful; user-facing: toasts or inline status (not noisy).
- Confirm env key / model id resolution matches **012** / manifest `models.voice`.
- Add or extend **manual test checklist** in story or `e2e/` notes (full E2E mic may stay manual).

## Manual QA (story 026)

- **Dev** (`npm run dev`): first open may trigger the macOS mic prompt; if denied, expect the **Not allowed** toast with System Settings guidance; if allowed, status should reach **Listening** within a few seconds of a successful `session.updated`.
- **Missing key:** Unset `XAI_API_KEY` / `GROKFORGE_XAI_API_KEY` → start voice → inline **error** state and toast reference the env var.
- **Stability:** 60+ second session, several turns, no long dropouts in capture (AudioWorklet path).
- **`speakResponses: false`:** In `.grokproject.json`, set `voice.speakResponses` to `false` → no assistant TTS, but **transcripts** still land in the chat thread; dev console logs the one-shot breadcrumb in dev.
- **Bad `models.voice`:** Set an invalid model id → server `error` event should show **code/message** in toast and **error** state with **tap to retry**.
- **`voice.defaultVoiceMode: off`:** Mic control disabled; tooltip explains project setting.
- **Production build:** `npm run build && npm run start` — repeat cold-start and mic-allow path on built artifacts.

## Acceptance criteria

- [x] With valid `XAI_API_KEY` / `GROKFORGE_XAI_API_KEY` and mic permission, a smoke path works: start voice → user speech → audible or visible assistant response (per current product contract).
- [x] Failure modes show clear UI (not silent).
- [x] Document any **platform limits** (e.g. sandbox, headset) in `AGENTS.md` or this story.

## Key files

- `src/main/voice-realtime.ts`, `src/main/main.ts` (IPC), preload, renderer voice components/hooks.

## Notes

- **013** shipped the pipeline; this story is **hardening + QA** from real-world feedback.
