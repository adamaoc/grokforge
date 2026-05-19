# 102 — Dual-model manifest defaults and harness foundation

**Status:** Post-MVP backlog.

**Design skill:** N/A (defaults + manifest; optional Settings copy for model slots and harness profile hints).

**Depends on:** Nothing (first story in harness wave).

**Blocks:** **[103](103-agent-harness-per-model-profiles.md)**, **[104](104-agent-profiles-and-toolsets.md)**, **[097](097-model-routing-planner-vs-executor.md)**.

## Why this story exists

xAI [retired `grok-code-fast-1` as the dedicated coding SKU](https://docs.x.ai/developers/migration/may-15-retirement) and recommends **`grok-4.3`** for agentic coding. GrokForge was built with **`grok-code-fast-1`** on **`chat_default`** and **`execution`**, and **`grok-4.3`** on **`planning`**.

**Product decision (harness program):** We **keep both model ids** in defaults and manifests on purpose — not to ignore retirement, but to run a **dual-model harness experiment**:

| Manifest slot | Default model id | Harness role (see **103**) |
| --- | --- | --- |
| `models.default` (`chat_default`) | `grok-code-fast-1` | Fast chat + general tool loop |
| `models.execution` | `grok-code-fast-1` | Edit-heavy / approve-and-run turns |
| `models.planning` | `grok-4.3` | Plan mode investigation + `gf-plan` |
| `models.reasoning` | `grok-4.20-reasoning` (unchanged unless audit says otherwise) | Deep reasoning when used |
| `models.voice` | existing voice id | Voice realtime (**013**) |

This lets us compare **two full harness profiles** (fast vs capable) under the same app shell — the core lesson from Cursor/OpenCode: *model + harness* is one unit.

This story **does not** implement per-model prompts (**103**). It makes defaults, docs, and runtime **model id → profile key** wiring honest and testable.

## Investigation checklist (required in PR notes)

- [ ] Confirm current xAI behavior for `grok-code-fast-1`: hard error vs redirect to `grok-4.3`, pricing, reasoning defaults on redirect.
- [ ] Confirm `grok-4.3` tool-use and multi-turn behavior for our chat-completions transport.
- [ ] Audit repo references: `FALLBACK_MODELS`, `app-project-store.ts`, `example.grokproject.json`, tests, `AGENTS.md`, `docs/i-am-a-harness.md`.
- [ ] Document **when to switch** a project to all-`grok-4.3` (user choice in manifest / future Settings).

## Goals

### 1. Canonical dual-model defaults

- **`src/shared/model-router.ts`** — `FALLBACK_MODELS` explicitly documents the dual-model strategy (comment + values above).
- **`src/main/app-project-store.ts`** — `defaultManifestForFirstRoot` / new projects use the same pairing.
- **`example.grokproject.json`** (if present) — reflects recommended dual-model block.

### 2. Harness profile key resolution (stub for **103**)

Add a small shared helper, e.g. `resolveHarnessProfileKey(modelId: string): HarnessProfileKey`:

- `'grok-code-fast-1'` → `'grok_code_fast'`
- `'grok-4.3'` → `'grok_4_3'`
- Unknown ids → `'generic'` (single safe default profile until **103** adds more)

Export types from `src/shared/agent-harness-profile-contract.ts` (new). **103** fills profile content; **102** only defines keys + resolver + tests.

### 3. Turn metadata for debugging

- When starting an agent turn, include in trace/log (dev) or `AgentChatEvent` metadata: `{ modelId, harnessProfileKey, modelIntent }`.
- Renderer model chip (**065**) may show profile label in dev builds only (optional).

### 4. Contributor and user documentation

- **`AGENTS.md`** — “Model vs harness”; dual-model defaults; link to **`docs/i-am-a-harness.md`** and harness roadmap (**111**).
- **`docs/i-am-a-harness.md`** — Update “Grok models for coding” table: we **intentionally** keep fast id for execution; retirement/redirect is documented, not hidden.

### 5. Existing projects

- **No forced migration** away from `grok-code-fast-1`.
- Optional: on project load, if manifest uses only retired ids and API errors, toast once with link to Settings/manifest docs (only if investigation proves hard failures).

## Non-goals

- Per-model system prompts, tool descriptions, or contracts (**103**).
- Agent profiles / tool allowlists (**104**).
- Changing phase routing logic (**097**).
- Removing `grok-code-fast-1` from the codebase.

## Architecture notes

```
manifest.models.execution → getModelForIntent(..., 'execution') → modelId
       → resolveHarnessProfileKey(modelId) → harnessProfileKey (102)
       → getHarnessProfile(harnessProfileKey) (103)
       → buildInitialMessages / tool schemas / final contract
```

Renderer may continue passing `model` on `agentChatStart`; main should **re-resolve** intent → model → profile for consistency when **097** lands.

## Key files

| Area | Files |
| --- | --- |
| Defaults | `src/shared/model-router.ts`, `src/main/app-project-store.ts` |
| Profile key | `src/shared/agent-harness-profile-contract.ts` (new), `*.test.ts` |
| Logging | `src/main/agent-runner.ts`, `src/shared/agent-chat-contract.ts` (metadata fields if needed) |
| Docs | `AGENTS.md`, `docs/i-am-a-harness.md` |

## Testing

- Unit: `resolveHarnessProfileKey` for known ids + unknown fallback.
- Unit: new project manifest matches dual-model table.
- Manual: create project → verify manifest in `userData`; run one fast chat and one plan turn; confirm logged `harnessProfileKey` differs when model id differs.

## Acceptance criteria

- [ ] PR notes document xAI redirect/error behavior for `grok-code-fast-1`.
- [ ] New projects default to **fast on default/execution**, **4.3 on planning** (unless investigation forces a doc-only warning).
- [ ] `resolveHarnessProfileKey` exists and is used at turn start (metadata/log).
- [ ] `AGENTS.md` and harness doc describe dual-model **harness** strategy (not “migrate everything to 4.3”).
- [ ] `npm run typecheck` and `npm run test` pass.

## Related stories

- **[103](103-agent-harness-per-model-profiles.md)** — profile content.
- **[097](097-model-routing-planner-vs-executor.md)**, **[012](../012-model-routing-service.md)**.
- **[111](111-harness-roadmap-and-retrospective-doc.md)** — program index.

## Completion bookkeeping

When implemented: mark **102** done, update [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
