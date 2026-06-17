# Harness program roadmap

**Last updated:** 2026-05-20.

This document is the **program index** for GrokForge’s agent harness (stories **102–114**). For design depth, patterns, and research synthesis, see **[`i-am-a-harness.md`](i-am-a-harness.md)**. For IPC, file paths, and implementation detail, see **[`AGENTS.md`](../AGENTS.md)**.

---

## 1. Agent = model + harness

**Grok** (xAI) provides the model — reasoning and token generation. **GrokForge** provides the **harness**: workspace roots, lexical retrieval, function tools, command and edit approval, plan/execute UX, streaming events, and persistence under app `userData`. The *agent* is the behavior that emerges when a chosen Grok id runs inside that environment.

Do not conflate “make the model remember the project” (model problem) with “what context and tools does this turn get?” (harness problem). Read **[`i-am-a-harness.md`](i-am-a-harness.md)** for the full mental model.

---

## 2. Dual-model strategy

New projects **intentionally** use two xAI model ids so we can tune prompts and tool exposure **per model**, not one generic chat prompt.

| Manifest slot | Default model id | When used | Harness profile key | Agent profile |
| --- | --- | --- | --- | --- |
| `default` | `grok-build-0.1` | Fast chat (`chat_default`) | `grok_code_fast` | `default` |
| `planning` | `grok-4.3` | Plan mode (default intent) | `grok_4_3` | `planner` |
| `execution` | `grok-build-0.1` | Approve-and-run (**069**) | `grok_code_fast` | `executor` |
| `reasoning` | `grok-4.20-0309-reasoning` | Reserved / future | `generic` if unmapped | context-dependent |
| `voice` | `grok-voice-latest` | Voice realtime (separate WebSocket path) | N/A for text loop | N/A |

**Code:** defaults and intent routing currently live in [`model-router.ts`](../src/harness-support/routing/model-router.ts); profile behavior and legacy routing helpers live under [`src/harness-support/profiles/`](../src/harness-support/profiles/) and [`src/harness-support/routing/`](../src/harness-support/routing/). Active renderer access goes through `src/renderer/src/lib/legacy-agent/`.

**Notes:**

- Legacy slug **`grok-code-fast-1`** redirects to **`grok-build-0.1`** at the API (not `grok-4.3`). We **keep dual ids in manifest** on purpose for harness A/B. See [`harness-102-xai-investigation.md`](harness-102-xai-investigation.md) and story **121**.
- **102** — dual-model manifest, `turn_started.routing`, trace metadata.
- **103** — per-key system sections, tool-loop bias, final-answer variants (`grok_code_fast`, `grok_4_3`, `generic`).

---

## 3. What already works

Protect these while extending the harness.

| Area | What ships | Stories |
| --- | --- | --- |
| **Tool loop** | `workspace_index`, `list_directory`, `read_file`, `search_workspace`, guarded `run_command`, `propose_file_edits`, parent `spawn_subagent` | **034**, **059**, **060**, **112** |
| **Subagents** | Read-only explorer child sessions (`agent-sessions/*.jsonl`), bounded JSON artifact to parent | **112** |
| **Edit trust** | Diff review, undo batch, stale content hash, failure context, regenerate proposal, applied-edit history | **047**, **082–088**, **086**, **092**, **096** |
| **Plan / execute** | `gf-plan` final contract, approve-and-run routing, execute UX polish, durable `plan.json` / `plan.md` | **099**, **069**, **097**, **098**, **109** |
| **Dual-model harness** | Profile keys, per-model prompts, agent profiles + toolsets, greenfield plan appendix | **102–104**, **101** |
| **Observability** | Tool activity in thread, turn traces, immutable turn snapshots, turn receipts + interrupted UI | **093**, **061**, **105**, **110** |
| **Context** | Pins / thread memory, workspace index, large tool-result offload + `read_file` recovery | **094**, **034** / index store, **107** |
| **Eval** | Deterministic agent-loop matrix + manual checklist | **063**, **108** |
| **Proactivity** | Explore-before-ask system bias | **091** |
| **Voice harness** | Profile-aligned voice instructions + handoff metadata (`buildVoiceHarnessAppendix`, shared handoff) | **113** |

