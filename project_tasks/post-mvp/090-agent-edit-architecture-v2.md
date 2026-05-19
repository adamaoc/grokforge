# 090 — Agent edits: architecture v2 (plan → execute, patches, transactions)

**Status:** Closed (2026-05-18). Epic decomposed into shipped stories **082–088**, **091–096**, and follow-ups **097** / **098**; no umbrella “v2” implementation track.

**Design skill:** N/A for planning doc; per sub-feature as implemented.

## Why this story exists

After quick wins (**082–084**) and `search_replace` (**085**), GrokForge can evolve toward **Cursor-class** reliability: explicit planning, unified diffs, multi-file atomic transactions, and optional planner vs executor models.

## Themes (split into sub-stories as needed)

### A. Plan → approve → execute

- Extend **062** plan mode: approved plan triggers bounded edit execution with checklist progress.
- User sees plan diff preview before any write.

### B. Unified diff apply

- Model emits unified diff; main applies via patch library with conflict markers.
- Fallback to `search_replace` / `write_file` on apply failure.

### C. Structured edit ops

- `{ action: insert | replace | delete, range, content }` with LSP-style positions (harder; long-term).

### D. Multi-file transaction

- Single proposal ID; apply all or none; one undo snapshot for batch (**agent-tools** already batches—extend UX).

### E. Model routing

- Planner model (reasoning manifest slot) vs executor model (execution slot) for edit turns only.

### F. Context

- Smarter retrieval: only relevant slices + summaries (**057** follow-up).

## Suggested implementation order

1. **085** `search_replace`
2. **082** + **083** + **084**
3. **086** hashes
4. **087** + **088** review UX
5. ~~**089**~~ modes (closed — not shipping Safe/Power toggle)
6. ~~This epic~~ — themes A/D/F largely covered; **B** (unified diff) and **C** (LSP ops) deferred; track **097** / **098** separately

## Acceptance criteria (epic closure)

Epic is **done** when at least **two** of A–F are shipped with tests and documented in `AGENTS.md`. Individual sub-deliverables should get their own story files if scope exceeds one PR.

## Related stories

- **[062](../062-agent-planning-and-multi-step-workflow.md)**, **[060](../060-agent-first-class-edit-proposals.md)**, **[057](../057-agent-retrieval-and-project-intelligence-v2.md)**.
- Post-MVP **082–089**.

## Completion bookkeeping

Closed without a single epic PR. Delivered via child stories **082–088**, **091–096**.

**Harness program (2026-05):** continued in **102–114** — dual-model manifests, per-model harness profiles, agent profiles/toolsets, turn snapshots, context offload, evals, RPI plan files, subagents. See **[111](111-harness-roadmap-and-retrospective-doc.md)**.

Deferred beyond harness wave: unified diff apply (theme B), LSP-style edit ops (theme C).
