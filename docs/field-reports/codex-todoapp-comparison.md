# Field report — Codex (CodexForge Todo)

**Date:** 2026-05-25  
**Prompt set:** Same greenfield todo app ask as GrokForge and Cursor (“GrokForge Todo”, plain HTML/CSS/JS, add + mark done)  
**Host:** OpenAI Codex inside ChatGPT / Codex desktop experience  
**User setting:** **Full access** (velocity-style writes; review optional)

---

## How the app felt

**Fast and continuous.** Planning and execution read as one conversation: a numbered plan in chat, a clear **“Build it”** transition, then a work stream with compact file cards (`Edited 3 files (+301 −0)`), duration lines (“Worked for 1m 38s”), and follow-ups that stayed in the same “we’re building” rhythm.

**Low mode friction.** There was no separate Plan vs Work toggle to misread. After the first build, requests like “add localStorage”, “add remove button”, and “dark mode” felt like incremental engineering, not reopening a formal planning product.

**Strong verification narrative.** The agent described checks (`node --check`, browser steps) and was honest when automation did not fully run. That built confidence even when you were not watching every tool call.

**Preview-oriented.** Outputs sidebar and localhost-style preview made it easy to see the app without copying paths manually.

---

## How the harness did its job

Codex here is a **velocity harness**: optimize for **files on disk and a working app**, with review as an optional layer (Undo / Review on file cards), not a gate.

| Harness job | Codex behavior |
|-------------|----------------|
| **Plan before code** | Short inline plan in thread; user explicitly approves scope via **Build it** |
| **Execute** | Single work stream; multi-file scaffold in one beat |
| **Writes** | Full access → changes land without a separate diff-review product step |
| **Follow-ups** | Same thread; localized edits with +/- summaries |
| **Transparency** | Time-on-task + high-level steps; less raw tool noise than GrokForge |
| **File shape** | **3 files** (`index.html`, `styles.css`, `script.js`) — “real project” layout |

The model did not need a structured `gf-plan` fence; the **product contract** was “ship working code, narrate verification.”

---

## Outcomes vs our prompts

| Ask | Result |
|-----|--------|
| Greenfield todo | Working multi-file app after **Build it** |
| Persistence | Added in a follow-up (`script.js` edits, clear +/- card) |
| Remove / polish | Handled as incremental edits without a new plan UI |
| Trust / safety | User chose **Full access**; harness assumed competence + undo |

---

## What Codex did better (for this use case)

- **Rhythm:** Plan once → build → iterate without ceremony.
- **Scope velocity:** Three-file scaffold and working JS in one pass.
- **Follow-up UX:** File cards, undo, “Ask for follow-up changes” placeholder.
- **Verification story:** Packaged “what we checked” even without deep tool visibility.
- **Preview:** See the app in-product.

---

## Where Codex was weaker (for our goals)

- **Audit trail:** Plan lived in chat, not a durable approve-and-run artifact.
- **Harness tuning visibility:** Harder to debug routing, tool rounds, or model intent (GrokForge’s strength for *building* a harness).
- **Trust-by-default:** Full access is wrong when you want every write behind a diff (our Trust temperament).
- **Desktop IDE integration:** Chat-with-files widget vs multi-root workspace + Monaco review column.

---

## Lessons imported into GrokForge

Captured in story **118**:

- **Velocity temperament** ≈ Codex Full access (auto-apply valid proposals; diff + undo still available).
- **“Build it”** label on approve-and-run in velocity.
- **Work vs Plan** naming and auto-exit to **Work** after first valid plan (velocity).
- Borrow **rhythm**, keep **GrokForge trust model** (proposal → disk, batch undo, turn traces).

**Not chased:** In-app browser preview (copy path from tree is enough for v1).

---

## Representative flow (Codex)

1. User describes todo app in natural language.  
2. Codex posts a short numbered plan in chat.  
3. User clicks **Build it**.  
4. Codex edits multiple files; cards show +/−; app runs.  
5. User asks follow-ups in the same thread; Codex patches files; optional Undo / Review on cards.

---

*Cross-host comparison: [agent-harness-comparison.html](./agent-harness-comparison.html)*
