# 169 — Harness v2: promote minimal loop, remove legacy harness

**Status:** Not started.

**Priority:** **Critical** — field validation (2026-06-04/05, GrokForgeMini-ToDo-app): the experimental **`GROKFORGE_MINIMAL_HARNESS=1`** path completed greenfield → iterate → split-files with **zero tool failures**, while the legacy **`agent-runner.ts`** loop (~3k lines + `src/harness/{loop,plan,policy,routing,...}`) routinely mis-routed, capped, or stalled on the same tasks. This story **makes the minimal implementation the only harness** (no “minimal” naming, no feature flag, no duplicate code paths).

**Design skill:** N/A for harness deletion; **styleguide-design** only if renderer changes touch chat chrome (edit-proposal removal, activity labels, trace inspector).

**Depends on:** Proven on branch `harness-minimal` (see [`src/harness/minimal/`](../../src/harness/minimal/)). **Does not depend on** completing post-mvp **166–168** (legacy routing fixes become **obsolete** when legacy is deleted).

**Out of scope (follow-up stories after 169 ships):** items in deferred-features doc (multi-root agent paths, diff review UI, plan mode, `run_command`, subagents, full prompt inspector). UI fixes (editor reload after write, file tree refresh) may land in parallel but are **not** blockers for deleting legacy code.

---

## Charter

| Principle | Rule |
|-----------|------|
| **One harness** | Single tool loop, single system prompt builder, single turn runner. No `isMinimalHarnessEnabled()`, no `GROKFORGE_MINIMAL_HARNESS`. |
| **No “minimal” in product paths** | Rename module tree and app-data dirs (`minimal/logs` → `harness/logs`). |
| **Delete, don’t shim** | Remove legacy files; do not leave `*-legacy.ts` re-exports “for later.” Git history is the archive. |
| **Keep shared primitives** | Retain **`harness/diff/`** (fuzzy edit), **`harness/agent/content-hash.ts`**, and anything the new **`edit`** tool imports. Delete orchestration built only for proposals/plan/routing. |
| **Docs live in `docs/`** | Move research/visibility/deferred markdown out of `src/harness/minimal/` into [`docs/`](../../docs/). Code README stays one short pointer in `src/harness/README.md`. |
| **Tests match reality** | Drop or rewrite eval suites that assert legacy routing/nudges; add harness-v2 smoke tests for greenfield + edit chain. |

---

## Target architecture (end state)

```
src/harness/
  README.md                 # short map → docs/harness-architecture.md
  index.ts                  # public exports
  loop.ts                   # was minimal/loop.ts
  run-turn.ts               # was minimal/run-minimal-turn.ts
  tools.ts                  # list_files, read_file, write_file, edit
  edit-tool.ts
  profile.ts                # WORK_PROFILE, system prompt, routing metadata for IPC
  paths.ts
  session.ts
  logger.ts
  compaction.ts
  model-client.ts
  config.ts                 # MAX_TOOL_ITERATIONS only (no feature flag)
  diff/                     # KEEP (edit-fuzzy, search-replace, search-replace-tool schema)
  agent/
    content-hash.ts         # KEEP
src/main/
  agent-runner.ts           # THIN (~200–400 lines): IPC, emit, runTurnJob → harness.runTurn
```

**App data (per project):**

```
userData/workspace-projects/<projectId>/harness/
  logs/<streamId>.jsonl
  sessions/<streamId>.jsonl   # optional; revisit if thread-only is enough
```

---

## Phase 0 — Inventory & branch hygiene

1. On branch `harness-minimal` (or successor `harness-v2`), run `git diff main --stat` and produce a **delete list** vs **promote list** (check into `docs/harness-v2-migration-inventory.md` during Phase 0, delete that scratch doc at end of 169 or fold into architecture doc).

2. Grep for imports of legacy harness from `src/main/`, `src/renderer/`, `src/shared/`, `e2e/`:

   | Area | Expected legacy touchpoints |
   |------|----------------------------|
   | Main | `agent-runner.ts`, `agent-turn.ts`, `agent-turn-receipt-*`, `voice-realtime.ts` (harness profiles), write-batch IPC |
   | Renderer | `edit_proposal` phase, plan execute, command approval, subagent activity, turn trace inspector |
   | Shared | `agent-chat-contract.ts` tool names, routing types, proposal schemas |
   | Tests | `agent-runner-evaluation.test.ts`, `src/shared/agent-*.test.ts` (30+ files) |

