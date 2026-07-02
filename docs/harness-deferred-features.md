# Harness v2 deferred features

GrokForge now uses the v2 harness by default. Re-enable capabilities here as deliberate PRs; do not grow the core loop ad hoc.

See [`harness-architecture.md`](./harness-architecture.md) for the runtime map.

---

## Product / UX (deferred)

| Feature | Legacy location | Notes for re-entry |
|---------|----------------|-------------------|
| **Diff review & apply** | archived proposal IPC, diff UI, `write-batch.ts` | Wire `write_file` → optional proposal mirror first |
| ~~**Plan mode & `gf-plan`**~~ | `plan/`, Plan composer, story 109 | **Shipped** — v2 uses `TurnMode.plan`, read-only plan tools, and `gf-plan` output |
| ~~**Approve and run**~~ | `isApprovedPlanAutoRun`, executor-from-plan | **Shipped** — approve-and-run routes to Work execution with approved plan injection |
| ~~**`run_command` + approval**~~ | `harness/tools/run-command.ts` + `main/agent/command-approval.ts` | **Shipped** — thin adapter over harness-support |
| **Subagents (`spawn_subagent`)** | `subagent/` | ampnet had `delegate` |
| **Voice handoff** | `voice-realtime.ts`, voice profiles | Independent |
| **Proposal reviewer** | `agent-proposal-reviewer.ts` | Post-diff |
| **Edit safety banners / pre-apply warnings** | renderer + `policy/edit/safety-warnings` | With diffs |
| **Trust mode / auto-apply** | settings + apply path | With diffs |
| **Activity compaction / issue cards** | `agent-activity-display.ts` | UX polish |

---

## Tools (deferred)

| Tool | Why deferred |
|------|----------------|
| `workspace_index` | Use `list_files` for v0 |
| `list_directory` (GrokForge name) | Harness v2 uses ampnet name `list_files` |
| `search_workspace` | Add when search is needed |
| `search_replace` (legacy alias) | Use `edit` instead |
| **Direct `edit` with proposals** | Harness v2 has **`edit`** (immediate disk); diff review is deferred |
| `propose_file_edits` | Proposal pipeline; harness v2 writes directly |
| ~~`run_command`~~ | Shipped in harness v2 (GFAPP-007) |
| `spawn_subagent` | Child sessions |

---

## Routing & profiles (deferred)

| Feature | Legacy location | Notes for re-entry |
|---------|----------------|-------------------|
| Multiple agent profiles (`planner`, `executor`, `default`, `explorer`) | `profiles/agent-profile.ts` | Deferred beyond v2's Work/Plan profile split |
| Per-model harness profiles (`grok_code_fast`, `grok_4_3`) | `profiles/harness-profile.ts` | Routing emits `harnessProfileKey`; per-model prompt sections remain deferred |
| Post-plan incremental auto-routing | `plan/routing/post-plan-incremental.ts` |  |
| Iterative Work edit enforcement | `routing/iterative-work-edit.ts`, `policy/incremental/` |  |
| Greenfield / scaffold strategy | `routing/scaffold-strategy.ts` |  |
| ~~Model intent chips (planning / execution)~~ | `routing/turn-routing.ts` | **Shipped** — renderer sends `modelIntent`; main/v2 resolves canonical `turn_started.routing` and runs the resolved model |
| Harness mid-turn nudges (20+ kinds) | `policy/`, `agent-runner.ts` |  |

Harness v2 uses Work and Plan profiles under `src/harness/profile/`. Model/profile routing
is centralized in `turn-routing.ts`; the Work profile still carries the mutating toolset.

---

## Context & retrieval (deferred)

| Feature | Legacy location |
|---------|----------------|
| **Multi-root workspace** | `manifest.roots[]`, active root switching | **High priority** — v2 currently uses **one** root (active or first) |
| Lexical retrieval / pins / attachments | `context/retrieval.ts`, pins, staging |
| Thread memory compaction store | `compaction/thread-memory-store.ts` |
| Tool result offload | `compaction/tool-result-offload.ts` |
| Turn snapshots for provider | `compaction/turn-snapshot.ts` |
| Content-hash stale guards | `agent/content-hash.ts` |
| Ignore globs (partial) | Not applied in minimal tools yet — add in `paths.ts` |
| Sensitive path denylist | `workspace-tools.ts` `isLikelySensitivePath` |

---

## Observability (partial in v2, rest deferred)

| Feature | Harness v2 | Archived legacy |
|---------|------------|-------------|
| JSONL event log per stream | Yes — `logger.ts` → `minimal/logs/` | traces + receipts |
| Console `[harness]` lines | Yes | `[GrokForge agent-runner]` |
| Token usage per model step | Yes — logged on each API call | turn traces |
| **Exact system + user messages in UI** | Logged sizes + step counts; **full text in log file** on `context_snapshot` / future inspector | turn snapshot |
| Turn trace inspector UI | Deferred | `AgentTurnTraceInspector` |
| Harness metrics / eval tags | Deferred | `agent-runner-evaluation.test.ts` |

See [`PROMPT-VISIBILITY.md`](./PROMPT-VISIBILITY.md) for what we log now vs later.

---

## Persistence (deferred / different path)

| Feature | Minimal v0 | Legacy |
|---------|------------|--------|
| Chat `thread.jsonl` UI thread | End of turn via main (if wired) | full pipeline |
| Turn receipts | No | `turn-receipt-store.ts` |
| Plan artifacts on disk | Still exist but ignored by minimal | `plan/store/` |
| Write history / undo batches | No | `session/write-history-store.ts` |

---

## Suggested re-entry order

1. **Multi-root** path resolution + tool descriptions (same as legacy guard)
2. **Ignore globs + sensitive paths** on read/write/list
3. **Diff proposals** optional layer on `write_file`
4. Retrieval / pins (only if needed)
