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
| `execution` | `grok-build-0.1` | Approve-and-run ([**069**](../project_tasks/069-plan-approve-auto-agent-turn.md)) | `grok_code_fast` | `executor` |
| `reasoning` | `grok-4.20-0309-reasoning` | Reserved / future | `generic` if unmapped | context-dependent |
| `voice` | `grok-voice-latest` | Voice realtime (separate WebSocket path) | N/A for text loop | N/A |

**Code:** defaults in [`DUAL_MODEL_FALLBACKS`](../src/shared/model-router.ts); turn routing in [`resolveAgentTurnRouting`](../src/shared/agent-turn-routing.ts); profile key in [`resolveHarnessProfileKey`](../src/shared/agent-harness-profile-contract.ts); toolsets in [`resolveAgentProfileId`](../src/shared/agent-profile.ts).

**Notes:**

- Legacy slug **`grok-code-fast-1`** redirects to **`grok-build-0.1`** at the API (not `grok-4.3`). We **keep dual ids in manifest** on purpose for harness A/B. See [`harness-102-xai-investigation.md`](harness-102-xai-investigation.md) and story **[121](../project_tasks/post-mvp/121-xai-model-catalog-and-api-sync.md)**.
- [**102**](../project_tasks/post-mvp/102-dual-model-manifest-and-harness-foundation.md) — dual-model manifest, `turn_started.routing`, trace metadata.
- [**103**](../project_tasks/post-mvp/103-agent-harness-per-model-profiles.md) — per-key system sections, tool-loop bias, final-answer variants (`grok_code_fast`, `grok_4_3`, `generic`).

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

**Wave 3 complete (102–114):** fenced `grokforge-agent-tools` write path removed in [**114**](../project_tasks/post-mvp/114-deprecate-fenced-agent-tools-protocol.md); `propose_file_edits` is the only apply path for new turns.

**Known limitation:** Grok Voice realtime does **not** run the text agent tool loop. [**113**](../project_tasks/post-mvp/113-voice-realtime-harness-profile-alignment.md) aligns voice instructions and handoff copy with harness profiles; implementation work still flows through typed agent chat.

**App stability (deferred):** One report of a **black renderer** after macOS app switch during Plan mode (**Cmd+R** ineffective). Tracked as [**117**](../project_tasks/post-mvp/117-renderer-black-screen-on-macos-resume.md) — address if reproducible; not harness-core.

**UX polish (post-ToDoApp / Codex comparison, 2026-05-25+):** [**118**](../project_tasks/post-mvp/118-work-vs-plan-mode-and-conversation-lifecycle.md) **Trust vs velocity** temperament **(done)** — velocity auto-applies without opening diff; undo + review on demand; Work vs Plan lifecycle; [**119**](../project_tasks/post-mvp/119-agent-turn-ui-honesty-and-activity-compaction.md) activity/toast honesty; [**120**](../project_tasks/post-mvp/120-post-plan-executor-routing-and-single-file-edits.md) incremental follow-ups without re-planning **(done)**. **Field reports:** [Codex / Cursor / GrokForge ToDoApp comparison](field-reports/README.md) + [visual comparison HTML](field-reports/agent-harness-comparison.html).

---

## 4. Harness debt retrospective

Condensed “symptom → harness cause → fix” from product research and shipped stories. Use this when debugging “the model felt dumb” — often the harness was wrong.

