# 143 — Context panel: agent-aware file companion

**Status:** Done (2026-05-27). v1: `AgentContextCompanion` strip, chat snapshot wiring, collapsed bubble summary, Velocity follow-agent auto-open.

**Priority:** **Third** among **141–143** — in the three Todo recordings, the **right-hand editor column** mostly mirrored the open file and felt **passive** during chat-heavy flows (Plan approve, Work edits, review proposal). Users stayed in the thread for decisions; the panel did not answer “**what changed?**” or “**what should I do next on this file?**” without opening the diff elsewhere.

**Design skill:** **Required** — `@styleguide-design`.

## Why this story exists

| Moment (Todo videos) | Panel today | Opportunity |
|----------------------|-------------|-------------|
| Agent proposes `script.js` edit | User may not have file open | Surface **pending proposal** + Apply path |
| Execute creates multi-file diff | Editor shows unrelated open tab | **Files in this turn** list |
| Work localStorage / remove button | Same static Monaco view | **Why this file** (active context, last read) |
| No file open | [`EditorEmptyState`](../../src/renderer/src/components/EditorEmptyState.tsx) generic | **Contextual empty state** tied to chat |

[`EditorPane`](../../src/renderer/src/components/EditorPane.tsx) already supports diff sessions and [`AgentEditSafetyBanner`](../../src/renderer/src/components/AgentEditSafetyBanner.tsx) — **143** adds a **conversation-linked** header/sidebar region without replacing Monaco.

## Goals

### 1. Context companion header (above editor or split top strip)

New [`AgentContextCompanion.tsx`](../../src/renderer/src/components/AgentContextCompanion.tsx) fed from `App` / `ChatThread` via props or narrow context:

| State | Companion shows |
|-------|-----------------|
| **Pending proposal** (current stream or selected message) | File list in batch, primary path, **Review diff** (focuses diff session), **Apply** / **Discard** if not auto-apply — delegate to existing handlers |
| **Live turn, no proposal yet** | “Working on …” + active file from `turnContext` + last 1–3 tool targets (from activities) |
| **Last completed turn** | “Last change: `script.js`” + link to open file / view diff if proposal still pending |
| **Idle, file open** | Short path + optional git dirty hint (existing badge data if cheap) |
| **Idle, no file** | “No file selected” + **Open from last agent touch** if known |

### 2. Wire data from chat without new IPC (v1)

Use existing renderer state:

- `pendingAgentProposal`, `diffSession`, `agentActivities` (live), message-attached proposal ids
- `activeContext.activeFilePath` from agent events
- Do **not** duplicate main-process truth — optional `get-stored-plan` patterns only if already on bridge

Lift minimal **“agent file focus”** state in [`App.tsx`](../../src/renderer/src/App.tsx): `{ path, reason: 'proposal' | 'read' | 'active', streamId? }`.

### 3. Smart panel visibility (non-regressive)

- When companion has **actionable proposal**, subtle accent border on editor column; do not auto-expand collapsed editor if user collapsed intentionally.
- Optional: auto-open editor to **first proposed path** on `edit_proposal` only when editor was collapsed and setting `grokforge.contextPanel.followAgentFiles` (default **on** for Velocity, **off** for Trust — tie to **[118](118-work-vs-plan-mode-and-conversation-lifecycle.md)** temperament if already in storage).

### 4. Quick actions (lightweight)

- **View diff** — existing diff session open.
- **Open file** — `onFileOpen(path)`.
- **Copy path** — clipboard via preload if available.
- Defer: blame, history, multi-root picker.

### 5. Empty / diff modes

- When `diffSession` active, companion summarizes **+N −M** via existing [`formatDiffSessionSummary`](../../src/shared/diff-line-stats.ts) + file basename.
- [`EditorContextBubble`](../../src/renderer/src/components/EditorContextBubble.tsx) when editor collapsed: show companion mini summary (proposal pending / file name).

## Scope

- [`src/renderer/src/components/AgentContextCompanion.tsx`](../../src/renderer/src/components/AgentContextCompanion.tsx) *(new)*
- [`src/renderer/src/components/EditorPane.tsx`](../../src/renderer/src/components/EditorPane.tsx) — slot companion above Monaco / diff
- [`src/renderer/src/App.tsx`](../../src/renderer/src/App.tsx) — state wiring, collapse coordination
- [`src/renderer/src/components/ChatThread.tsx`](../../src/renderer/src/components/ChatThread.tsx) — callbacks to set agent file focus on `edit_proposal` / activity
- [`src/renderer/src/components/EditorEmptyState.tsx`](../../src/renderer/src/components/EditorEmptyState.tsx) — contextual empty copy
- [`src/renderer/src/components/EditorContextBubble.tsx`](../../src/renderer/src/components/EditorContextBubble.tsx) — collapsed summary
- [`src/renderer/src/lib/harness-temperament.ts`](../../src/renderer/src/lib/harness-temperament.ts) — optional follow-agent setting

## Non-goals

- Replacing chat-inline proposal cards (**069** / **118**).
- Full file tree in the right column (sidebar owns tree).
- New IPC for agent file history (v2 could read turn trace).
- In-editor AI inline edits.

## Risks

| Risk | Mitigation |
|------|------------|
| **Duplicate Apply CTAs** | Companion buttons call same handlers as card; hide companion primary when card focused in view |
| **Wrong file auto-open** | Respect temperament; only first path in batch; toast undo |

## Dependencies

- **Builds on:** **[118](118-work-vs-plan-mode-and-conversation-lifecycle.md)**, **[069](../069-plan-approve-auto-agent-turn.md)**, **[125](125-agent-turn-activity-clarity-and-chat-vertical-space.md)**.
- **Best after:** **[141](141-conversation-first-chat-and-tool-activity-shell.md)** — user attention stays in chat; companion supports side column.
- **Copy:** **[142](142-ui-copy-and-status-hierarchy-cleanup.md)** for companion strings.

## Acceptance criteria

- [x] **Manual (Todo execute):** On `edit_proposal`, companion lists proposed files and **Review diff** opens existing diff UI without hunting tabs.
- [x] **Manual (Todo Work):** During live turn with reads on `script.js`, companion shows that path as focus before proposal arrives.
- [x] **Manual:** Editor collapsed + pending proposal → context bubble or strip shows file name + review action.
- [x] Trust mode: auto-open proposed file **off** by default; Velocity **on** (or documented in Settings).
- [x] No regression: editor save, tabs, diff apply/discard still work.
- [x] `npm run typecheck` passes.

## Related

- **[141](141-conversation-first-chat-and-tool-activity-shell.md)**
- **[142](142-ui-copy-and-status-hierarchy-cleanup.md)**
- **[093](../093-agent-tool-activity-in-chat-thread.md)**

## Completion bookkeeping

When shipped: update **Status**, [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