3. Confirm greenfield + edit session still passes manually (Todo app arc from field report).

**Exit:** Signed-off inventory; no code moves yet.

---

## Phase 1 — Promote & rename (no legacy delete yet)

Move `src/harness/minimal/*` → `src/harness/` (top-level files). Update all imports.

| Old | New |
|-----|-----|
| `runMinimalAgentTurn` | `runAgentHarnessTurn` or `runTurn` |
| `MinimalHarnessLogger` | `HarnessLogger` |
| `MinimalSession` | `HarnessSession` |
| `executeMinimalTool` | `executeTool` |
| `WORK_PROFILE` | `WORK_PROFILE` (unchanged id) |
| `MINIMAL_MAX_TOOL_ITERATIONS` | `HARNESS_MAX_TOOL_ITERATIONS` |
| `isMinimalHarnessEnabled` | **delete** |

**Storage path migration** in `run-turn.ts`:

- Write new logs to `harness/logs/`.
- Optional one-release read fallback from `minimal/logs/` (or document “old logs orphaned” — prefer clean break if no users in prod).

**Rename test file:** `minimal-tools.test.ts` → `harness-tools.test.ts`.

**Temporary:** Keep legacy `agent-runner.ts` path behind flag until Phase 2 completes (or flip default immediately if team agrees).

**Exit:** `npm run typecheck` + `npm run test` green; `dev` runs new harness without env flag.

---

## Phase 2 — Thin `agent-runner.ts`

Replace the body of `runAgentTurn` / `runTurnJob` with harness v2:

1. **Keep in `agent-runner.ts` (or `agent-chat-ipc.ts`):**
   - IPC handlers (`agent-chat-start`, cancel, capabilities)
   - `emit` / `emitActivity` to renderer
   - `activeTurns` / AbortController registry
   - E2E mock hooks (`GROKFORGE_E2E_AGENT_REPLY`) wired into harness deps
   - `getCurrentProject()` guard
   - Timeout wrapper (use `HARNESS_MAX_TOOL_ITERATIONS` for budget, not legacy incremental caps)

2. **Remove from `agent-runner.ts` imports and code:**
   - Entire legacy tool loop (`for (maxToolIterations)`, nudges, `completeTurnWithFinalStream` contract stack)
   - `buildChatSystemPrompt`, lexical retrieval injection, plan artifacts, `edit_proposal` emit
   - Turn trace scratch that legacy never filled in minimal mode (either wire harness logger → trace store in Phase 4 or remove empty traces)

3. **Target size:** `agent-runner.ts` ≤ **400 lines**; all turn logic in `harness/run-turn.ts` + `harness/loop.ts`.

**Exit:** `GROKFORGE_MINIMAL_HARNESS` removed from `package.json` (`dev:minimal` → delete or alias to `dev`). Single code path.

---

## Phase 3 — Delete legacy harness tree

Delete directories/files that exist **only** for legacy orchestration (verify zero imports after Phase 2):

### Delete entirely

```
src/harness/loop/           # turn-setup, harness-decisions, final-answer, provider-round, ...
src/harness/plan/           # gf-plan, plan-store, post-plan-incremental, verification
src/harness/policy/         # incremental, cascade-guard, final-answer-contract, creation-recovery, ...
src/harness/routing/        # turn-routing, iterative-work-edit, scaffold-strategy, model-router (agent)
src/harness/profiles/       # agent-profile, harness-profile, toolsets (replace with profile.ts)
src/harness/subagent/
src/harness/ipc/            # if duplicated in main; keep one IPC home
src/harness/session/        # write-history-store, turn-receipt-store, subagent-session (agent-specific)
src/harness/logger/         # turn-trace-builder, turn-trace-store (replace with harness/logger.ts or Phase 4 bridge)
src/harness/compaction/     # turn-snapshot, offload, thread-memory (legacy provider snapshots)
src/harness/context/        # agent retrieval, greenfield sections, bootstrap prompts (NOT workspace index if used elsewhere — see keep list)
src/harness/tools/          # workspace-tools, tool-executor, run-command, write-batch, execution-context-builder
src/harness/agent/chat-model-transport.ts   # replaced by harness/model-client.ts
src/main/agent-turn.ts      # legacy mutable turn state
src/main/agent-turn-receipt-lifecycle.ts
src/main/agent-turn-receipt-store.ts
```

