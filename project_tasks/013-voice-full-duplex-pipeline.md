# 013 — Voice: capture, streaming, Grok Voice WebSocket

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` for `VoiceControls` states, mic button, and status copy.

## Summary

Replace `createVoiceSession` placeholder with a **real pipeline**: microphone capture in renderer (Web Audio `ScriptProcessor` + linear resample to 24 kHz PCM16), base64 chunks to xAI **Grok Voice** realtime WebSocket in **main** (Bearer `XAI_API_KEY`), playback of `response.output_audio.delta` PCM via `AudioContext`, status sync to `VoiceControls`.

## Scope

- Permissions: handle macOS microphone prompts; surface errors with `sonner`.
- Session lifecycle: start/stop from existing toggle; cleanup on window close.
- Use `manifest.models.voice` and `manifest.voice.*` settings.
- Respect `webSecurity` / dev vs prod implications for WebSocket URLs.

## Out of scope

- Wake word / push-to-talk UX polish (can stub PTT mode toggle).

## Acceptance criteria

- [x] Toggle starts and stops without leaking streams (verify in devtools memory/network).
- [x] Status transitions: connecting → listening → (speaking) mapped to UI.
- [x] Document env vars / API auth pattern next to **009**.

## Key files

- `src/main/voice-realtime.ts`, `main.ts`, `preload.ts`, `src/renderer/src/hooks/useVoiceSession.ts`, `VoiceControls.tsx`, `App.tsx`.