| Symptom | Harness cause | Fix (story) |
| --- | --- | --- |
| “Give me the exact file path” | No explore-first bias; voice handoff without tools | [**091**](../project_tasks/post-mvp/091-agent-proactive-workspace-exploration.md) |
| Plan turn proposes edits / no `gf-plan` | Fast-mode final contract applied on plan turns | [**099**](../project_tasks/post-mvp/099-plan-mode-final-contract-and-toast.md) |
| Same prompts for fast vs 4.3 | Single generic harness | [**102**](../project_tasks/post-mvp/102-dual-model-manifest-and-harness-foundation.md), [**103**](../project_tasks/post-mvp/103-agent-harness-per-model-profiles.md) |
| Planner could still get write tools | Prompt-only restriction, not tool registry | [**104**](../project_tasks/post-mvp/104-agent-profiles-and-toolsets.md) |
| UI model hint ≠ API model | Renderer passed model; main did not canonicalize | [**097**](../project_tasks/post-mvp/097-model-routing-planner-vs-executor.md) |
| Weak greenfield plans | No empty-workspace harness appendix | [**101**](../project_tasks/post-mvp/101-greenfield-plan-quality.md) |
| Confusing plan → execute handoff | Long synthetic user line; plan only in chat | [**098**](../project_tasks/post-mvp/098-planning-mode-execute-ux-polish.md), [**109**](../project_tasks/post-mvp/109-rpi-plan-artifacts-on-disk.md) |
| Huge tool JSON fills context | No offload / pointer to app storage | [**107**](../project_tasks/post-mvp/107-agent-context-offload-large-tool-results.md) |
| Harness regressions undetected | Thin eval fixtures | [**063**](../project_tasks/063-agent-evaluation-suite-and-smartness-regressions.md), [**108**](../project_tasks/post-mvp/108-harness-eval-suite-per-model-regressions.md) |
| Crash mid-tool, no recovery signal | No durable turn boundary | [**110**](../project_tasks/post-mvp/110-agent-interrupted-tool-boundaries.md) |
| Fence + `propose_file_edits` duplicate paths | Legacy compatibility write path | [**114**](../project_tasks/post-mvp/114-deprecate-fenced-agent-tools-protocol.md) (done — fence apply removed; display strip only) |
| Repeated `search_replace` fail → destructive full-file proposal | No turn policy; prompt-only minimal change (**083**) | [**115**](../project_tasks/post-mvp/115-agent-edit-cascade-guard-after-search-replace-failures.md) — reject shrink proposals after ≥2 S&R failures on same path |
| S&R retry loop burns tool budget; false “updated on disk” narrative | **115** blocks bad proposals but no mid-turn recovery nudge | [**116**](../project_tasks/post-mvp/116-agent-edit-search-replace-escalation-nudge.md) — escalation nudge, honest final contract, renderer toast |
| Work turns show “Planning tool step stopped” / timeout on discovery | Misleading round labels; rounds stay `running` until abort; **default** profile on populated repos; 5m flat timeout | [**129**](../project_tasks/post-mvp/129-iterative-work-stability-populated-workspaces.md) — Work tool rounds, executor routing, discovery cap, adaptive timeout |
| Iterative feature edits unstable on small existing repos; heavy duplicate harness text | Routing only when `package.json` or file count > 12; explore rules conflict with discovery cap | [**130**](../project_tasks/post-mvp/130-work-iterative-edit-harness.md) — `iterativeWorkEdit` routing, harness 130 appendix, slim nudges/final contract |
| Work-mode incremental edits thrash (many tool rounds, repeated S&R, read→edit→read) | **130** prompt-only; executor still at 6 rounds; model keeps sampling after `edit_proposal` | [**135**](../project_tasks/post-mvp/135-iterative-work-surgical-edit-enforcement.md) — 4-round cap, `iterative-work-edit-guards` thrash nudges, stop after proposal, harness 135 copy |
| Model re-reads and patches incrementally despite clear single-file ask (e.g. localStorage on `script.js`) | **130**/**135** prose only; no computed scope from user text or early tool pattern | [**136**](../project_tasks/post-mvp/136-iterative-edit-scope-and-combine-heuristics.md) — `resolveIterativeEditScope`, turn-start scope block, mid-turn shape nudge (scope → thrash → discovery priority) |
| Hard to tell if **135**/**136** reduced iterative thrash | Turn traces lack routing/nudge/round metrics | [**137**](../project_tasks/post-mvp/137-iterative-work-edit-harness-observability.md) — `harnessMetrics` on turn trace + dev log line **(done)** |
| Iterative Work S&R retry loop burns budget before strategy switch | **116** global thresholds; no hard block after escalation on `iterativeWorkEdit` | [**138**](../project_tasks/post-mvp/138-iterative-work-search-replace-escalation.md) — 1-failure escalate, post-nudge S&R block, force-final at 3 **(done)** |
| First-attempt `search_replace` misses on localized UI edits (guessed `old_string`) | **138** recovers after failure; generic tool desc and terse not-found errors | [**139**](../project_tasks/post-mvp/139-iterative-work-search-replace-quality-guidance.md) — iterative S&R quality appendix, tool override, pre-sample nudge, richer not-found hints **(done)** |
| S&R failure loop / `maxToolIterationsHit` opaque in dogfood | Trace has boolean only; escalation state scattered in activity | [**140**](../project_tasks/post-mvp/140-search-replace-failure-loop-observability.md) — `harnessMetrics.searchReplace` + `maxIterationsReason` + budget activity row **(done)** |
| Iterative Work policy sprawl (130–140); post-plan lacked caps/stop | Parallel nudges, prompts, scope mid-turn, pre-sample, tool overrides | [**144**](../project_tasks/post-mvp/144-consolidate-incremental-work-edit-policy.md) — `incremental-work-edit-policy.ts`, one mid-turn gate, shared `incrementalEditEnforcement` **(done)** |

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

**Related pre-harness edit wave (closed):** [**090**](../project_tasks/post-mvp/090-agent-edit-architecture-v2.md) epic delivered via **082–088**, **091–096**.

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
| **Automated** | Mocked agent-loop regressions (profiles, toolsets, contracts, greenfield execute / partial-batch recovery **124**, command plan-verify **126**, scaffold manifest **127**, scaffold strategy **128**, scaffold conflict hygiene **131**, plan verification commands **132**, static Todo Plan → Execute **133**, conflict recovery honesty **134**) | `npm run test:agent-eval` → [`agent-runner-evaluation.test.ts`](../src/main/agent-runner-evaluation.test.ts), tags in [`agent-eval-tags.ts`](../src/shared/agent-eval-tags.ts) |
| **Foundation** | First deterministic eval harness | [**063**](../project_tasks/063-agent-evaluation-suite-and-smartness-regressions.md) |
| **Manual** | Dual-model smoke flows (plan, execute, cancel, offload, etc.) | [`harness-eval-checklist.md`](harness-eval-checklist.md) |

**Policy:** Changing [`agent-harness-profile.ts`](../src/shared/agent-harness-profile.ts), [`agent-profile.ts`](../src/shared/agent-profile.ts), [`agent-turn-routing.ts`](../src/shared/agent-turn-routing.ts), or [`agent-final-answer-contract.ts`](../src/shared/agent-final-answer-contract.ts) requires updating eval tests (and the checklist when behavior-visible).

**Research (implementation comparison):** [`research/agentic-coding-harnesses.md`](research/agentic-coding-harnesses.md) — OpenCode, Hermes, Pi, T3.

---

## See also

- [`i-am-a-harness.md`](i-am-a-harness.md) — textbook (agent vs model, patterns, backlog synthesis).
- [`AGENTS.md`](../AGENTS.md) — contributor guide and agent-chat implementation reference.
- [`project_tasks/README.md`](../project_tasks/README.md) — full post-MVP table and backlog order.
