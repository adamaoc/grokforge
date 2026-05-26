# 118 — Work vs Plan, harness temperament (trust / velocity), and conversation lifecycle

**Status:** Done (2026-05-26).

**Design skill:** Read `.cursor/skills/styleguide-design/SKILL.md` before changing composer mode control, Settings, onboarding, or turn-context badges (`@styleguide-design`).

## Why this story exists

**Field reports (2026-05-25 / 2026-05-26):** ToDoApp, TaskBoard docs, and a **same-prompt Codex comparison** for CodexForge Todo.

- **Plan mode stuck** after the first good `gf-plan`; follow-ups (“add remove button”, tech-stack doc update) re-ran full Plan · tools instead of incremental **Work**.
- **“Chat”** undersells agent work — user prefers **Work** vs **Plan**.
- **Codex (velocity)** felt smoother: inline plan → **“Build it”**, then a single work stream with auto-applied edits, compact file cards, and follow-ups without re-planning. GrokForge (trust) felt correct on safety but heavy on ceremony.
- User wants **both**: a **trust harness** (review-first) and a **velocity harness** (Codex-like full access) as an explicit **user choice**, not a one-size-fits-all default.

**Product framing:**

| | **Trust** | **Velocity** |
|---|-----------|----------------|
| **Writes** | Review diff → **Apply all** before disk | **Auto-apply** proposals when validation passes — **without** requiring the user to open the diff first |
| **After apply** | Same as today | Diff still **openable** from proposal card / editor; **Undo** (batch snapshot via **`agent-undo-last-batch`**) remains |
| **Plan lifecycle** | User controls Plan vs Work; may stay in Plan | Greenfield → **Plan** once; valid `gf-plan` → auto **Work**; **Approve and run** / **Build it** flips to Work + execute |
| **Follow-ups** | Opt-in Plan | Default **Work** / executor bias (coordinate **[120](120-post-plan-executor-routing-and-single-file-edits.md)**) |

**Locked (not this story):** Keep single-file greenfield `index.html` (**101**); keep collapsed **`gf-plan` JSON** plan cards; **no** in-app browser preview (copy path from tree is enough).

## Goals

### 1. Harness temperament (user setting)

- Add **`grokforge.harnessTemperament.v1`** (or equivalent): **`trust`** | **`velocity`** (display: **Trust** / **Velocity** — names TBD in UI).
- **Settings → Agent** (or new subsection): primary control + short copy explaining trust vs velocity.
- **Composer affordance:** Small chip near mode control (Codex-style “Full access” visibility) showing active temperament; optional quick switch without opening Settings.
- **Mapping:**
  - **Trust** → `grokforge.agentWritesMode` = **`batch_confirm`** (existing).
  - **Velocity** → **`auto_apply`** (existing), with behavior below enforced on turn complete.
- Deprecate duplicative mental model: temperament is the source of truth; Settings may still show writes mode as derived or hide duplicate toggles.

### 2. Velocity auto-apply (no diff gate)

- On **`edit_proposal`** / turn **`done`**, when temperament is **velocity** and proposal passes validation + safety checks: call apply path **without** requiring `agentDiffOpenRef` / manual **Apply all**.
- User **does not** need to open the diff review pane first; files land on disk when the turn completes (same as today’s `auto_apply` intent, but explicitly **not** gated on viewing the diff).
- **Trust** unchanged: proposal card + **Review diff** + **Apply all** before write.

### 3. Review and undo after auto-apply

- After velocity auto-apply: proposal card shows **applied** state (or toast); user can still **Review diff** (read-only or post-apply view) from card or editor.
- **Undo** remains: **`agent-undo-last-batch`** (and applied-edit history **096** if surfaced) for the last applied batch — document in UI copy.
- No silent apply without snapshot: main **`agent-tool-batch`** undo snapshot behavior unchanged (**047**).

### 4. Work vs Plan naming and lifecycle

- Composer toggle **Chat → Work**; keep internal `conversationMode: 'normal' | 'plan'` and agent `chatMode: 'fast' | 'plan'` unless a later story migrates persisted turn labels.
- **Greenfield default (both temperaments):** Empty thread + `isGreenfieldWorkspace` → composer **Plan**.
- **Velocity only:** When plan-mode turn **completes** with valid **`gf-plan`**, auto-switch to **Work** + `writeConversationMode(projectId, 'normal')`.
- **Trust:** Auto-exit Plan after first plan is **off** (user stays in Plan until they switch) — or document as optional sub-toggle; default **off** per user preference.
- **Discoverability:** Onboarding / mode hint — *Plan for structured first pass; Work for follow-up edits.*

