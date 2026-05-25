# 118 — Work vs Plan mode naming and conversation lifecycle

**Status:** Post-MVP backlog.

**Design skill:** Read `.cursor/skills/styleguide-design/SKILL.md` before changing composer mode control, onboarding copy, or turn-context badges (`@styleguide-design`).

## Why this story exists

**Field report (2026-05-25, ToDoApp harness test):**

- User started a **new** project and the composer was already in **Plan** mode (may have been intentional for greenfield; may also be confusing if leftover **per-project** `localStorage` — today `grokforge.conversationMode.v1:<projectId>` defaults to `normal` for a new UUID).
- After the **first** plan-mode turn (structured `gf-plan`), mode **stayed on Plan**. A follow-up (“add a remove button”) ran through another full plan cycle — heavier than needed.
- **“Chat”** feels like casual talk, not agent work. User prefers **Work** vs **Plan** in the UI.

## Goals

1. **Rename UI only (v1):** Composer toggle **Chat → Work**; keep internal `conversationMode: 'normal' | 'plan'` and agent `chatMode: 'fast' | 'plan'` unless a follow-up explicitly migrates persisted turn labels.
2. **Greenfield default:** When opening a project with **no chat history** (welcome-only or empty thread) and workspace is **greenfield** (`isGreenfieldWorkspace`), default composer to **Plan** (do not require manual toggle).
3. **Auto-exit Plan after first plan:** When a plan-mode turn **completes** with a **valid `gf-plan`**, automatically switch composer to **Work** (`normal`) and persist via `writeConversationMode`. User can re-select Plan anytime.
4. **Discoverability:** Mode strip or onboarding (**095**) mentions: *Plan for structured first pass; Work for follow-up edits and execution.*

## Non-goals

- Removing Plan mode or changing dual-model routing (**097**, **103**).
- Forcing Work mode during **Executing** (approve-and-run) — **Executing** chip stays as today.

## Scope

- [`src/renderer/src/components/ChatThread.tsx`](../../src/renderer/src/components/ChatThread.tsx) — labels, auto-switch on `done` + valid plan, greenfield default on thread load
- [`src/renderer/src/lib/conversation-mode-storage.ts`](../../src/renderer/src/lib/conversation-mode-storage.ts) — optional `grokforge.conversationMode.greenfieldDefault.v1` if needed
- [`src/shared/workspace-greenfield.ts`](../../src/shared/workspace-greenfield.ts) — reuse greenfield helper (renderer via existing types IPC or index stats if exposed)
- [`src/renderer/src/components/AgentOnboardingDialog.tsx`](../../src/renderer/src/components/AgentOnboardingDialog.tsx) — Fast/Plan → Work/Plan copy
- [`src/renderer/src/components/ChatTurnContextUi.tsx`](../../src/renderer/src/components/ChatTurnContextUi.tsx) — display strings where user sees `fast` / `chat`

## Acceptance criteria

- [ ] Composer shows **Work** and **Plan**; no user-facing **Chat** for conversation mode.
- [ ] New greenfield project opens with **Plan** selected when thread has no prior user messages.
- [ ] After first successful `gf-plan` turn, composer switches to **Work** without user action; `localStorage` reflects `normal` for that `projectId`.
- [ ] Re-opening project respects saved mode (Work) after auto-exit.
- [ ] Manual Plan toggle still works; second plan turn is opt-in.
- [ ] `npm run typecheck` passes; manual smoke: greenfield plan → follow-up message uses **Work** / executor-style routing unless user re-enables Plan.

## Related

- **[098](098-planning-mode-execute-ux-polish.md)**, **[101](101-greenfield-plan-quality.md)**, **[095](095-first-project-onboarding.md)**
- **[120](120-post-plan-executor-routing-and-single-file-edits.md)** — harness bias when already in Work mode

## Completion bookkeeping

When shipped: update **Status**, [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