### Keep (relocate if needed)

| Path | Reason |
|------|--------|
| `src/harness/diff/edit-fuzzy.ts` | `edit-tool.ts` |
| `src/harness/diff/search-replace.ts` | legacy single-edit path in edit-tool |
| `src/harness/diff/search-replace-tool.ts` | `SearchReplaceToolArgsSchema` |
| `src/harness/diff/proposal-quality.ts` | destructive shrink guard (if edit-tool uses it — else trim) |
| `src/harness/agent/content-hash.ts` | read/edit hashing |
| `src/main/workspace-path-guard.ts` | paths.ts uses it |
| `src/main/ignore-globs.ts` | future: wire into tools.ts (deferred) |

### Diff / proposal UI pipeline

Delete or stub renderer + main IPC for **apply proposal** only if no other feature needs `write-batch.ts`. If git diff viewer still needs write-batch for manual apply, **delete agent proposal path** but keep low-level fs write helpers in `src/main/` if editor uses them.

**Explicit deletes in renderer (grep-driven):**

- `edit_proposal` event handling / diff review cards in chat (hide or remove components)
- Plan “Approve and run” execute handoff that assumed legacy executor
- Command approval modal (no `run_command` in v2)
- Subagent nested activity
- Harness intervention copy tied to nudges that no longer exist

**Exit:** `rg "harness/loop|harness/plan|tool-executor|runMinimal|isMinimalHarness"` returns **zero** in `src/` (except `docs/` and `project_tasks/`).

---

## Phase 4 — Shared contracts & tests

### `src/shared/agent-chat-contract.ts`

- Simplify `AgentChatToolName` to v2 set: `list_files`, `read_file`, `write_file`, `edit` (drop `propose_file_edits`, `search_replace`, `spawn_subagent`, `run_command`, …) **or** keep union members as deprecated unused until renderer cleaned — prefer **delete unused** in same PR.
- `AgentChatTurnRouting`: keep for UI chips but populate from `profile.ts` (`modelId`, `agentProfileId: 'executor'`, `harnessProfileKey` from model map).
- Remove / stub event phases: `edit_proposal`, `command_approval_required`, `subagent`.

### Tests

| Action | Files |
|--------|-------|
| **Delete** | `src/main/agent-runner-evaluation.test.ts` (legacy routing matrix), bulk of `src/shared/agent-*` tests tied to proposals/plan/routing |
| **Keep & move** | `src/harness/harness-tools.test.ts` |
| **Add** | `src/harness/run-turn.test.ts` (mock model client): greenfield write, read→edit, stale-hash chain |
| **Update** | `e2e/` smoke: agent chat completes without `edit_proposal` phase |

### Voice (`voice-realtime.ts`)

- Remove imports of legacy `buildChatSystemPrompt` / harness profiles.
- Point voice agent at **`buildHarnessSystemPrompt`** (same as text chat) or document voice **off** until re-wired (acceptable short-term if voice is dev-only).

**Exit:** `npm run test` + `npm run test:agent-eval` replaced by `npm run test:harness` (new script, 3–5 tests).

---

## Phase 5 — Docs consolidation

Move from `src/harness/minimal/` → `docs/`:

| Source | Destination |
|--------|-------------|
| `DEFERRED-FEATURES.md` | [`docs/harness-deferred-features.md`](../../docs/harness-deferred-features.md) |
| `PROMPT-VISIBILITY.md` | [`docs/harness-prompt-visibility.md`](../../docs/harness-prompt-visibility.md) |
| `minimal/README.md` (architecture) | [`docs/harness-architecture.md`](../../docs/harness-architecture.md) |

Update / replace:

| File | Action |
|------|--------|
| [`src/harness/README.md`](../../src/harness/README.md) | **Replace** with ~40 lines: module map + links to `docs/harness-*.md` |
| [`src/harness/tools/TOOLS.md`](../../src/harness/tools/TOOLS.md) | **Delete** or archive to `docs/research/legacy-harness-tools-reference.md` |
| [`docs/harness-roadmap.md`](../../docs/harness-roadmap.md) | Add “v2 shipped” section; mark Waves 1–3 items **superseded by 169** where applicable |
| [`docs/field-reports/grokforge-todoapp-comparison.md`](../../docs/field-reports/grokforge-todoapp-comparison.md) | Add pointer to v2 session logs |

