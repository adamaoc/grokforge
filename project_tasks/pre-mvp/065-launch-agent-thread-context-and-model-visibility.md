# 065 — Launch polish: agent thread context and model visibility

**Status:** **Done** (v1: sticky next-send strip, per-message `turnContext` + Details, voice chrome, activity banner; persisted in `thread.jsonl` via `turnContext` on `PersistedChatLineV1`.)

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` before changing chat thread, agent activity, context badges, or message metadata UI.

## Why this story exists

GrokForge’s launch story depends on users understanding that the agent sees more than one folder. The video feedback called out multi-root context as the “wow” moment, but the agent thread should make that context visible during normal use too.

This story adds clearer active model and root-context visibility to the agent thread without cluttering every message.

## Goals

- Show which model or intent is active for the current agent turn.
- Show the active root and broader project context in a way users can trust.
- Make multi-root context visible during chat, especially when the active file/root changes.
- Avoid exposing implementation details or large debug payloads in the primary chat UI.

## Scope

- Agent thread header, turn metadata, compact activity rows, or message chrome.
- Active root and model/intent display for normal chat turns.
- Optional tooltip/popover for more context details.
- Any needed DTO wiring from renderer state that already exists in `agent-chat-start`.

## UX direction

- Prefer small badges or a compact context strip over verbose per-message labels.
- Show enough information to answer “what is the agent looking at?” at a glance.
- Keep detailed retrieval/debug information for story **039** / **061** surfaces.
- Ensure plan/fast mode and active model selection are not visually confused.

## Decisions (resolved)

Product direction: **err on more visibility first**; we can simplify later if the thread feels noisy.

1. **Model visibility** — Show **both** GrokForge intent (routing slot / product meaning) **and** the resolved **raw xAI model id** for the active turn (e.g. primary line + secondary text or tooltip). Prefer not hiding the wire id while we validate launch clarity.

2. **Root / workspace context** — Show **more, not less** for now: combine **turn-level** context (header or strip for “what this reply is scoped to”) **with** **per–user-message** indicators where useful **and** alignment with **agent activity** rows when tools imply a root—so scrolling and tool rows stay consistent with “what the agent was looking at.”

3. **Multi-root copy** — **Do not** collapse to counts like “2 roots.” **Always show human-meaningful root names** (and paths or labels as needed for disambiguation) so multi-root stays a clear “wow” without dumbed-down summaries.

4. **Voice vs text** — Use **intentionally different chrome** for voice-driven turns (e.g. distinct badge/strip treatment) so users do not assume the same model strip and file/root semantics as typed `agent-chat-start` turns. Exact styling follows the design skill.

5. **Normal UI vs debug** — Keep the **primary chat surface** to trustworthy, non-secret summary (model + intent, roots, active file where relevant). Put **extra / developer-oriented detail** behind an explicit **Details** control (dropdown, popover, or sheet—TBD in implementation), not inline in every message.

## Testing

- Verify active model/root context updates when switching roots, files, and chat modes.
- Verify no API keys, secrets, or full prompt content are exposed.
- Verify message metadata remains readable at narrow widths.
- Run `npm run typecheck`.

## Acceptance criteria

- [x] Agent thread clearly indicates current model or model intent.
- [x] Agent thread clearly indicates active root or multi-root context for turns.
- [x] Context display updates when active UI context changes.
- [x] Detailed prompt/retrieval internals remain out of the normal chat surface.
- [x] Voice/text differences are handled intentionally or documented as deferred.

## Completion bookkeeping

Story **065** marked done in this file; `project_tasks/README.md` updated; `project_tasks/stories.html` regenerated via `npm run stories:html`.
