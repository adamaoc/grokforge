# 104 — Agent profiles and toolsets (permission envelopes)

**Status:** Post-MVP backlog.

**Design skill:** N/A (main agent loop); optional renderer badge “Planner” / “Executor” on activity rows (**098** may consume).

**Depends on:** **[103](103-agent-harness-per-model-profiles.md)** (profiles tune copy; this story tunes **capabilities**).

**Blocks:** **[097](097-model-routing-planner-vs-executor.md)**, **[098](098-planning-mode-execute-ux-polish.md)** (UI can show profile phase).

## Why this story exists

Plan vs fast mode today is enforced mainly by **prompts** and **`buildFinalAnswerContract`** (**099**). OpenCode’s lesson: **agent profiles** bundle prompt + **which tools exist** + **permission rules** — e.g. `plan` agent **denies** `edit` tools at the registry, not “please don’t edit” in text.

Without this, models can still call `propose_file_edits` during plan investigation turns, wasting tokens and breaking user trust.

Reference: [`docs/i-am-a-harness.md`](../../docs/i-am-a-harness.md) § Implementation reference — agent profiles; OpenCode `Agent.Info` in research doc.

## Goals

### 1. `AgentProfile` type (shared)

`src/shared/agent-profile.ts`:

```ts
type AgentProfileId = 'default' | 'planner' | 'executor' | 'explorer'

type AgentProfile = {
  id: AgentProfileId
  allowedTools: AgentToolName[]  // or toolset ids
  deniedTools: AgentToolName[]
  maxToolRounds?: number
  canProposeEdits: boolean
  canRunCommand: boolean
}
```

Map **product phase** → profile:

| User-visible phase | `chatMode` / trigger | `AgentProfileId` |
| --- | --- | --- |
| Normal chat | `fast`, default | `default` |
| Plan investigation | `plan` | `planner` |
| Approve and run / execute line | `fast` + synthetic execute (**069**) | `executor` |
| Optional: read-only exploration sub-turn | future | `explorer` |

### 2. Toolset registry

`src/shared/agent-toolset.ts` — named bundles:

| Toolset | Tools |
| --- | --- |
| `read_only` | `workspace_index`, `list_directory`, `read_file`, `search_workspace` |
| `edit` | `propose_file_edits` (includes search_replace path) |
| `command` | `run_command` |
| `full` | union for default/executor |

`planner` profile = `read_only` only (no `edit`, no `command` in v1 plan turns).

`executor` profile = `read_only` + `edit` + `command` (approvals unchanged).

### 3. Runner integration

- **`agent-runner.ts`** — At turn start, compute `agentProfileId` from `activeContext.chatMode`, `isApprovedPlanAutoRun`, etc.
- When building xAI tools array, **filter** tools not in profile (do not send schema to model).
- If model somehow emits disallowed tool (provider glitch), return structured error tool result: `Tool not available in planner profile`.
- **`buildFinalAnswerContract`** — receives `agentProfileId`; planner forbids edit fence (align **099**).

### 4. Cross-profile + per-model harness

Matrix per turn:

```
resolvedModelId → harnessProfileKey (103)
agentProfileId (104)
chatMode (062)
→ buildInitialMessages({ harnessProfile, agentProfile, chatMode })
→ filterTools(agentProfile)
```

### 5. Future: manifest overrides (optional v1)

- Defer manifest `agentProfiles` JSON unless trivial.
- Document extension point in `AGENTS.md`.

## Non-goals

- Subagent child sessions (**112**).
- Wildcard path permissions like OpenCode `permission/next` (**110** partial overlap — defer path rules).
- Replacing `run_command` human approval (**059**).

## Key files

- `src/shared/agent-profile.ts`, `agent-toolset.ts`, tests
- `src/main/agent-runner.ts` — profile resolution + tool filter
- `src/shared/agent-tool-schema.ts` — ensure tool names are enumerable for filtering
- `src/shared/agent-final-answer-contract.ts` — planner variant

## Testing

- Unit: planner profile tool list excludes `propose_file_edits` and `run_command`.
- Unit: executor profile includes edit tools.
- Integration-style: simulated tool call name not in profile → error result shape.
- Manual: Plan mode → model should not receive edit tool defs in API payload (inspect dev log).

## Acceptance criteria

- [ ] Plan mode turns do not expose `propose_file_edits` / `run_command` in the tools array sent to xAI.
- [ ] Approve-and-run execute turns use `executor` profile with edit + command tools.
- [ ] Fast chat uses `default` profile with full toolset (subject to existing approvals).
- [ ] Documented matrix in PR + `AGENTS.md`.
- [ ] `npm run typecheck` and `npm run test` pass.

## Related stories

- **[062](../062-agent-planning-and-multi-step-workflow.md)**, **[069](../069-plan-approve-auto-agent-turn.md)**, **[099](099-plan-mode-final-contract-and-toast.md)**.
- **[097](097-model-routing-planner-vs-executor.md)**, **[098](098-planning-mode-execute-ux-polish.md)**.

## Completion bookkeeping

When implemented: mark **104** done, update [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
