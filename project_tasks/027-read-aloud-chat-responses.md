# 027 — Read aloud: Grok agent chat responses

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` for chat message actions and playback controls.

## Summary

Add a feature to **read back** (text-to-speech) **assistant / agent messages** in the chat thread—e.g. per-message **“Read aloud”** control and optional stop. Example from the Grok app: below the response, action icons including **copy** and **speaker**; this story ships **copy + read aloud/stop** on assistant bubbles.

## Implementation decision

**xAI REST TTS (POST `/v1/tts`)** in the **Electron main** process with **`Authorization: Bearer`** (same env as chat). The renderer invokes **`tts-read-aloud`** IPC with `{ text, voiceId }`, receives **base64 audio + MIME type**, and plays via **`Audio` + blob URL**. **Not** Web Speech API — avoids OS-dependent voices and keeps Grok-aligned output.

- **Voice:** `manifest.voice.customVoiceId` when set, otherwise **`eve`**.
- **Interrupt:** Starting read-aloud on another message stops the current playback; clicking **stop** (square icon) on the playing row stops without reloading.
- **Markdown:** Light stripping before TTS and copy (headings, bold, links, code fences).
- **Long text:** Truncated at **15,000** characters with a toast (xAI limit).

## Scope

- UX: **Assistant messages only** (excludes synthetic **`welcome`**). User messages are out of scope for this story.
- Optional env: **`GROKFORGE_XAI_TTS_URL`** (see `.env.example`).

## Manual QA

- With **`XAI_API_KEY`** set: open project → send chat → on an assistant reply, **Read aloud** plays audio; **Stop** ends playback.
- Without API key: toast explains missing env (same family as chat).
- **Copy** puts stripped plain text on the clipboard.
- Very long assistant text (>15k chars): toast mentions truncation, audio matches truncated portion.

## Acceptance criteria

- [x] User can trigger read-aloud on at least one assistant message and hear the content.
- [x] User can stop playback without reloading the app.
- [x] Feature degrades clearly where TTS is unsupported.

## Key files

- [`src/main/tts-read-aloud.ts`](../src/main/tts-read-aloud.ts), [`src/main/main.ts`](../src/main/main.ts) — IPC handler.
- [`src/shared/tts-read-aloud-contract.ts`](../src/shared/tts-read-aloud-contract.ts) — limits and types.
- [`src/preload/preload.ts`](../src/preload/preload.ts) — `readAloud`.
- [`src/renderer/src/hooks/useReadAloud.ts`](../src/renderer/src/hooks/useReadAloud.ts), [`src/renderer/src/components/ChatThread.tsx`](../src/renderer/src/components/ChatThread.tsx).

## Notes

- Distinct from **026** realtime voice agent; this is **playback of text chat**.
- Out of scope: share / like / dislike / regenerate row items from the reference screenshot.

## Completion bookkeeping

When this story ships: update its **Status** line, the progress table in [`README.md`](README.md), and run **`npm run stories:html`** at the repo root so [`stories.html`](stories.html) stays in sync.
