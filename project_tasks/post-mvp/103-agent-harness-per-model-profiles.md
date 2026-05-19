# 103 — Per-model harness profiles (`grok-code-fast-1` vs `grok-4.3`)

**Status:** Post-MVP backlog.

**Design skill:** N/A (main/shared agent loop; optional dev-only Settings preview of profile id).

**Depends on:** **[102](102-dual-model-manifest-and-harness-foundation.md)** (`resolveHarnessProfileKey`).

**Blocks:** **[104](104-agent-profiles-and-toolsets.md)**, **[097](097-model-routing-planner-vs-executor.md)**, **[101](101-greenfield-plan-quality.md)**, **[108](108-harness-eval-suite-per-model-regressions.md)**.

## Why this story exists

Today one generic system prompt and tool copy in `agent-context.ts` / `agent-runner.ts` is sent regardless of whether the turn uses **`grok-code-fast-1`** or **`grok-4.3`**. Cursor’s public writing is explicit: **the harness must be tuned per model** — tool names, instructions, reasoning-trace handling, and “act vs ask” bias.

**102** keeps both models in the manifest. **103** implements **two (plus `generic`) full harness profiles** so we can measure how much quality comes from the host vs the SKU.

Reference: [`docs/i-am-a-harness.md`](../../docs/i-am-a-harness.md) § Per-model harness tuning; [`docs/research/agentic-coding-harnesses.md`](../../docs/research/agentic-coding-harnesses.md) § multi-model support.

## Goals

### 1. Profile registry (shared)

Create `src/shared/agent-harness-profile.ts` (and contract/types) defining `AgentHarnessProfile`:

| Field | Purpose |
| --- | --- |
| `key` | `'grok_code_fast' \| 'grok_4_3' \| 'generic'` |
| `displayName` | Settings / dev UI |
| `modelIds` | Aliases that map to this profile (includes `grok-code-fast-1`, `grok-4.3`) |
| `systemPromptSections` | Ordered blocks merged by `buildAgentSystemPrompt({ profile, agentProfile, chatMode })` |
| `toolDescriptionOverrides` | Partial map `toolName → description` merged into xAI tool defs |
| `finalAnswerContractVariant` | Hooks for `buildFinalAnswerContract` (plan vs fast already exist; add profile-specific suffixes) |
| `reasoningTracePolicy` | `'preserve' \| 'strip' \| 'provider_default'` — document choice per model after manual/API check |
| `toolUseBias` | Short instruction block: e.g. fast = “call tools early”; 4.3 = “read before large edits” |

`getHarnessProfile(key)` returns immutable profile; unknown model → `generic`.

### 2. Wire profiles into the agent loop

- **`agent-context.ts`** — `buildInitialMessages` accepts `harnessProfileKey` (from **102** resolver) and merges profile sections **before** chatMode-specific plan/fast text.
- **`agent-runner.ts`** — Resolve `modelId` from payload (or re-resolve via intent when **097** lands); compute profile key once per turn; pass through tool loop and final stream.
- **`agent-workspace-tools.ts`** / tool registration — Apply `toolDescriptionOverrides` when building OpenAI/xAI function tools.
- **`agent-final-answer-contract.ts`** — Optional `profileKey` parameter for variant strings (keep backward-compatible defaults).

### 3. Deliberate differences between the two profiles (v1)

Document in PR; tune in code. Suggested starting points (adjust after eval **108**):

**`grok_code_fast` (execution / default chat)**

- Shorter system prompt; stronger “use tools now, don’t over-explain”.
- Tool names/descriptions aligned with shell vocabulary (`search_workspace` described like ripgrep-style search).
- Final answer: concise; fewer plan-quality paragraphs.
- Reasoning: test preserve vs strip with xAI; default `preserve` until proven harmful.

**`grok_4_3` (planning)**

- Longer planning instructions; emphasize `gf-plan` quality, file list, risks, verification steps.
- Stronger read/search before answering; link to **091** proactivity rules.
- Final answer in plan mode: already governed by **099**; add 4.3-specific examples in contract appendix.
- Encourage structured steps and “don’t propose edits in plan mode” (belt + suspenders with **104**).

### 4. Dev observability

- Log once per turn: `modelId`, `harnessProfileKey`, `agentProfile` (when **104** exists).
- Optional: **Settings → Agent** (dev section) show active profile for current manifest slots.

## Non-goals

- Agent profiles / tool allow-deny (**104**).
- Runner re-routing model mid-turn (**097**).
- Voice realtime profile (**113** — separate).
- Automatic A/B or Keep Rate metrics (future).

## Key files

| File | Change |
| --- | --- |
| `src/shared/agent-harness-profile.ts` | Profile definitions |
| `src/shared/agent-harness-profile.test.ts` | Snapshot key sections |
| `src/main/agent-context.ts` | Profile-aware prompt build |
| `src/main/agent-runner.ts` | Resolve + pass profile |
| `src/main/agent-chat-model-transport.ts` | Reasoning trace policy hook if needed |
| `src/shared/agent-final-answer-contract.ts` | Profile variant |

## Testing

- Unit: `getHarnessProfile('grok_code_fast')` vs `grok_4_3` produce different system prompt hashes / required substrings.
- Unit: tool description override applied for at least one tool.
- Unit: `buildFinalAnswerContract({ chatMode: 'plan', profileKey: 'grok_4_3' })` differs from fast profile.
- Extend **063** fixtures later in **108**; minimum one fixture here.

## Acceptance criteria

- [ ] Two distinct harness profiles shipped for `grok-code-fast-1` and `grok-4.3`.
- [ ] Agent turn uses profile derived from resolved `modelId` (not hardcoded in one prompt file).
- [ ] PR documents reasoning-trace decision and tool-use bias per profile.
- [ ] `npm run typecheck` and `npm run test` pass.

## Related stories

- **[102](102-dual-model-manifest-and-harness-foundation.md)**, **[104](104-agent-profiles-and-toolsets.md)**, **[108](108-harness-eval-suite-per-model-regressions.md)**.

## Completion bookkeeping

When implemented: mark **103** done, update [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
