# Field report — Cursor (Composer Plan)

**Date:** 2026-05-26  
**Prompt set:** Same greenfield todo app ask as GrokForge and Codex  
**Host:** Cursor IDE — **Composer** with **Plan** mode, then **Build**, then **Agent** for follow-ups

---

## How the app felt

**Product-manager energy at plan time.** Before any code, Cursor surfaced **structured questions** (“1 of 2”): e.g. persist todos in **localStorage**? support **delete**? Defaults were sensible; **Continue** was enough to approve scope you would have asked for anyway.

**Readable plan in the repo.** A markdown plan file landed in the workspace (`cursor_todo_app_*.plan.md`) with feature tables and function responsibilities — easy to skim in the tree, not only in chat.

**Ceremony between Codex and GrokForge.** After questions → plan file → **Build**, implementation ran in **Agent** mode with inline diffs and a compact **PASS** checklist (“delete uses icon”, etc.). Batch **Keep All / Undo All** felt like PR chunks without opening a full Monaco diff column.

**Smooth handoff to iteration.** Follow-ups (styling, behavior) stayed in **Agent**, not Plan — closer to Codex’s continuous stream than GrokForge’s early “sticky Plan” behavior.

---

## How the harness did its job

Cursor’s harness sits **between** Codex velocity and GrokForge trust:

| Harness job | Cursor behavior |
|-------------|-----------------|
| **Clarify scope** | Multiple-choice questions **before** plan is finalized |
| **Plan artifact** | `.plan.md` in workspace (human-readable) |
| **Execute gate** | **Build** button (explicit user consent to implement) |
| **Writes** | Agent applies edits; user batches **Keep** / **Undo** / **Review** |
| **Follow-ups** | **Agent** mode; no full replan UI for “add dark mode” |
| **File shape** | **3 files** (`index.html`, `styles.css`, `app.js`) |
| **Verification** | Short PASS checklist in thread (not full browser harness) |

The standout harness feature is **proactive scope capture** — persistence and delete were chosen up front, not discovered missing after v1.

---

## Outcomes vs our prompts

| Ask | Result |
|-----|--------|
| Greenfield todo | Plan questions → md plan → Build → three-file app |
| Persistence / delete | **Asked** during plan phase; included in implementation |
| Follow-ups | Agent-mode edits with checklist-style confirmation |
| Trust | User still confirms **Build** and **Keep** batches; not silent Full access |

---

## What Cursor did better (for this use case)

- **Plan-phase questions:** Surfaces CRUD/persistence decisions before architecture.
- **Workspace-visible plan:** Editable, shareable `.plan.md` in the tree.
- **Build → Agent lifecycle:** Clear mode handoff; follow-ups don’t reopen Plan.
- **Post-turn summary:** PASS checklist — low noise, high signal (**119** inspiration).
- **Batch review:** Keep All / Undo All at IDE change layer.

---

## Where Cursor was weaker (for our goals)

- **Grok-native routing:** No dual-model manifest (`grok-4.3` plan vs `grok-build` execute) or per-profile tool loops.
- **Deep desktop diff:** Inline +/- is enough for small edits; large reviews favor GrokForge’s editor column.
- **Harness observability:** Less visibility into tool rounds, routing, and eval tags (we need that to tune Grok).
- **Durable plan for approve-and-run:** Repo plan md is great for humans; GrokForge **`plan.json`** in app data is stronger for IPC execute handoff and tests.
- **Single-file preference:** Cursor defaulted to three files; you prefer one `index.html` for tiny demos (product choice, not Cursor wrong).

---

## Lessons for GrokForge (no new story required)

| Cursor pattern | GrokForge adaptation |
|----------------|----------------------|
| Plan questions | Optional greenfield **assumption chips** or planner **Assumptions** block in **101** |
| Build button | **Approve and run** / **Build it** (**118** velocity) |
| Agent follow-ups | **Work** default after plan + **120** executor routing |
| PASS checklist | Turn summary line (**119**) |
| Keep / Undo batch | **Velocity** auto-apply + **`agent-undo-last-batch`** |

Defer full Cursor-style question UI until after **118** ships; prompt/chip tweaks may be enough.

---

## Representative flow (Cursor)

1. User describes todo app.  
2. Composer **Plan** asks 1–2 scope questions (persist? delete?).  
3. User continues with defaults or edits answers.  
4. Cursor writes **`.plan.md`** in workspace.  
5. User clicks **Build**.  
6. **Agent** implements three files; user **Keep All** or reviews diffs.  
7. Follow-ups in **Agent** with PASS-style notes.

---

*Cross-host comparison: [agent-harness-comparison.html](./agent-harness-comparison.html)*
