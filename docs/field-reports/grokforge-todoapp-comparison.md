# Field report — GrokForge (ToDoApp greenfield)

**Dates:** 2026-05-25 – 2026-05-26 (multiple dogfood runs)  
**Workspace:** `ToDoApp` under `~/Documents/DEMO/` (empty folder → greenfield)  
**Models:** `grok-4.3` (planning), `grok-build-0.1` / `grok-code-fast-1` (execution) after story **121**

---

## How the app felt

**Early runs (trust, pre-118):** Planning often **felt strong** — structured **`gf-plan`**, stepper (Plan → Review → Execute → Done), retrieval and tool rows visible. Execution felt **heavy**: approve-and-run, Monaco diff, Apply all, toasts about finishing the plan. **Plan mode stuck** after the first good plan, so “add delete button” reopened full Plan · tools.

**Codex comparison day:** Same prompts highlighted a **product contract** gap, not model stupidity: GrokForge is a **trust harness** (nothing on disk without review); Codex Full access is **velocity**.

**After 118 + harness fixes:** A later run **felt good end-to-end** — plan quality, execute activity, switch to **Work**, single proposal card. Pain moved to **output quality** (truncated inline JS in one-file `index.html` → browser `SyntaxError`), which we now catch in validation.

**Stability nit:** One session hit **black screen** after macOS app switch during Plan (**117** backlog).

---

## How the harness did its job

GrokForge optimizes for **inspectable, reviewable agent work** on a **multi-root desktop workspace**.

| Harness job | GrokForge behavior |
|-------------|-------------------|
| **Greenfield detect** | Empty index → composer defaults to **Plan** |
| **Plan** | Planner profile, read-only tools, **`gf-plan`** JSON + **PlanModeCard**; artifacts in app data (**109**) |
| **Execute** | **Approve and run** → executor profile, `propose_file_edits`, merged proposal |
| **Writes** | **Trust:** diff → Apply all. **Velocity:** auto-apply when valid (**118**) |
| **Validation** | Reject incomplete HTML, crushed JS, truncated `<script>`; cascade after S&R failures (**115–116**) |
| **Routing** | `resolveAgentTurnRouting` — execution model on approve-and-run; dual-model profiles (**102–103**) |
| **Token budget** | Tool-sample `max_tokens` raised (was 1200 → executor **16384**) so full files fit in tool args |
| **Lifecycle** | After successful execute → **Work** (both temperaments, post-118); velocity also exits Plan after `gf-plan` |
| **Observability** | Tool activity, model badges, turn traces — tuned for harness development |

### Runs that taught us something

| Phase | What happened | Harness response |
|-------|----------------|------------------|
| Plan OK, empty disk | Execute used planning model; truncated HTML proposals | Route execute to **grok-build**; raise sample tokens |
| Valid proposal, blank diff | Monaco hid new-file content | Full-content preview for create (**DiffEditorPane**) |
| 3-file proposal, scary warnings | One-line CSS/JS per file | Normalize + skip bootstrap warnings for new files |
| “Done” but no files | UI optimistic; validation rejected writes | **123** / `plan-execute-outcome` honesty |
| Good run, broken Add | HTML closed; `<script>` truncated | `detectTruncatedEmbeddedScript`; prefer multi-file in greenfield execute copy |

---

## What GrokForge did better (for our use case)

- **Explicit trust path:** Every disk write goes through proposal + validation (+ user Apply in trust).
- **Real IDE surface:** Workspace roots, file tree, Monaco diff column, terminal, git badges.
- **Durable plans:** `plan.json` + approve-and-run injection — reproducible execute turns.
- **Dual-model harness:** Different prompts/tool bias for plan vs execute (dogfood + **108** evals).
- **Safety layers:** Edit cascade, S&R escalation, corrupt-content detection, undo batch.
- **Temperament choice:** **Trust** vs **Velocity** maps to review-first vs Codex-like auto-apply (**118**).
- **Voice + Grok-native product:** Same app targets xAI stack and desktop shell, not chat-only.

---

## Where GrokForge lagged (and what we shipped)

| Gap | Status |
|-----|--------|
| Sticky Plan after first plan | **118** — Work label, greenfield Plan default, exit Plan after execute |
| Wrong model on approve | Always **execution** model for approve-and-run |
| Truncated tool payloads | **16384** sample tokens + length warnings |
| Empty diff for new files | Diff preview fix |
| Activity / toast honesty | **119** **(done)** |
| Follow-up replanning | **120** backlog |
| Plan-phase questions | Optional **101** tweak (Cursor lesson) |
| macOS black screen | **117** backlog |

---

## How we want users to work (summary)

See **[agent-harness-comparison.html](./agent-harness-comparison.html)** § Happy path. Short version:

1. Open empty folder as project → **Plan** mode.  
2. Describe the app; get **`gf-plan`**; review collapsed JSON in card if needed.  
3. **Approve and run** (or **Build it** in velocity).  
4. **Trust:** Review diff → **Apply all**. **Velocity:** files land when valid; open diff if you want.  
5. Composer in **Work** — incremental asks without replanning unless you choose **Plan**.  
6. Verify in browser (copy path from tree); follow up in **Work** with executor model.

---

## Representative flow (GrokForge, trust, post-118)

1. **File → Open folder** → ToDoApp root.  
2. Composer shows **Plan** (greenfield).  
3. User: “Build GrokForge Todo with HTML/CSS/JS…”  
4. Turn: retrieval → plan tools → assistant **`gf-plan`** + PlanModeCard.  
5. User **Approve and run**.  
6. Execute: list dir → `propose_file_edits` → proposal card.  
7. User **Review diff** → **Apply all** → files in tree.  
8. Composer → **Work**.  
9. User: “Add localStorage” → executor turn → review → apply.  
10. Open `index.html` in browser; fix in **Work** if needed.

---

*Cross-host comparison: [agent-harness-comparison.html](./agent-harness-comparison.html)* · *Codex: [codex-todoapp-comparison.md](./codex-todoapp-comparison.md)* · *Cursor: [cursor-todoapp-comparison.md](./cursor-todoapp-comparison.md)*