**Wave 3 complete (102–114):** fenced `grokforge-agent-tools` write path removed in **114**; `propose_file_edits` is the only apply path for new turns.

**Known limitation:** Grok Voice realtime does **not** run the text agent tool loop. **113** aligns voice instructions and handoff copy with harness profiles; implementation work still flows through typed agent chat.

**App stability (deferred):** One report of a **black renderer** after macOS app switch during Plan mode (**Cmd+R** ineffective). Tracked as **117** — address if reproducible; not harness-core.

**UX polish (post-ToDoApp / Codex comparison, 2026-05-25+):** **118** **Trust vs velocity** temperament **(done)** — velocity auto-applies without opening diff; undo + review on demand; Work vs Plan lifecycle; **119** activity/toast honesty; **120** incremental follow-ups without re-planning **(done)**. **Field reports:** [Codex / Cursor / GrokForge ToDoApp comparison](field-reports/README.md) + [visual comparison HTML](field-reports/agent-harness-comparison.html).

---

## 4. Harness debt retrospective

Condensed “symptom → harness cause → fix” from product research and shipped stories. Use this when debugging “the model felt dumb” — often the harness was wrong.

| Symptom | Harness cause | Fix (story) |
| --- | --- | --- |
| “Give me the exact file path” | No explore-first bias; voice handoff without tools | **091** |
| Plan turn proposes edits / no `gf-plan` | Fast-mode final contract applied on plan turns | **099** |
| Same prompts for fast vs 4.3 | Single generic harness | **102**, **103** |
| Planner could still get write tools | Prompt-only restriction, not tool registry | **104** |
| UI model hint ≠ API model | Renderer passed model; main did not canonicalize | **097** |
| Weak greenfield plans | No empty-workspace harness appendix | **101** |
| Confusing plan → execute handoff | Long synthetic user line; plan only in chat | **098**, **109** |
| Huge tool JSON fills context | No offload / pointer to app storage | **107** |
| Harness regressions undetected | Thin eval fixtures | **063**, **108** |
| Crash mid-tool, no recovery signal | No durable turn boundary | **110** |
| Fence + `propose_file_edits` duplicate paths | Legacy compatibility write path | **114** (done — fence apply removed; display strip only) |
| Repeated `search_replace` fail → destructive full-file proposal | No turn policy; prompt-only minimal change (**083**) | **115** — reject shrink proposals after ≥2 S&R failures on same path |
| S&R retry loop burns tool budget; false “updated on disk” narrative | **115** blocks bad proposals but no mid-turn recovery nudge | **116** — escalation nudge, honest final contract, renderer toast |
| Work turns show “Planning tool step stopped” / timeout on discovery | Misleading round labels; rounds stay `running` until abort; **default** profile on populated repos; 5m flat timeout | **129** — Work tool rounds, executor routing, discovery cap, adaptive timeout |
| Iterative feature edits unstable on small existing repos; heavy duplicate harness text | Routing only when `package.json` or file count > 12; explore rules conflict with discovery cap | **130** — `iterativeWorkEdit` routing, harness 130 appendix, slim nudges/final contract |
| Work-mode incremental edits thrash (many tool rounds, repeated S&R, read→edit→read) | **130** prompt-only; executor still at 6 rounds; model keeps sampling after `edit_proposal` | **135** — 4-round cap, `iterative-work-edit-guards` thrash nudges, stop after proposal, harness 135 copy |
| Model re-reads and patches incrementally despite clear single-file ask (e.g. localStorage on `script.js`) | **130**/**135** prose only; no computed scope from user text or early tool pattern | **136** — `resolveIterativeEditScope`, turn-start scope block, mid-turn shape nudge (scope → thrash → discovery priority) |
| Hard to tell if **135**/**136** reduced iterative thrash | Turn traces lack routing/nudge/round metrics | **137** — `harnessMetrics` on turn trace + dev log line **(done)** |
| Iterative Work S&R retry loop burns budget before strategy switch | **116** global thresholds; no hard block after escalation on `iterativeWorkEdit` | **138** — 1-failure escalate, post-nudge S&R block, force-final at 3 **(done)** |
| First-attempt `search_replace` misses on localized UI edits (guessed `old_string`) | **138** recovers after failure; generic tool desc and terse not-found errors | **139** — iterative S&R quality appendix, tool override, pre-sample nudge, richer not-found hints **(done)** |
| S&R failure loop / `maxToolIterationsHit` opaque in dogfood | Trace has boolean only; escalation state scattered in activity | **140** — `harnessMetrics.searchReplace` + `maxIterationsReason` + budget activity row **(done)** |
| Iterative Work policy sprawl (130–140); post-plan lacked caps/stop | Parallel nudges, prompts, scope mid-turn, pre-sample, tool overrides | **144** — `incremental-work-edit-policy.ts`, one mid-turn gate, shared `incrementalEditEnforcement` **(done)** |

