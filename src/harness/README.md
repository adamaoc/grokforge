# GrokForge Harness

This folder is the runtime home for the GrokForge coding-agent harness.

The mental model mirrors the smaller `ampnet-harness` shape, with a few GrokForge-specific areas for desktop UX, plan mode, diff review, and safety policy.

## Start Here

- `ipc/` receives renderer requests and emits chat/activity events back to the UI.
  - `agent-chat-ipc.ts` — `agent-chat-start` / cancel / approval IPC wiring
- `loop/` owns one agent turn: prepare context, run model/tool rounds, decide harness interventions, and stream the final answer.
  - `turn-state.ts` — mutable `AgentTurn` state for loop extraction
  - `turn-setup.ts` — turn bootstrap (profiles, routing, initial messages)
  - `provider-round.ts` — one model sample + tool-call batch
  - `tool-iteration.ts` — tool round loop boundaries
  - `harness-decisions.ts` — mid-turn nudges, guards, force-final triggers
  - `final-answer.ts` — streaming final response
  - **Note:** `src/main/agent-runner.ts` is still the live orchestrator (~2.7k lines); loop modules are extracted helpers it will grow into.
- `agent/` owns provider-facing model transport and shared agent helpers.
  - `chat-model-transport.ts` — xAI Chat Completions transport
  - `content-hash.ts` — edit staleness / content-hash helpers
- `tools/` owns tool definitions, tool execution, command execution, and workspace read/search/list behavior.
  - `contracts/` — tool schemas, execution context types, `run_command` contract (renderer-safe via `contracts/index.ts`)
  - `helpers/scaffold-command.ts` — scaffold command construction + post-CLI verification
  - `workspace-tools.ts` — tool schemas, read/list/search, retrieval helpers
  - `tool-executor.ts` — dispatches tool calls in the agent loop
  - `execution-context-builder.ts` — per-call execution context for tools
  - `write-batch.ts` — apply/undo structured write batches (IPC path)
  - `run-command-tool.ts` / `run-command.ts` — guarded shell execution
- `profiles/` owns the two profile axes and how they compose per turn.
  - `contracts/toolset.ts` — named tool bundles (`read_only`, `edit`, `command`, `full`)
  - `contracts/harness-profile-key.ts` — xAI model id → harness profile key (renderer-safe)
  - `agent-profile.ts` — phase-based tool access (`default`, `planner`, `executor`, `explorer`)
  - `harness-profile.ts` — per-model system prompt sections, tool-loop rules, voice appendix
  - `reasoning-effort.ts` — Grok 4.3 `reasoning_effort` policy
- `context/` — retrieval, workspace indexes, pins, active context, prompt assembly, and greenfield detection.
- `compaction/` — tool-result offload, turn snapshots, thread memory, and context budget/offload policy.
- `diff/` — edit proposals, search-replace, fuzzy matching, and proposal quality.
- `logger/` owns traces, metrics, eval recording helpers.
  - `turn-trace-builder.ts` / `turn-trace-store.ts` — persisted turn traces
- `session/` owns persisted turn/session artifacts.
  - `turn-receipt-store.ts` / `write-history-store.ts` — turn receipts and write history
  - Subagent child session JSONL lives under `subagent/session-store.ts` (re-exported here for compatibility).
- `subagent/` owns bounded child agent runs.
  - `runner.ts` — read-only explorer child session loop
  - `session-store.ts` — child session JSONL persistence
  - `contracts/` — spawn args, result artifacts, routing, IPC event shapes
- `routing/` owns model intent, turn routing, scaffold strategy, command intent, and edit-routing heuristics.
  - `model-router.ts` — manifest intent → xAI model id (renderer-safe)
  - `turn-routing.ts` — per-turn model + profile + reasoning effort matrix
  - `scaffold-strategy.ts` / `command-intent.ts` — greenfield scaffold and CLI vs edit signals
  - `iterative-work-edit.ts` / `iterative-edit-scope.ts` / `populated-workspace-edit.ts` — Work-mode edit routing (129–136)
- `plan/` owns `gf-plan`, plan artifacts, approve-and-run, and plan verification.
  - `contracts/` — `gf-plan` fence schema, parsing, stored artifact shapes (renderer-safe)
  - `verification/` — greenfield plan verify command suggestions and nudges
  - `routing/` — post-plan incremental follow-up heuristics (story 120)
  - `store/` — persisted `plans/<planId>/plan.json` + markdown mirror
- `policy/` owns guardrails, nudges, command policy, and edit discipline.
  - `command/` — `run_command` hard-deny, soft-risk, and approval tiers
  - `edit/` — read-before-write, safety analysis, cascade guards, creation recovery, single-file HTML intent
  - `quality/` — code quality contract injected into executor prompts
  - `final-answer/` — harness nudges, honesty markers, and final-answer contract assembly
  - `incremental/` — iterative Work edit caps, merged harness copy, mid-turn nudges

## Migration status

| Cluster | Status |
|---------|--------|
| `tools/`, `subagent/`, `routing/`, `profiles/`, `policy/`, `plan/`, `compaction/`, `context/`, `diff/` | **Migrated** — implementations live here; old paths are one-line shims |
| `agent/`, `logger/`, `session/`, `ipc/`, `loop/` | **Partially migrated** — key leaf modules moved; orchestration still in `agent-runner.ts` |

## Remaining work

What still isn't migrated — highest-value next moves and loose ends:

| Area | State |
|------|--------|
| **`agent-runner.ts`** | Still the heart of the turn loop (~2.7k lines). Only a few direct `harness/` imports (tools); most imports still go through `shared/` shims. |
| **`loop/`** | Skeleton modules exist (`turn-setup`, `harness-decisions`, etc.); runner has not been rewired to use them as the primary flow. |
| **Tests** | Still colocated at old paths (`src/shared/*.test.ts`, `src/main/*.test.ts`). Fine via shims; not yet under `src/harness/`. |
| **`AGENTS.md`** | Still references many `src/shared/agent-*` paths by name (accurate via shims; does not point newcomers at harness paths). |
| **Shared harness-adjacent modules** | `agent-activity-display`, `agent-harness-metrics`, `agent-eval-tags`, etc. still in `src/shared/` — some intentionally cross-cutting, not yet clustered. |

Suggested order for the next migration passes:

1. **`agent-runner.ts` → `loop/`** — rewire the orchestrator onto the extracted loop modules now that surrounding clusters are in place.

## Import conventions

- **Inside `src/harness/`:** import sibling clusters directly (e.g. `../routing/turn-routing`, `../policy/edit/cascade-guard`).
- **Renderer / preload / legacy main:** keep using `src/shared/*` and `src/main/agent-*` shims — they re-export from `src/harness/`.
- **Renderer-safe barrels:** use cluster `contracts/index.ts` (e.g. `tools/contracts/`, `profiles/contracts/`, `plan/contracts/`, `subagent/contracts/`) — avoid importing top-level cluster `index.ts` when it pulls Node-only runtime (e.g. full `tools/index.ts`).

## Migration notes

During the restructure, old `src/main/agent-*` and `src/shared/agent-*` paths remain as compatibility shims. Prefer adding new implementation code under `src/harness/` and updating harness-internal imports first; migrate external call sites in small batches.

When moving renderer-facing contracts into harness, keep a stable re-export at the old `src/shared/` path unless you are deliberately breaking the preload/renderer boundary.