### 5. Codex-like plan → execute (velocity)

- On **`PlanModeCard`**, primary CTA remains **Approve and run**; in velocity, completing approve-and-run also ensures composer is **Work** (not left on Plan).
- Optional label alias **“Build it”** on primary CTA when temperament is velocity (copy-only; same IPC as approve-and-run).

## Non-goals

- Removing Plan mode, **`gf-plan` JSON** artifacts (**109**), or dual-model routing (**097**, **103**).
- In-app browser / localhost preview panel.
- Multi-file greenfield scaffold (stay single `index.html`).
- Forcing Work during **Executing** chip — unchanged.
- Activity compaction / retrieval copy (**119**) or post-plan routing heuristics (**120**) — separate stories; **120** more important when velocity + Work default ship.

## Scope

- [`src/renderer/src/lib/agent-writes-mode.ts`](../../src/renderer/src/lib/agent-writes-mode.ts) — temperament helper or migration from writes-only key
- [`src/renderer/src/components/SettingsPage.tsx`](../../src/renderer/src/components/SettingsPage.tsx) — Trust / Velocity control
- [`src/renderer/src/components/ChatThread.tsx`](../../src/renderer/src/components/ChatThread.tsx) — auto-apply without diff-open gate, temperament chip, Work/Plan labels, plan auto-exit (velocity), greenfield Plan default
- [`src/renderer/src/lib/conversation-mode-storage.ts`](../../src/renderer/src/lib/conversation-mode-storage.ts)
- [`src/shared/workspace-greenfield.ts`](../../src/shared/workspace-greenfield.ts) — greenfield default Plan
- [`src/renderer/src/components/PlanModeCard.tsx`](../../src/renderer/src/components/PlanModeCard.tsx) — optional “Build it” label
- [`src/renderer/src/components/AgentOnboardingDialog.tsx`](../../src/renderer/src/components/AgentOnboardingDialog.tsx) — Work/Plan + temperament one-liner
- [`src/renderer/src/components/ChatTurnContextUi.tsx`](../../src/renderer/src/components/ChatTurnContextUi.tsx) — display strings

## Acceptance criteria

- [ ] Settings (and composer chip) expose **Trust** vs **Velocity**; choice persists in `localStorage`.
- [ ] **Velocity:** valid proposal on turn complete auto-applies **without** opening diff; disk updates; undo still works via existing batch undo.
- [ ] **Velocity:** user can open diff after apply from proposal card / editor; applied state is clear.
- [ ] **Trust:** behavior matches current review-before-apply (`batch_confirm`).
- [ ] Composer shows **Work** and **Plan** (no user-facing **Chat**).
- [ ] Greenfield empty thread opens in **Plan**.
- [ ] **Velocity:** after first valid `gf-plan`, composer switches to **Work**; follow-up send defaults to Work unless user selects Plan.
- [ ] **Trust:** Plan mode not auto-cleared after first plan (unless user switches).
- [ ] `npm run typecheck` passes; manual smoke: velocity greenfield plan → approve/build → auto-apply → follow-up in Work without second plan stepper.

## Related

- **[047](../047-diff-apply-discard-and-conflict-safety.md)**, **[069](../069-plan-approve-auto-agent-turn.md)**, **[089](089-agent-edit-safe-vs-power-mode.md)** — writes / safe mode
- **[098](098-planning-mode-execute-ux-polish.md)**, **[101](101-greenfield-plan-quality.md)**, **[109](109-rpi-plan-artifacts-on-disk.md)**, **[095](095-first-project-onboarding.md)**
- **[119](119-agent-turn-ui-honesty-and-activity-compaction.md)**, **[120](120-post-plan-executor-routing-and-single-file-edits.md)** — polish; **120** pairs with velocity Work default
- **[121](121-xai-model-catalog-and-api-sync.md)** — catalog defaults updated (`grok-build-0.1` for coding slots); Work/Plan lifecycle in this story is unchanged

## Completion bookkeeping

When shipped: update **Status**, [`README.md`](../README.md) post-MVP table, [`docs/harness-roadmap.md`](../../docs/harness-roadmap.md) UX polish line, run **`npm run stories:html`**.
