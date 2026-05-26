# 126 — Agent terminal command execution (safe, reviewable, non-regressing)

**Status:** Post-MVP backlog.

**Priority:** **Higher than [127](127-greenfield-project-scaffolding-and-initialization.md)** — real project init and verification depend on approved commands; scaffolding story assumes this path is reliable.

**Design skill:** Required — read [`.cursor/skills/styleguide-design/SKILL.md`](../../.cursor/skills/styleguide-design/SKILL.md) (`@styleguide-design`) for approval cards, activity rows, Settings copy, and temperament-aware affordances.

## Why this story exists

GrokForge already ships **infrastructure** for model-requested commands (**[059](../059-agent-command-tool-approvals.md)**, **`run_command`** tool, **`run-command-policy`**, guarded spawn in **`run-command.ts`**) and a **separate human PTY terminal** (**050–054**, **053** boundaries). In practice, dogfood and field reports show a **capability gap**, not a missing IPC:

- **Greenfield and scaffold workflows** (`npm create`, `npm install`, `git init`, `npm run build`, `npx`, typecheck/test) are described in plans (**[101](101-greenfield-plan-quality.md)**) but often **never run** because the model leans on hand-written `package.json` + `propose_file_edits` alone — slower, more validation failures, and unlike Codex/Cursor velocity paths ([`docs/field-reports/codex-todoapp-comparison.md`](../../docs/field-reports/codex-todoapp-comparison.md)).
- Users happy with **existing-project edit loops** (**115–116**, **120**, **124**) report that command tooling feels **secondary**: approval UX is easy to miss, output is buried in activity, and there is no **first-class “run this step from the plan”** rhythm next to diff review.
- **Safety is correct but incomplete for product use:** every command requires approval (**059**), yet there is no **tiered policy** (e.g. allow-listed read-only diagnostics vs install/network), no **session-scoped remember** for repeated safe patterns, and no clear link between **Plan verification steps** and one-click approve.

This story **expands and productizes** agent command execution without changing the trust model for **file writes** (`propose_file_edits` / diff review / temperament **118**).

## Goals

### 1. Make command execution a first-class agent capability

- Executor / default profiles should **reach for `run_command`** when the user or approved plan asks to install, scaffold via CLI, init git, or verify (typecheck, test, build) — with harness copy that matches **file-edit** honesty (never claim a command ran without tool result).
- After a successful command that creates or changes files under a root, trigger **bounded workspace refresh** (index / tree) so the agent and user see new files without a manual reload.

### 2. Safety model (explicit, limited V1 scope)

**Default remains: human approval before every model-requested command** (preserve **059** / **053** boundary: agent ≠ human PTY).

Proposed **incremental** policy layers (ship in phases within this story or follow-up slices — document in PR):

| Tier | Examples | Behavior |
|------|----------|----------|
| **Hard deny** | `rm -rf /`, `dd` to block devices, fork bombs | Unchanged — never run (**`run-command-policy`**). |
| **Soft risk** | `sudo`, `rm -rf` under cwd, pipe-to-shell | Require explicit ack checkbox in approval UI (existing `needs_ack`). |
| **Network / install** | `npm install`, `npx`, `npm create`, `git clone`, `curl` | Always show **network/install** banner; approval required. |
| **Read-only / diagnostic** | `git status`, `node --version`, `npm run typecheck` (no install subcommand) | Approval required in V1; optional **Phase B**: project-level allow-list in Settings (off by default). |

**Non-goal for V1:** autonomous command runs without approval; PTY bridging; “Full access” velocity mode for shell (**118** velocity applies to **file** auto-apply only).

### 3. Review UX aligned with edit proposals