---

## 5. Implementation waves

Logical program order for **102–114**. Status as of **2026-05-19**.

### Wave 1 — foundation and RPI feel

| ID | Scope | Status |
| --- | --- | --- |
| **111** | This roadmap + retrospective index | **done** |
| **102** | Dual-model manifest defaults + harness profile keys + `turn_started.routing` | done |
| **103** | Per-model harness profiles (`grok_code_fast` vs `grok_4_3`) | done |
| **104** | Agent profiles and toolsets (`planner` read-only, `executor` full) | done |
| **097** | Canonical planner vs executor routing in main | done |
| **101** | Greenfield plan quality (per-profile plan sections) | done |
| **098** | Planning mode execute UX (stepper, routing badges) | done |
| **109** | RPI plan artifacts on disk (`plan.json`, approve pointer) | done |

### Wave 2 — harness hardening

| ID | Scope | Status |
| --- | --- | --- |
| **108** | Harness eval matrix + `test:agent-eval` + manual checklist | done |
| **105** | Immutable turn snapshots per provider round | done |
| **106** | Unified `AgentToolExecutionContext` for all v1 tools | done |
| **107** | Context offload for large tool results | done |
| **110** | Turn receipts + interrupted tool boundaries + recovery hint | done |

### Wave 3 — durability and cleanup

| ID | Scope | Status |
| --- | --- | --- |
| **112** | Subagents as isolated child sessions (`spawn_subagent`, `agent-sessions/*.jsonl`) | done |
| **113** | Voice realtime harness / profile alignment | done |
| **114** | Deprecate fenced `grokforge-agent-tools` protocol | done |

**Related pre-harness edit wave (closed):** **090** epic delivered via **082–088**, **091–096**.

---

## 6. Out of scope / closed

| ID | Title | Status |
| --- | --- | --- |
| **089** | Agent edits: Safe vs Power mode | **Closed** — not pursuing separate safe/power UX. |
| **090** | Agent edits: architecture v2 (epic) | **Closed** — scope delivered through child stories; harness program continues in **102–114**. |

---

## 7. Evaluation

| Layer | What | Where |
| --- | --- | --- |
| **Automated** | Mocked agent-loop regressions and compatibility coverage for legacy harness behavior | `npm run test` -> `src/main/legacy/__tests__/` and `src/shared/legacy/__tests__/`; tags in [`agent-eval-tags.ts`](../src/shared/legacy/agent-eval-tags.ts) |
| **Foundation** | First deterministic eval harness | **063** |
| **Manual** | Dual-model smoke flows (plan, execute, cancel, offload, etc.) | [`harness-eval-checklist.md`](harness-eval-checklist.md) |

**Policy:** Changing legacy harness profile, routing, or final-answer behavior under `src/harness-support/` requires updating the relevant legacy tests and the manual checklist when behavior-visible.

**Research (implementation comparison):** [`research/agentic-coding-harnesses.md`](research/agentic-coding-harnesses.md) — OpenCode, Hermes, Pi, T3.

---

## See also

- [`i-am-a-harness.md`](i-am-a-harness.md) — textbook (agent vs model, patterns, backlog synthesis).
- [`AGENTS.md`](../AGENTS.md) — contributor guide and agent-chat implementation reference.
- TheTaskManager API (`http://localhost:8080/api`, project `grokforge`) — active backlog and story specs.
