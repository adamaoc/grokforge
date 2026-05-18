# 035 — Agent reliability and voice alignment checkpoint

**Status:** Done — post-034 reliability checkpoint completed. Voice now has a documented temporary adapter to shared workspace context; full transcript-driven `agent-chat` unification remains future work.

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` before changing chat, voice status, tool activity, error, or recovery UI.

## Why this story exists

GrokForge’s identity is **voice-first**, and that is a strong differentiator. But coding-agent trust comes from the text/tool loop being reliable: the agent must understand the workspace, inspect files, explain what it is doing, recover from errors, and avoid guessing. If voice gets much more product investment before that foundation is solid, the app can feel impressive but unreliable.

Story **034** shipped the first real text-agent foundation: a main-process read/search tool loop, active UI context, app-side workspace index metadata, and compact tool activity UI. Stories **057–063** now own the deeper “make the agent smarter” follow-up work.

This story is the checkpoint between those layers: confirm the text path is dependable enough, make voice align with the same agent concepts, and avoid creating a second weaker intelligence path for spoken interactions.

## Summary

Audit and harden the normal text agent path after **034**, then align voice status, transcript, and recovery behavior with that same foundation. Voice should be an input/output layer over a trustworthy agent, not a separate “magic” path with weaker grounding.

## Relationship to other stories

- Builds on **034 — Agent tool loop and workspace intelligence**.
- Complements **026 — Voice session reliability** and **027 — Read aloud**.
- Delegates deeper retrieval/indexing to **057**.
- Delegates context attachments and editor selection to **058**.
- Delegates model-requested command approvals to **059**.
- Delegates first-class edit proposal/diff review to **060**.
- Delegates agent debug traces/replay to **061**.
- Delegates real planning workflow to **062**.
- Delegates deterministic agent-loop evals to **063**.
- Should land before major voice UX expansions such as wake words, voice commands, voice-driven file edits, or hands-free multi-step execution.

## Goals

- Establish a post-034 text-agent reliability checklist that every turn should satisfy.
- Fix obvious reliability gaps found while testing the V1 read/search loop.
- Ensure voice status and transcript behavior reflect the same agent states as text where possible.
- Make agent failures recoverable and understandable.
- Avoid separate text and voice intelligence paths drifting apart.
- Add product language and UI states that honestly communicate when the agent is reading/searching/guessing/blocked.

## Non-goals

- Do not remove or de-prioritize existing voice support.
- Do not re-implement retrieval/indexing V2 here; see **057**.
- Do not implement attachments/selection context here; see **058**.
- Do not add model-command execution here; see **059**.
- Do not replace fenced write proposals with first-class edit tools here; see **060**.
- Do not build the full debug trace/replay system here; see **061**.
- Do not turn Plan mode into a structured workflow here; see **062**.
- Do not build the deterministic eval harness here; see **063**.
- Do not attempt advanced voice command grammar yet.
- Do not build always-listening behavior here.
- Do not add new provider abstractions unless required by the agent runner.

## Reliability baseline

Before deeper voice polish, the post-034 text agent should be able to:

- Know the current project roots and active root.
- See a bounded workspace index.
- Include active editor context.
- Retrieve likely relevant files before answering.
- Stream final answers reliably, including after tool use.
- Ask for clarification when context is insufficient.
- Use root-scoped read/search tools when available.
- Continue supporting existing fenced write proposals under correct absolute paths.
- Surface skipped writes and tool failures clearly.
- Recover from model/network/tool errors without corrupting the visible chat thread.
- Clear or mark stale tool activity after errors, cancellations, and timeouts.
- Preserve chat history consistently.

## Voice integration target

Voice should align with the same agent concepts as text. The ideal target is for spoken user turns to call the same `agent-chat` runner once realtime voice can hand off a stable transcript:

- User speech transcript becomes the user message.
- Voice-specific context may include “spoken turn” metadata, but not a separate prompt universe.
- Tool activity should be visible in chat even if the user is speaking.
- Assistant speech should only read the final answer or a concise status, not raw tool logs.
- If the agent needs approval for writes or future commands, voice should pause and ask for explicit confirmation through the same approval UI.

If full voice-to-`agent-chat` unification is too large for this story, implement a documented temporary adapter and make the remaining gap explicit.

## Implementation notes completed

- Text chat now cancels any active agent turn when `ChatThread` unmounts, which prevents project switches or shell remounts from leaving orphaned turns running in the main process.
- Text chat no longer persists empty assistant messages when a turn completes without streamed content.
- Agent activity cleanup from the post-034 timeout fix remains part of this checkpoint: running activity rows are marked done/stopped on done, error, cancellation, and timeout.
- Voice realtime continues to use `buildChatSystemPrompt()` as the shared workspace context source. The session instructions now include a temporary adapter note explaining that realtime voice does not yet run the text `agent-chat` tool loop.
- Voice UI now distinguishes `transcribing` in addition to connecting/listening/thinking/speaking/error, and has labels ready for future reading/searching and approval states.
- Deeper work remains delegated to **057–063**.

## UX requirements

- Text chat should clearly distinguish:
  - finding context
  - reading/searching tools
  - final answer streaming
  - cancelled/error/timeout states
- The voice bar should distinguish, at minimum:
  - listening
  - transcribing
  - thinking
  - reading/searching tools
  - waiting for approval
  - speaking
  - error/retry needed
- Voice transcript lines must remain visible in the chat thread for auditability.
- If audio fails but transcript succeeds, the user should still be able to continue by text.
- If transcript fails, show a plain-language retry state.

## Implementation notes

- Avoid duplicating context-building logic in voice modules.
- Prefer the shared `agent-chat-start` / agent runner path from **034** for text and future transcript-driven voice turns.
- Keep xAI realtime WebSocket ownership in main process.
- Keep mic capture in renderer as today.
- Do not send API keys or privileged data to renderer.
- Treat this story as an audit/hardening checkpoint, not a broad feature expansion story.

## Testing

Unit tests:

- Text agent error/cancel/timeout events leave chat state and activity state consistent.
- Voice prompt/context adapter uses the same workspace summary source as text, or explicitly documents why it cannot yet.
- Voice transcript append does not duplicate or reorder chat lines.
- Error states map to stable user-facing messages.

Integration tests:

- A text prompt that uses tools can recover from errors without corrupting chat history.
- A voice transcript that asks about a file receives the same relevant context as a text message, or the temporary gap is documented.
- Voice can recover after a failed realtime session without losing the project/chat state.

Manual QA:

- Mic denied.
- Headphones/speaker unavailable.
- Network interrupted mid-session.
- User switches projects after a voice session.

## Acceptance criteria

- [x] Post-034 text agent reliability checklist is documented and reflected in focused tests or explicit manual QA notes.
- [x] Text chat handles model/tool error, cancellation, and timeout without stale UI or corrupt history.
- [x] Voice uses the same workspace context path as text, or a clear temporary adapter documents the remaining gap.
- [x] Voice status UI communicates agent/tool state accurately.
- [x] Voice transcript remains visible and useful when audio is inaudible.
- [x] 057–063 remain the owners for deeper retrieval, attachments, commands, edit proposals, debug traces, planning, and eval harness work.
- [x] Major future voice UX work is blocked on or explicitly linked to this reliability checkpoint.