- Approval surface should feel as deliberate as **diff review**: command string, **cwd root** label, model **purpose**, timeout, policy tier, and **truncated output preview** after run.
- Reuse patterns from proposal cards where possible: inline chat card, **Approve / Reject**, optional **Copy to human terminal** (insert command into PTY — user runs manually).
- Activity list: compact states (`awaiting_approval` → `running` → `completed` / `failed` / `rejected` / `timeout`) with exit code; extend **119** / **125** honesty (no “success” spinners after terminal state).
- Settings (Agent): **Command approval** subsection — default “ask every time”; document threat model (trusted-developer tooling, not sandbox).

### 4. Plan → execute integration

- When **`gf-plan`** or approved-plan execute block lists a **verification** or **install** step, executor harness should emit **`run_command`** with structured purpose (not only `propose_file_edits`).
- PlanModeCard / execute outcome (**123**) should surface **pending command approvals** alongside pending file proposals (“2 files to review, 1 command awaiting approval”).
- Partial turn honesty: if edits applied but a verification command was rejected or failed, final answer and Plan card must not claim “built and verified.”

### 5. Regression prevention (mandatory)

- **No changes** to default approval requirements for **`propose_file_edits`** / **`search_replace`** / merge behavior (**069**, **115–116**).
- **No auto-run** commands when temperament is **velocity** unless user explicitly opts into a separate setting (out of scope).
- **Planner profile** stays read-only — no `run_command` on planning turns (**104**).
- Ship behind **feature flag or manifest opt-in** (`agentCommands.enabled`, default **on** only after eval pass) if needed for staged rollout.

## Scope

- [`src/main/run-command-policy.ts`](../../src/main/run-command-policy.ts) — tiered classification, tests for scaffold/install/diagnostic strings
- [`src/main/run-command.ts`](../../src/main/run-command.ts) / [`src/main/agent-run-command-tool.ts`](../../src/main/agent-run-command-tool.ts) — cwd, timeout, output caps, post-run index hook
- [`src/main/agent-runner.ts`](../../src/main/agent-runner.ts) — harness nudges when plan lists verify/install but no `run_command` sampled
- [`src/shared/agent-harness-profile.ts`](../../src/shared/agent-harness-profile.ts) — executor/greenfield execute copy: CLI scaffold + verify, not hand-rolled `package.json` only
- [`src/shared/gf-plan-contract.ts`](../../src/shared/gf-plan-contract.ts) — optional structured `verification` steps (if prompts alone insufficient)
- [`src/renderer/src/components/ChatThread.tsx`](../../src/renderer/src/components/ChatThread.tsx) — approval card polish, plan/execute pending counts
- [`src/renderer/src/components/AgentTurnToolActivityList.tsx`](../../src/renderer/src/components/AgentTurnToolActivityList.tsx) — command activity density and terminal states
- [`src/renderer/src/components/SettingsPage.tsx`](../../src/renderer/src/components/SettingsPage.tsx) — command policy copy + optional allow-list (Phase B)
- [`src/main/agent-runner-evaluation.test.ts`](../../src/main/agent-runner-evaluation.test.ts) — `behavior:run_command_approval`, plan-verify command path
- [`e2e/terminal-policy.test.ts`](../../e2e/terminal-policy.test.ts) — extend policy matrix
- Docs: [`AGENTS.md`](../../AGENTS.md), [`docs/harness-eval-checklist.md`](../../docs/harness-eval-checklist.md) — manual smoke for npm/git/diagnostic commands

## Non-goals

- Replacing **`propose_file_edits`** with shell heredocs or `echo > file` for routine edits.
- Agent control of **human PTY** sessions (**053**).
- Long-running dev servers without explicit timeout + user ack (document “start server” as manual / future).
- Container/sandbox isolation, macOS sandbox entitlements, or CI remote runners.
- Rewriting terminal dock UI (**081** closed).

## Risks