Remove all references to `GROKFORGE_MINIMAL_HARNESS`, “minimal harness”, and “legacy harness” in user-facing docs (use **GrokForge harness** or **harness v2**).

**Exit:** No markdown under `src/harness/minimal/`; folder deleted.

---

## Phase 6 — Manifest & project defaults

1. **`app-project-store.ts`:** Update default `customInstructions` to match v2 (direct tools, no diff-review prose). Harness **may** optionally read a future `context.harnessInstructions` — default should not contradict tools.

2. **Plan artifacts on disk:** Stop writing new plans from chat until plan mode returns; **do not** delete existing `userData/.../plans/` (orphan data is fine).

3. **Workspace index** (`context/index-store` if kept in main): Retain for file tree / search UI if independent of agent retrieval; remove agent auto-retrieval injection.

---

## Phase 7 — Backlog hygiene

Mark **obsolete** (do not implement on legacy — cancel or add “superseded by 169” banner):

- **166–168** (search_replace alias, post-plan nudge, greenfield routing) — routing under test no longer exists
- **130–140** iterative Work / S&R escalation — replaced by simple loop + `edit`
- **105–107** turn snapshots / offload — revisit as new observability story if needed
- **109, 120** plan execute routing — plan mode is deferred, not legacy fix

Add **new** post-169 backlog items (separate stories, not part of 169):

| ID | Topic |
|----|--------|
| TBD | Multi-root path resolution in `paths.ts` |
| TBD | Editor + file tree refresh after `write_file` / `edit` |
| TBD | Harness trace inspector UI (read `harness/logs`) |
| TBD | Plan mode reintroduction on v2 loop |
| TBD | Optional diff review layer on direct writes |

---

## Acceptance criteria

1. **`npm run dev`** starts app; agent chat uses **only** `src/harness/{loop,run-turn,tools,...}` — no env flag.
2. **Greenfield smoke:** empty folder → user asks for todo app → `index.html` (or multi-file) on disk, chat `done` phase, no `edit_proposal`.
3. **Edit smoke:** `read_file` → `edit` → success; chained edits on same file without spurious stale failure (regression test).
4. **Logs:** `.../harness/logs/<streamId>.jsonl` with `context_snapshot`, `model_step`, `tool` events.
5. **Repo grep:** no `src/harness/minimal`, no `isMinimalHarnessEnabled`, no `tool-executor.ts`, no `agent-runner` tool loop >500 lines.
6. **Docs:** `docs/harness-architecture.md`, `docs/harness-deferred-features.md`, `docs/harness-prompt-visibility.md` exist; `src/harness/README.md` links to them.
7. **Tests:** CI green; legacy eval suite removed or replaced.

---

## Suggested implementation order (single PR or stacked PRs)

| PR | Contents | Risk |
|----|----------|------|
| **PR1** | Phase 1 rename + path migration + default flag on | Low |
| **PR2** | Phase 2 thin runner; delete flag | Medium |
| **PR3** | Phase 3 legacy tree delete + renderer stub removal | High — largest diff |
| **PR4** | Phase 4 tests + shared contract trim | Medium |
| **PR5** | Phase 5–7 docs + backlog + manifest default | Low |

Prefer **stacked PRs** over one 10k-line delete for reviewability.

---

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Renderer crashes on missing `edit_proposal` phase | Grep all `phase ===` handlers; provide no-op or remove UI slots in PR3 |
| E2E relied on proposal apply | Update fixtures to expect direct writes |
| Voice breaks | Document “text chat only” until voice rewired; gate voice menu if needed |
| Accidental delete of diff math | `harness-tools.test.ts` + edit chain test must pass before PR3 merge |
| Users lose old `minimal/logs` | Accept break in dev; note in changelog |

---

## Reference session (validation)

Project `51a3dc42-…`, five turns, **0 tool failures** — logs under `minimal/logs/` (to become `harness/logs/`). See chat thread: create → localStorage → dark theme → clear completed → split HTML/CSS/JS.

---

## Completion bookkeeping

When this story ships:

1. Set **Status:** **Done** in this file.
2. Add row **169** to [`project_tasks/README.md`](../README.md) post-mvp table.
3. Run **`npm run stories:html`**.
4. Merge `harness-minimal` → main; delete feature branch.
5. Update [`docs/harness-roadmap.md`](../../docs/harness-roadmap.md) with v2 charter.
