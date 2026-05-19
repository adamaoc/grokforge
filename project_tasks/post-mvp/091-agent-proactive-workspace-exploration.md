# 091 — Agent proactivity: explore workspace before asking

**Status:** Done (2026-05-18).

**Design skill:** N/A (prompts + agent loop); minor chat copy if surfacing “searched workspace” activity.

## Why this story exists

Users report the agent (especially after **voice** handoff) replies with **“tell me the exact file path”** instead of using `search_workspace`, `list_directory`, or `read_file`. That feels like a chatbot, not a coding buddy. Voice realtime **does not run the tool loop** ([`voice-realtime.ts`](../../src/main/voice-realtime.ts)); proactivity must land in **text agent** prompts, handoff text, and tool-use bias.

## Goals

### Text agent (`agent-context.ts`, `agent-runner.ts`)

- Explicit system instructions:
  - When the user names a page, feature, or area (“admin page”, “dashboard widget”), **proactively** `search_workspace` and/or `list_directory` + `read_file`—do **not** ask for a path unless search is ambiguous.
  - Prefer **acting with tools** over clarifying questions; ask only when multiple equally likely targets exist.
- Encourage **early** `search_workspace` on edit/intent turns (coordinate with **082** read-before-write).

### Voice path (`voice-realtime.ts`, handoff builders)

- Voice instructions: do **not** tell the user to paste paths; explain that **typed agent chat** will locate files via tools.
- **`buildVoiceAgentHandoffUserText`** (or successor): include user intent + nudge for the text agent to search roots before replying.

### Optional loop tweak

- If user message matches edit/feature intent and no tools ran yet, soft system nudge before final answer (evaluate cost/latency).

## Testing

- Extend **063** evaluation cases: “update admin page” without path → expect `search_workspace` or `read_file` in trace, not path-only reply.
- Manual voice → Continue in agent chat → agent searches without path prompt.

## Acceptance criteria

- [ ] Prompt + handoff text include proactive exploration rules above.
- [ ] At least one automated or fixture test documents expected tool-first behavior.
- [ ] `npm run typecheck` passes.

## Related stories

- **[077](../077-voice-agent-chat-ui-polish.md)**, **[034](../034-agent-tool-loop-and-workspace-intelligence.md)**.
- **[082](082-agent-edit-require-read-before-write.md)** — reads after find.
- **[093](093-agent-tool-activity-in-chat-thread.md)** — visibility when tools run.

## Completion bookkeeping

When implemented: mark **091** done, update [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