| Risk | Mitigation |
|------|------------|
| **Regression: existing edit happy path** | Require `npm run test:agent-eval` + manual ToDoApp **Work** follow-up (S&R → proposal → apply) before merge; no changes to validation/merge in same PR as policy loosening. |
| **Regression: velocity auto-apply** | Commands never auto-run; only files follow temperament **118**. |
| **False confidence** | Model claims command success — strengthen final-answer contract + activity exit codes (same pattern as edit-fence honesty). |
| **Destructive commands under workspace cwd** | Keep `needs_ack` for `rm -rf`; never widen hard-deny list without security review. |
| **Output/token blow-up** | Keep **`RUN_COMMAND_MAX_OUTPUT_CHARS`**; offload huge logs via **107** pointers if needed. |
| **Scope creep** | Phase A = approval UX + harness nudges + policy tests; Phase B = Settings allow-list + plan card integration. |

## Dependencies

- **Blocks (soft):** **[127](127-greenfield-project-scaffolding-and-initialization.md)** — scaffold success rate improves materially once `npm create` / `npm install` / `git init` are reliable and visible in the loop.
- **Builds on:** **059**, **053**, **101** (plan verification steps), **123** (execute outcome honesty), **118** (temperament).
- **Does not require:** **122** dynamic model catalog.

## Suggested eval / manual tags

| Tag | Intent |
|-----|--------|
| `behavior:run_command_plan_verify` | Approved plan with install/typecheck step → model requests `run_command` |
| `policy:npm_install` | `npm install` classified network/install; still requires approval |
| `policy:git_status_safe` | Diagnostic git command classified; approval still required in V1 |

## Acceptance criteria

### Safety and control

- [ ] Every model-requested command in V1 requires explicit user approval before spawn (no silent runs).
- [ ] Hard-deny patterns remain blocked; policy unit tests cover scaffold/install/diagnostic examples.
- [ ] Rejected or timed-out commands return clear tool results; model final answer does not claim success.
- [ ] Human PTY remains unavailable to the agent (regression test or contract comment in **053** style).

### Product behavior

- [ ] Manual: empty folder → plan with “npm install” / “typecheck” → execute turn shows **command approval card** with cwd, purpose, and policy reason.
- [ ] Manual: approved `npm run typecheck` (or equivalent) shows exit code and truncated output in activity; workspace tree reflects new files after `npm create` when applicable.
- [ ] Plan/execute UI surfaces pending command approval when a turn has both proposal and command awaiting user action.

### Non-regression

- [ ] Manual: existing multi-file project — incremental “add button” / CSS tweak still uses **Work** executor + `propose_file_edits` without extra plan cycles (**120**).
- [ ] `npm run test:agent-eval` passes; no new failures in edit validation / merge / S&R escalation tests.
- [ ] Trust and Velocity temperaments: file review/auto-apply behavior unchanged; commands always approval-gated.

### Docs and bookkeeping

- [ ] `AGENTS.md` and harness eval checklist describe command approval happy path.
- [ ] When shipped: update **Status**, [`README.md`](../README.md) post-MVP table, [`docs/harness-roadmap.md`](../../docs/harness-roadmap.md), run **`npm run stories:html`**.

## Related

- **[059](../059-agent-command-tool-approvals.md)** — V1 approval baseline (done)
- **[053](../053-terminal-safety-policy-and-agent-boundaries.md)** — agent vs human terminal
- **[101](101-greenfield-plan-quality.md)** — plan verification steps
- **[127](127-greenfield-project-scaffolding-and-initialization.md)** — scaffolding (depends on this story)
- **[123](123-plan-execute-review-follow-ups.md)** — execute outcome honesty
- Field reports: [`docs/field-reports/grokforge-todoapp-comparison.md`](../../docs/field-reports/grokforge-todoapp-comparison.md), [`codex-todoapp-comparison.md`](../../docs/field-reports/codex-todoapp-comparison.md)

## Completion bookkeeping

When shipped: update **Status**, [`README.md`](../README.md) post-MVP table, [`docs/harness-roadmap.md`](../../docs/harness-roadmap.md) if debt row added, run **`npm run stories:html`**.
