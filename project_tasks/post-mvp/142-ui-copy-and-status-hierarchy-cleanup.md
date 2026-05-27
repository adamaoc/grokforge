# 142 — UI copy and status hierarchy cleanup

**Status:** Done (2026-05-27).

**Priority:** **Second** among **141–143** — Todo recordings showed **repetitive, internal-sounding** labels (“Work · tools”, “Work tool round”, “Executing plan (tools)…”, harness conflict titles surfaced verbatim) and **duplication** between mode chips, model badges, and phase strings. **[141](141-conversation-first-chat-and-tool-activity-shell.md)** fixes layout; **142** fixes **language and hierarchy** so the app scans like a **conversation with an agent**, not a harness debugger.

**Design skill:** **Required** — `@styleguide-design`.

## Why this story exists

| Noise source | Example today | User impact |
|--------------|---------------|-------------|
| Activity section + round titles | `Work · tools`, `Work tool round` | Feels like a log viewer |
| Live status line | `Executing plan (tools)…`, `Running tools…` | Overlaps Plan stepper + mode badge |
| Harness activity titles | `Harness: scaffold strategy conflict` | Internal product voice in chat |
| Mode / model chrome | Plan chip + “Planning” + stepper “executing” | Same state said three ways |
| Welcome / empty states | Redundant capability tags | Clutter before first message |

**129** fixed “Planning tool step stopped” for Work rounds in **main**; renderer still shows **plan-centric** strings in fast mode in places.

## Goals

### 1. Copy matrix (user-facing strings)

Author a single source in [`src/renderer/src/lib/ui-copy.ts`](../../src/renderer/src/lib/ui-copy.ts) (and shared activity labels where main emits titles):

| Context | Direction |
|---------|-----------|
| Activity section (collapsed) | **“Working”** / **“Done”** / **“Issue”** — not “Work · tools” |
| Tool round (if still shown) | **“Step 2 of 4”** or tool verb only — not “Work tool round” |
| Live assistant placeholder | One line: **“Thinking…”** / **“Running your plan…”** / **“Applying changes…”** — map from `planExecuteStreamActive` + `chatMode` |
| Harness rows | **Humanize** in renderer: map known `Harness:` prefixes to short user copy; optional `technicalTitle` in tooltip for power users |
| Plan execute | Align `PlanPhaseStepper`, `PlanModeCard`, and `ChatThread` busy line — **one** primary status per moment |

Update [`agent-activity-display.ts`](../../src/shared/agent-activity-display.ts) for labels used in both main activity emit and renderer (round title, section title) — keep main titles stable for traces; renderer can **displayMap** if needed to avoid breaking eval logs.

### 2. Information hierarchy rules

Document in PR / story notes:

1. **Primary:** user message + assistant message + proposal/plan **cards**.
2. **Secondary:** one-line activity summary (**141**).
3. **Tertiary:** expanded tool steps, scope metadata, model id mono lines.
4. **Dedupe:** If `turn_started.routing` badge shows model, suppress duplicate model string in activity scope line.

Apply in:

- [`ChatTurnContextUi.tsx`](../../src/renderer/src/components/ChatTurnContextUi.tsx)
- [`PlanPhaseStepper.tsx`](../../src/renderer/src/components/PlanPhaseStepper.tsx)
- [`PlanModeCard.tsx`](../../src/renderer/src/components/PlanModeCard.tsx)
- [`ChatThread.tsx`](../../src/renderer/src/components/ChatThread.tsx) — composer chrome, live status
- [`AgentTurnToolActivityList.tsx`](../../src/renderer/src/components/AgentTurnToolActivityList.tsx) — after **141** shell lands

### 3. Welcome and onboarding trim

- [`makeWelcomeMessage`](../../src/renderer/src/components/ChatThread.tsx) / [`ChatWelcomeSuggestions`](../../src/renderer/src/components/ChatWelcomeSuggestions.tsx) — remove duplicate bullets; one short value prop + 3 suggestions.
- Welcome screen recents ([`welcome/`](../../src/renderer/src/components/welcome/)) — audit redundant badges.

### 4. Settings copy (light touch)

- Appearance / Agent sections: shorten labels; no harness story numbers in user-visible text.

## Scope

- [`src/renderer/src/lib/ui-copy.ts`](../../src/renderer/src/lib/ui-copy.ts) *(new)*
- [`src/shared/agent-activity-display.ts`](../../src/shared/agent-activity-display.ts) + [`.test.ts`](../../src/shared/agent-activity-display.test.ts)
- [`src/renderer/src/lib/harness-activity-display-map.ts`](../../src/renderer/src/lib/harness-activity-display-map.ts) *(new)* — map harness titles → user strings
- Components listed in §2
- Optional: [`src/main/agent-runner.ts`](../../src/main/agent-runner.ts) — only if improving **emit** titles at source (prefer renderer map first)

## Non-goals

- Full i18n / localization.
- Renaming product modes Work/Plan (**118** names stay).
- Changing harness nudge **content** sent to the model.
- Layout collapse behavior (**141**).

## Dependencies

- **Best after or with:** **[141](141-conversation-first-chat-and-tool-activity-shell.md)** — summary strip strings finalized together.
- **Related:** **[134](134-harness-conflict-recovery-activity-honesty.md)** (harness tone), **[098](098-planning-mode-execute-ux-polish.md)**.

## Acceptance criteria

- [x] No user-visible string **“Work tool round”** or **“Work · tools”** in chat UI (grep `src/renderer`).
- [x] Live turn shows **at most one** prominent status phrase (stepper XOR composer line XOR activity summary — not all three repeating “executing/planning”).
- [x] Harness conflict / escalation activities show **human headline**; full harness title in tooltip or expanded detail only.
- [x] Welcome message + suggestions: ≤ **6** lines total intro copy before suggestions.
- [x] `agent-activity-display` unit tests updated for new display labels (or display map tests).
- [x] `npm run typecheck` passes; manual pass on Todo Plan + Work recordings checklist.

## Related

- **[141](141-conversation-first-chat-and-tool-activity-shell.md)**
- **[125](125-agent-turn-activity-clarity-and-chat-vertical-space.md)**
- **[118](118-work-vs-plan-mode-and-conversation-lifecycle.md)**

## Completion bookkeeping

When shipped: update **Status**, [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
