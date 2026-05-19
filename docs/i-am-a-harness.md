# I am a harness

**Program status:** shipped vs backlog, dual-model table, and harness debt retrospective — **[`harness-roadmap.md`](harness-roadmap.md)**.

GrokForge is **not** the agent. GrokForge is the **harness** around Grok.

When we design agent interactions, tools, safety, and UX, it helps to keep the **model** separate from everything we build around it. The **agent** is not a fourth product you ship — it is the *behavior* that emerges when a Grok model runs inside a well-built harness.

Confusing the harness with the agent leads to the wrong design questions (“make the model remember the project”) when the right ones are often harness questions (“what context do we inject?”, “what tools exist?”, “what must the user approve?”).

---

## Components at a glance

| Component | What it is | Who builds it | Analogy |
| --- | --- | --- | --- |
| **Model** | The brain / reasoning engine | **xAI** | The engine |
| **Harness** | Everything around the model | **You** (GrokForge) | The car (body, controls, safety systems, dashboard) |
| **Tools** | What the agent can do | **You** (define + execute) | The car's capabilities |
| **Context** | What the agent sees | **You** | The windshield + mirrors |
| **Review layer** | Human-in-the-loop safety | **You** | The brakes + seatbelts |
| **UI/UX** | How humans interact with the agent | **You** | The cockpit |

**You** = this app and repository. GrokForge does not train or host the model; it builds the full environment in which a Grok model can act as a useful, safe, and reliable coding agent.

---

## Agent vs model

- The **model** is interchangeable infrastructure: you pick a Grok variant for chat, planning, execution, voice, and so on (`manifest.models`, `getModelForIntent`).
- The **agent** is the *experience* of a capable coding partner in a thread — what it can see, do, and propose in your workspace.

The model does not “know” your repo, terminal, or diff UI by itself. The harness supplies that world and defines what success looks like for a turn.

### Grok models for coding (harness-relevant facts)

| Question | Answer |
| --- | --- |
| Is there a special “coding-only” Grok model? | **Not anymore** — `grok-code-fast-1` was the dedicated coding SKU; xAI retired it (see [May 15, 2026 model retirement](https://docs.x.ai/developers/migration/may-15-retirement)). |
| What should we use for coding now? | **`grok-4.3`** — xAI’s current recommendation for agentic coding and tool use. |
| Does the harness pick the model? | **Yes** — via `manifest.models` and `getModelForIntent()` (`chat_default`, `planning`, `execution`, `reasoning`, `voice`). The harness chooses *which* Grok id to call; xAI runs inference. |

**GrokForge today:** new projects intentionally use a **dual-model** manifest: **`grok-code-fast-1`** on **`chat_default`** / **`execution`**, **`grok-4.3`** on **`planning`** (`DUAL_MODEL_FALLBACKS` in `src/shared/model-router.ts`, `app-project-store.ts`) so we can run **separate harness profiles per model** (see **[103](../project_tasks/post-mvp/103-agent-harness-per-model-profiles.md)**). Program index: **[`harness-roadmap.md`](harness-roadmap.md)**.

### xAI redirect for `grok-code-fast-1` (story 102)

After the [May 15, 2026 retirement](https://docs.x.ai/developers/migration/may-15-retirement), API requests that still send the **`grok-code-fast-1`** slug are **redirected to `grok-4.3`** with **`low` reasoning effort** — not a hard error. Billing uses **`grok-4.3`** pricing. GrokForge **keeps the fast id in manifest** on purpose for harness A/B (`resolveHarnessProfileKey` → `grok_code_fast` vs `grok_4_3`); switch a project to all **`grok-4.3`** in manifest when you want one id end-to-end. Investigation notes: [`docs/harness-102-xai-investigation.md`](harness-102-xai-investigation.md).

At turn start, main emits **`turn_started.routing`** `{ modelIntent, modelId, harnessProfileKey }` and stores the same on agent turn traces (dev logs in development).

**Shipped profiles (103):** `getHarnessProfile` in `src/shared/agent-harness-profile.ts` supplies per-key system sections, tool-loop bias, tool description overrides, and final-answer variants for `grok_code_fast`, `grok_4_3`, and `generic`. Reasoning traces: **preserve** (no strip until xAI message shape is handled in transport).

**Shipped agent profiles (104):** `getAgentProfile` / `resolveAgentProfileId` in `src/shared/agent-profile.ts` control **which tools exist** in the API (`planner` = read-only toolset; `executor` / `default` = full). Harness profile = *how* the model is prompted; agent profile = *what* it may call.

---

## What is a harness?

An **agent harness** (also called an **agent runtime environment** or **coding agent host**) is the software that:

1. **Connects** to one or more LLM providers and runs the request/response (and tool) loop.
2. **Grounds** the model in a real environment: files, search, git, commands, editor state, project manifest.
3. **Exposes tools** with schemas, permissions, and execution — only what the harness implements is possible.
4. **Shapes behavior** through system prompts, mode contracts (e.g. plan vs fast), retrieval, and memory policies.
5. **Mediates risk** — approvals, scoped writes, ignore rules, undo, safety warnings before apply.
6. **Presents** the agent to the human: chat, streaming, diffs, tool activity, voice, settings.

The harness is where product quality lives for a coding agent: reliability, trust, and speed of iteration are mostly harness problems, not “pick a smarter model” problems.

This is **harness engineering** — in 2026 it is increasingly recognized as a distinct (and very valuable) skill.

---

## What you're actually responsible for

GrokForge is several interconnected systems. When you work in this repo, you are usually extending one of these:

### Tool interface & execution layer

- Defining tools (`read_file`, `search_workspace`, `propose_file_edits`, `run_command`, …) and their schemas.
- Executing them safely in main (root-scoped, ignore-aware, capped).
- Returning structured results back to the model for the next turn.

*Code:* `agent-workspace-tools.ts`, `agent-tools.ts`, `src/shared/agent-tool-schema.ts`, `run-command.ts` + policy.

### Context engineering system

- What gets sent to the model each turn: project structure, open files, manifest, retrieval hits, thread history, pins/memory.
- How long contexts, multi-root workspaces, and active UI state are assembled and budgeted.

*Code:* `agent-context.ts`, `agent-retrieval.ts`, `agent-runner.ts` (system prompt + turn assembly).

### Orchestration / control loop

- Managing turns, tool calls, re-prompting, errors, cancellation, streaming.
- Modes and routing: fast vs plan, plan approve → execute, planner vs executor model intents.

*Code:* `agent-runner.ts`, `agent-chat-model-transport.ts`, `getModelForIntent`, plan/final-answer contracts.

### Safety & review gates

- Diff review before apply; auto-apply vs manual; pre-apply warnings; command approval.
- Scoped writes, undo batches, read-before-write guards where implemented.

*Code:* `agent-edit-proposals.ts`, renderer diff/apply UX, `run-command-policy.ts`, shared safety contracts.

### Workspace abstraction

- Per-project manifest and roots (stored under app `userData`, not written into user repos as `.grokproject.json`).
- Multi-root support, ignore patterns, workspace index, git/status integration.

*Code:* `manifest.ts`, `app-project-store.ts`, `agent-index-store.ts`, `ignore-globs.ts`.

### User interface & experience

- Chat, voice, planning UX, diff view, terminal, file tree, settings, onboarding.

*Code:* `src/renderer/` (e.g. `ChatThread.tsx`, `DiffEditorPane.tsx`, `voice-realtime` IPC surface).

When you add a feature, ask which bucket it belongs in — and whether it changes the **model/API**, **prompt/contract**, or **host execution and UX**. Most GrokForge work is harness-side.

---

## Research: harnesses and other hosts

Notes from external writing — patterns to borrow, not prescriptions. **Sources covered:** LangChain (harness + context), Cursor (iteration + per-model tuning), Martin Richards (**RPI** + skill taxonomies), r/ClaudeCode (routing + sub-agents), Dev.to (sandbox + observable loops), **[OpenCode / Hermes / Pi / T3 code review](research/agentic-coding-harnesses.md)** (implementation detail). **When changing the harness, start with:** [Implementation reference](#implementation-reference-opencode-hermes-pi-t3). Full pattern tables: [design patterns synthesis](#grokforge-harness-design-patterns-synthesis).

**Cross-cutting principle:** a harness should be **tailored per model** (prompts, tool names/descriptions, reasoning-trace handling, when to fetch vs preload context) while keeping **model-agnostic abstractions** in code (routing, IPC, review UI). Swapping `grok-4.3` for another id is not enough; expect **Grok-specific** harness passes after model changes — see **[102](../project_tasks/post-mvp/102-dual-model-manifest-and-harness-foundation.md)** / **[103](../project_tasks/post-mvp/103-agent-harness-per-model-profiles.md)** and Cursor’s Codex article below for how far per-model tuning goes.

---

### Per-model harness tuning (design principle)

| Idea | What it means for GrokForge |
| --- | --- |
| **One harness codebase, many model profiles** | `manifest.models` + `getModelForIntent()` pick the **model id**; we still need **per-model (or per-family) profiles** for system prompts, tool schemas, and turn assembly — not a single generic prompt for every Grok variant. |
| **Tuning is ongoing** | Cursor treats the harness as a **living product** (hypothesis → experiment → measure), not ship-once. Plan instrumentation and evals (**063**) when changing harness behavior. |
| **Presentation matters** | Tool **names**, descriptions, and shell-aligned wording (`rg` vs generic “search”) measurably change behavior — worth A/B testing on Grok. |
| **Reasoning traces** | Some models degrade badly if reasoning/thinking blocks are stripped between turns; preserve what xAI returns when multi-turn quality depends on it. |
| **Model-agnostic shell** | Electron IPC, diff review, root scoping, and human approval gates stay stable; **instructions + tools + context policy** vary by model profile. |

Today GrokForge routes by **intent** (default, planning, execution, …) more than by **full per-model harness profiles**. Closing that gap is harness engineering work, not a model API change.

---

### “The Anatomy of an Agent Harness” — Vivek Trivedy (LangChain)

**Sources:** [LangChain blog](https://blog.langchain.com/the-anatomy-of-an-agent-harness/) · [Author post](https://www.vtrivedy.com/posts/the-anatomy-of-an-agent-harness)

One of the clearest practical write-ups on the topic: it explains *why* harness design often matters more than model choice, not just what a harness is.

#### Core idea

> **Agent = Model + Harness**

- The **model** provides intelligence.
- The **harness** is everything else — code, configuration, infrastructure, and logic that turns a raw model into something that can do useful work reliably.

A raw model is not an agent. The harness gives it state, tools, memory, feedback loops, constraints, and real-world interaction.

**Key quote:** *“If you’re not the model, you’re the harness.”*

#### Lessons that matter for GrokForge

**1. Harnesses often matter more than the model**

The author reports improving a coding agent’s Terminal Bench 2.0 ranking from **top 30 → top 5** by changing **only the harness** (same model, e.g. Claude Opus). The same SKU can look very different under different hosts.

**Takeaway:** With **Grok 4.3**, invest in filesystem grounding, tools, context management, and verification loops — not only “pick a smarter model.” See **[102](../project_tasks/post-mvp/102-dual-model-manifest-and-harness-foundation.md)** (dual-model defaults) and **[103](../project_tasks/post-mvp/103-agent-harness-per-model-profiles.md)**; harness work is the longer lever.

**2. Core primitives of a strong coding harness**

| Primitive | Purpose | Why it matters for coding agents | GrokForge today (sketch) |
| --- | --- | --- | --- |
| **Filesystem + Git** | Durable storage, state, collaboration | Persist work across sessions; track changes | Multi-root FS tools, git status/diff; user repos are source of truth |
| **Bash / code execution** | General-purpose “do work” tool | Write and run code to solve problems | Guarded `run_command` (approved, not full PTY for agent); human **terminal** is separate |
| **Sandboxes** | Safe execution | Security when agents get shell access | Trusted-developer framing + policy blocks — **not** full Docker sandbox yet |
| **Memory & search** | Long-term knowledge | Avoid forgetting the project | Workspace index, retrieval, thread memory / pins (post-MVP) |
| **Context management** | Fight “context rot” | Long tasks degrade as the window fills | Context budget (**039**), retrieval governance; **tool-result offload** (**107**); LLM summarization still **gap** |
| **Orchestration** | Sub-agents, handoffs, long loops | Planning + continuation for hard tasks | Plan vs fast, approve → execute (**069**); sub-agents / “Ralph loops” not first-class |
| **Skills / progressive disclosure** | Avoid overloading context | Load only relevant tools/knowledge | Tool schemas + modes; no separate “skills” layer yet |

**3. Context management is first-class**

Long runs suffer **context rot** (quality drops as the window fills). Strong harnesses use compaction, offloading, and selective tool exposure — see the dedicated write-up below: **[Context Management for Deep Agents](#context-management-for-deep-agents-langchain)**.

GrokForge touchpoints today: `agent-context.ts`, context budget (**039**), retrieval caps, automatic tool-result offload (**107**); structured LLM summarization of history is still a gap.

**4. Design for long-horizon work**

Weak spot for many agents today: multi-hour tasks. The article argues for:

- Durable state (filesystem + git)
- Planning mechanisms
- **Self-verification** (write → run tests → fix)
- **Continuation** (don’t stop after one “done”)

GrokForge partial fit: plan mode, diff review, `run_command` after approval; gaps include automated test loops and explicit continuation hooks.

**5. Work backwards from desired behavior**

Don’t start with “what tools should I add?” Start with:

> *What behavior do I want the agent to have?*

Then design harness features (prompts, tools, gates, UI) to produce that behavior.

#### Applying the article to this project

| Question | Lesson | Suggested direction for GrokForge |
| --- | --- | --- |
| Build vs buy a harness? | Harnesses are task-specific | Study patterns (e.g. LangChain Deep Agents / Hermes: skills + memory), but optimize for **desktop coding** + Grok |
| Harness vs Grok 4.3? | Harness can move performance a lot | Prioritize FS tools, context, review gates, verification — not only model migration |
| What to prioritize first? | FS + execution + sandbox + context | Already strong on FS/search/edits; deepen **context compaction**, **safe execution**, **continuation** |
| Long coding tasks? | Durable state + continuation | Lean on real repos + git; plan execute path; consider session resume / “continue turn” UX |
| Copy other harnesses? | Tune for *your* task | Borrow primitives; keep Grok-native voice, multi-root manifest, human-in-the-loop apply |

#### Bottom line (article)

> **Stop treating the harness as an afterthought.**  
> The harness is where most of the leverage is in 2026.

Model upgrades matter; for agentic coding, **harness engineering** is often the highest-ROI work. A strong harness can make **Grok 4.3** more capable than a stronger model behind a weak host.

**Related follow-on from the same author:** [Improving Deep Agents with Harness Engineering](https://www.vtrivedy.com/posts/improving-deep-agents-with-harness-engineering) (harness-only benchmark gains — worth a separate read).

---

### Context Management for Deep Agents (LangChain)

**Sources:** [LangChain blog — Context Management for Deep Agents](https://www.langchain.com/blog/context-management-for-deepagents) · [Context engineering in Deep Agents (docs)](https://docs.langchain.com/oss/javascript/deepagents/context-engineering) · Related: [Filesystems for context engineering](https://blog.langchain.dev/how-agents-can-use-filesystems-for-context-engineering)

Direct follow-up to *Anatomy of an Agent Harness*: same harness framing, but focused on the hardest long-running-agent problem — **how to keep context useful as the window fills**.

#### Core problem: context rot

**Context rot** is gradual performance degradation as the context window fills with noise, stale turns, and oversized tool outputs. Coding agents hit this on long tool loops or multi-session work: reasoning slips, goals are forgotten, decisions get worse. This blocks “deep” agents that must run many steps or resume later.

#### Main solution: context compression

Compression = reduce what sits in **working memory** while keeping task-relevant facts recoverable. LangChain’s Deep Agents use a **hybrid** strategy:

| Technique | What it does | When to use | Benefit |
| --- | --- | --- | --- |
| **Offloading** | Move large tool outputs or old messages to the filesystem; replace with **pointer + small preview** | Large tool results, bulky reads/writes | Frees the most tokens; originals stay retrievable via `read_file` |
| **Summarization** | LLM produces a **structured** summary of history (intent, artifacts, next steps) | Still over budget after offloading | Shrinks history while preserving direction |
| **Hybrid** | Offload first, summarize when needed | Typical long-running agents | Practical balance |

**Implementation patterns (from Deep Agents / docs):**

- Trigger at **thresholds** (e.g. ~**85%** of model context window for broader compression; large **tool results** offloaded earlier — on the order of **20k tokens** in their SDK).
- **Preserve originals on disk** so the agent can re-fetch via filesystem tools — not “delete and hope.”
- Summaries are **structured** (session intent, artifacts created, next steps), not vague paragraph dumps.

#### Lessons for harness builders

1. **Filesystem is the best friend for context** — Offloading aligns with *Anatomy*: the FS isn’t only for user code; it’s the harness’s **overflow store** for context engineering.

2. **Offloading often beats pure summarization** — Summarizing everything risks **goal drift** (slow loss of the original objective). Offloading concrete artifacts (files, tool dumps) with pointers is more recoverable.

3. **Test compression aggressively** — Stress-test by triggering compression **early** (e.g. 10–20% window) to see more events; run **needle-in-the-haystack** checks that the agent can still find critical facts after compression.

4. **Context management belongs in orchestration** — When to compress, what to offload, how to retrieve, summary shape — not a late bolt-on. GrokForge’s orchestration layer: `agent-runner.ts`, turn assembly in `agent-context.ts`.

5. **Structured recovery after compression** — The agent must be able to **go back** (`read_file`, search) to offloaded material when the summary or pointer isn’t enough.

#### How the two LangChain articles fit together

| Topic | *Anatomy of a Harness* | *Context Management for Deep Agents* | Combined insight |
| --- | --- | --- | --- |
| **Context** | Important primitive | **Main focus** | Among the highest-leverage harness investments |
| **Filesystem** | Core primitive | Primary **offload** mechanism | Central to any serious coding harness |
| **Long-running work** | Durable state + orchestration | Active **compression** strategy | Need **both** persistence and compression |
| **Risks** | General harness gaps | **Goal drift** from over-summarization | Prefer offload + pointers; summarize with structure |
| **Evaluation** | Harness-only benchmark wins | Stress compression + recoverability tests | Don’t only measure end-task success |

#### GrokForge implications

| Direction | Notes |
| --- | --- |
| **Filesystem offloading** | Natural fit — we already have root-scoped `read_file` / writes; **automatic** offload of huge tool returns to app-data with pointer + `read_file` recovery (**107**); offloading old **chat** turns still **gap**. |
| **Compression strategy** | Don’t rely on Grok’s window alone; define thresholds, preview sizes, and what gets summarized vs pointed. Relates to **039** (context budget) but needs explicit **compression events**. |
| **Recoverability** | Agent must re-read offloaded blobs; UI may show “context compressed” / what was summarized. |
| **Goal drift** | If we add summarization, use structured fields and keep plan pins / thread memory (**094**) as anchors. |
| **Testing** | Add eval scenarios: long tool output → compress → needle query; early threshold mode in dev. |

#### Hermes (brief comparison)

Hermes emphasizes skills and memory, but (from public material so far) less explicit **offload + threshold compression + structured session summaries** than LangChain’s Deep Agents describe. A Grok-native desktop harness could differentiate here — especially with real multi-root repos and human-visible diff/review — if we implement compression deliberately rather than only truncating chat history.

---

### Cursor’s agent harness (public writing)

**Sources:** [Continually improving our agent harness](https://cursor.com/blog/continually-improving-agent-harness) · [Best practices for coding with agents](https://cursor.com/blog/agent-best-practices) · [Improving the agent for OpenAI Codex models](https://cursor.com/blog/codex-model-harness) · *(Low relevance for harness design: app stability / crash posts.)*

Cursor is the clearest public example of **per-model harness customization** at scale: same product shell, different instructions and tools per frontier model.

#### 1. Continually improving the harness

**Main takeaway:** the harness is a **living system**, continuously optimized — not built once.

- **Hypothesis → experiment → measure** using benchmarks (e.g. CursorBench) and **online A/B** on real usage (latency, tokens, tool-call count, **Keep Rate** — fraction of agent edits users keep).
- **Weeks of model-specific tuning** when a new model lands: tool formats, prompts, instructions matched to model quirks — while keeping **model-agnostic abstractions** underneath.
- Context strategy **evolved**: early heavy static context + guardrails (lint surfacing, tool limits) → as models improved, more **dynamic context** the agent fetches while working.
- Ongoing pain: **context rot** from accumulated **tool call errors** in the thread (aligns with LangChain’s compression/offload story).

**Lesson:** Grok 4.3 still needs a **Grok-tuned** harness and ongoing iteration; routing to the right model id is only step one.

#### 2. Agent best practices (richest article)

Cursor frames the harness as **Instructions + Tools + Model**, with **instructions and tools tuned per model**.

| Area | Cursor’s approach | Why it matters | GrokForge sketch |
| --- | --- | --- | --- |
| **Planning** | Strong **Plan Mode** before coding: research, clarify, write a detailed plan (often Markdown in `.cursor/plans/`) | Focus; fewer wasted edits | **Plan mode** + `gf-plan` contract (**099**); plans in thread / approve → execute (**069**) — not yet `.cursor/plans/`-style files on disk |
| **Context** | Agent **fetches** context (`grep`, semantic search); avoid manual file dumps; **start fresh chats** when noisy | Less rot | `search_workspace`, retrieval, index — encourage tool fetch over huge preloads; “new chat” UX |
| **Rules vs skills** | **Rules** = static (`.cursor/rules/`); **Skills** = dynamic loadable (`SKILL.md` + hooks) | Always-on vs on-demand power | We have `.cursor/rules/` + project **skills** in repo — similar split |
| **Long loops** | **Hooks** for verification (e.g. iterate until tests pass) | Autonomy with guardrails | No first-class hooks yet; `run_command` + approval is partial |
| **Tools** | Strong search + terminal; let agent **explore** | Beats pre-loading everything | Workspace tools + human terminal; agent `run_command` gated |
| **Parallel agents** | Multiple agents on **isolated git worktrees**, compare outputs | Hard problems | Not in scope v1 |
| **Workflows** | TDD, linters, verifiable goals | Clear success/failure | Policy + optional lint after edit — not Codex-level “always lint” harness bias |

**Notable patterns:** saved plans for resume; hooks for goal loops; refresh conversations more often than users expect.

#### 3. Codex-specific harness (model integration case study)

When Cursor added **OpenAI Codex**, they **heavily customized** the harness (not just the model string):

- Tool naming closer to **shell** (`rg` vs generic search names).
- **Preambles** — short reasoning summaries (1–2 sentences); reduced mid-turn chatter for better final output.
- **Preserve reasoning traces** across turns — removing them caused large regressions.
- Explicit bias toward **action** (call tools, implement) and **lint after edits**.

**Lesson:** **Model + harness fit** is mandatory. For Grok, expect separate passes on tool copy, system prompt, reasoning handling, and “act vs ask” instructions — ideally behind a **`grok-4.3` profile** (and future profiles), not one shared agent prompt.

#### Synthesis: Cursor vs LangChain vs GrokForge direction

| Lesson | Cursor detail | Relevance to a Grok coding harness |
| --- | --- | --- |
| Harness as product | Instrumentation, A/B, Keep Rate | Invest in evals (**063**) and usage signals when changing prompts/tools |
| **Per-model tuning** | Prompts, tools, traces per model | **First-class** Grok profiles; don’t assume 4.3 matches Codex or old `grok-code-fast-1` behavior |
| Planning | Plan Mode + saved plans | Already a strength — deepen plan artifacts and execute handoff |
| Context | Fetch via tools + chat resets | Complement LangChain **offload/summarize** with **fetch-first** and fresh threads |
| Rules + skills | Static vs dynamic capabilities | Mirror with rules + skills; avoid dumping everything into system prompt |
| Verification hooks | Until tests pass | Future: hook layer or structured post-edit checks |
| Tool presentation | Names/descriptions affect quality | Experiment on Grok with shell-aligned tool docs |
| Reasoning traces | Keep across turns | Verify xAI multi-turn behavior before stripping “thinking” content |

---

### Cross-host comparison (LangChain · Hermes · Cursor)

| Aspect | LangChain (Deep Agents) | Hermes | Cursor | Takeaway for GrokForge |
| --- | --- | --- | --- | --- |
| **Context** | Offload + summarization at thresholds | Memory system | Agent fetch + strategic **chat resets** | Combine **fetch-first**, **compression**, and clear “start fresh” UX |
| **Long-running work** | Durable FS + compression | Skills + memory | Hooks + verification loops | FS/git + plan/execute + future hooks |
| **Per-model harness** | Less emphasized in posts | Often described as model-agnostic | **Heavy per-model customization** | **Tailor prompts/tools/traces per Grok profile** |
| **Planning** | Mentioned in harness anatomy | Not highlighted | **Plan Mode** central | Align with plan → execute; persist plans usefully |
| **Self-improvement** | Eval / harness engineering posts | Autonomous skills | Continuous harness iteration | Skills in repo + eval suite; not autonomous self-mod yet |
| **Tool philosophy** | FS as overflow + tools | Tooling varies | Search + terminal exploration | Keep `search_workspace` / `read_file` strong; avoid context dumps |
| **RPI / phased workflow** | Research → plan → implement as distinct artifacts | `spec:` / `plan.json` style skills | Plan mode + execute; **`plan.json` / `plan.md` on disk (109)**; no `spec.md` pipeline yet | **Partial (109)** — see [Martin Richards](#martin-richards--building-your-own-agent-harness) |
| **Sandbox execution** | Docker / isolated run loops | Observable harness loop | Guarded `run_command`; no agent Docker sandbox | **Partial** / **Gap** — see [Dev.to harness](#devto--building-a-coding-agent-harness) |

---

### Martin Richards — Building your own agent harness

**Source:** [Building Your Own Agent Harness](https://www.martinrichards.me/post/building_your_own_agent_harness/) (Atelier / harness engineering)

**Contributions:**

- **Research → Plan → Implement (RPI)** as a convergent loop (also HumanLayer “RPI”, Superpowers, etc.): don’t implement until a **written plan** is reviewed.
- **Categorized skills** with prefixes — e.g. `spec:research` → `spec.md`, `spec:plan` → `plan.json`, then implementation skills (`code:`). Teaches the agent *your* process, not only tools.
- **Shared mutable plans** — plan is living state between human and agent; **annotation** and **backflow** (implementation discovers gaps → return to research/plan).
- **Encode your process** — harness = skills + workflows + methodology; model choice matters less than how you wrap it (cites harness-only benchmark gains).

**GrokForge comparison:**

| RPI idea | GrokForge today |
| --- | --- |
| Distinct research phase | **Partial** — retrieval + tools in plan/fast mode, not a required `spec.md` artifact |
| Reviewable plan before code | **Yes** — plan mode, `gf-plan`, approve → execute (**069**, **099**) |
| `plan.json` / structured plan on disk | **Partial** — plan lives in chat markdown; not a first-class `plan.json` or workspace plan folder |
| Skill taxonomy (`spec:`, `oracle:`, `code:`) | **Gap** — we have `.cursor/skills/` but not prefixed phase skills |
| Backflow to planning | **Partial** — user can re-plan; runner doesn’t auto-trigger “return to plan” |

---

### Reddit — r/ClaudeCode (community thread)

**Contributions** (synthesized from discussion; no single canonical URL):

- **Cheaper/faster models for research** — gather context with a light model; reserve strong model for plan/impl.
- **Sub-agents for offloading** — research/context sub-runs keep the main thread clean and cut cost.
- **Handoff context loss** — major failure mode when sub-agents or phases pass summaries; need **structured artifacts**, not vibes.
- **Custom harness “onboarding”** — rules, index, and fetch tools matter for grounding in a codebase.

**GrokForge comparison:**

| Idea | GrokForge today |
| --- | --- |
| Model routing research vs implement | **Partial** — `planning` / `execution` / `default` intents (**012**, **097**); canonical routing in `resolveAgentTurnRouting`; not “cheap research sub-agent” |
| Sub-agents | **Gap** |
| Structured handoff artifacts | **Partial** — merged edit proposals, `gf-plan`; weak cross-phase machine-readable bundle |
| Codebase onboarding | **Partial** — workspace index, retrieval, rules; no dedicated onboarding story beyond **095** |

---

### Dev.to — Building a coding agent harness

**Source:** [I'm Building My Own Coding Agent Harness (And It's Pretty Cool)](https://dev.to/composiodev/im-building-my-own-coding-agent-harness-and-its-pretty-cool-1lpf) (and related Docker sandbox posts on DEV)

**Contributions:**

- **Explicit, observable execution loop** — log tool calls and results so developer and agent can debug iterations.
- **Sandbox-first execution** — Docker (or similar) for safe, reproducible runs; pre-baked deps.
- **Small focused toolset** — few powerful primitives beat dozens of narrow tools early on.
- **Separation** — model reasons; harness executes and enforces environment boundaries.
- **Meta-tools** — wrappers for external integrations without bloating core loop.

**GrokForge comparison:**

| Idea | GrokForge today |
| --- | --- |
| Observable tool loop | **Yes** / **Partial** — tool activity in thread (**093**), compact activity rows; not full harness trace UI (**061** backlog) |
| Docker sandbox for agent | **Gap** — `run_command` on host root with policy; human PTY separate |
| Minimal toolset | **Partial** — six v1 tools; growing carefully |
| Reasoning vs execution split | **Partial** — main process executes; model never touches disk directly (**by design**) |

---

## GrokForge harness: design patterns (synthesis)

Patterns distilled from **LangChain**, **Hermes**, **Cursor**, **Martin Richards (RPI)**, **community (Reddit)**, and **Dev.to (sandbox/loops)** — with **what we should do** in this repo and **where we are today**. Sources are cited per row; this is the actionable checklist for Grok-based harness work.

**Legend — GrokForge status:** **Yes** = shipped in meaningful form · **Partial** = exists but incomplete · **Gap** = not yet first-class · **Planned** = story/backlog called out elsewhere in this doc.

### 1. Foundational philosophy

| Pattern | Description | GrokForge direction | Status | Source |
| --- | --- | --- | --- | --- |
| **Agent = Model + Harness** | Harness is the main engineering surface | Grok 4.3 quality = model + our loop, tools, gates, context | **Yes** (this doc) | LangChain |
| **Harness as a living product** | Tune with data and iteration | Instrument turns (success, tokens, tool errors, keep/apply rate); iterate prompts/tools | **Partial** (**063** evals; limited prod metrics) | Cursor |
| **Model-specific tuning** | Prompts, tool schemas, behavior per model | **Grok 4.3 profile** (and per-intent variants) — not one generic system prompt | **Gap** (intent routing only; see [per-model tuning](#per-model-harness-tuning-design-principle)) | Cursor + LangChain |

### 2. Context management

| Pattern | Description | GrokForge direction | Status | Source |
| --- | --- | --- | --- | --- |
| **Filesystem as source of truth** | Durable state, plans, offloads, artifacts on disk | User **workspace roots** are truth; app `userData` for manifest/chat/index | **Partial** | LangChain + Cursor + Martin Richards |
| **Offloading over pure summarization** | Large tool outputs → disk; pointer + preview | Auto-offload huge tool returns (**107**); structured summary when still over budget | **Partial** | LangChain |
| **Agent-driven context fetching** | Search tools over manual dumps | `search_workspace` + `read_file` + index; minimal preload | **Yes** / **Partial** | Cursor + Reddit |
| **Sub-agents for context offloading** | Cheaper/smaller runs for research | Route research to lighter model or isolated sub-turn; pass structured artifact back | **Gap** | Reddit |
| **Minimize handoff context loss** | Structured summaries between phases/sub-agents | `gf-plan`, pins, merged proposals — expand machine-readable handoff bundle | **Partial** | Reddit |
| **Strategic conversation resets** | Fresh thread when noisy | New chat + plan/pins/memory anchors | **Partial** | Cursor |
| **Structured compression** | Goal, artifacts, next steps; originals on disk | LangChain-shaped summaries + plan pins (**094**) | **Gap** | LangChain |

### 3. Tooling & execution

| Pattern | Description | GrokForge direction | Status | Source |
| --- | --- | --- | --- | --- |
| **Small, focused toolset** | Few powerful primitives early | Resist tool sprawl; core: read, search, edit proposal, run_command, index | **Partial** (six v1 tools — disciplined so far) | Dev.to |
| **Observable execution loop** | Visible tool calls, results, iterations | Tool activity UI (**093**), activity rows; deepen **061** traces | **Partial** | Dev.to |
| **Sandbox-first execution** | Docker/isolated agent runs | Agent `run_command` in container with mounted workspace — long-term | **Gap** | Dev.to + LangChain |
| **Self-registering tool registry** | Low-friction new tools | `agent-tool-schema` + runner dispatch | **Partial** | Hermes-inspired |
| **Shell-forward tool design** | CLI-aligned names (`rg`, etc.) | A/B tool copy for Grok 4.3 | **Gap** | Cursor (Codex) |
| **Multiple execution backends** | Local, Docker, SSH | Guarded host `run_command` + human PTY today | **Partial** | Hermes + LangChain |
| **General-purpose tools first** | FS + execution primitives | `read_file`, `search_workspace`, `propose_file_edits`, `run_command` | **Yes** | LangChain |

### 4. Workflow, planning & orchestration

| Pattern | Description | GrokForge direction | Status | Source |
| --- | --- | --- | --- | --- |
| **RPI loop (Research → Plan → Implement)** | Distinct phases with reviewable artifacts (`spec.md`, `plan.json`) | Align plan mode + execute with explicit research pass; structured plan file on disk (**109**) | **Partial (109)** | Martin Richards + Reddit |
| **Shared mutable plans + backflow** | Plan is living state; impl can send you back to plan/research | Persist plans; allow “re-plan” without losing thread; runner could detect failed apply → suggest plan | **Partial** | Martin Richards |
| **Plan mode before coding** | No code until plan reviewed | Plan mode, `gf-plan`, no `propose_file_edits` on plan turn (**099**) | **Yes** | Cursor + Martin Richards |
| **Skill taxonomies** | `spec:`, `oracle:`, `code:` style phased skills | Namespace skills by phase; load only matching prefix for current mode | **Gap** | Martin Richards |
| **Plan persistence** | Plans on disk for resume | App data or workspace plan path — not only chat bubble | **Partial** | Cursor |
| **Sub-agent / parallel execution** | Worktrees or parallel explorers | Post-MVP | **Gap** | LangChain + Cursor + Reddit |
| **Hook-based verification loops** | Until tests/linter pass | Hooks or runner policies after apply | **Gap** | Cursor + Dev.to |
| **Encode your process** | Your review habits in the harness | Rules, skills, plan contracts, diff-before-apply — document in `.cursor/` + harness prompts | **Partial** | Martin Richards |

### 5. Memory, rules & skills

| Pattern | Description | GrokForge direction | Status | Source |
| --- | --- | --- | --- | --- |
| **Rules vs skills** | Static rules + dynamic loadable skills | `.cursor/rules/` + `.cursor/skills/` | **Yes** | Cursor |
| **Context-aware skill loading** | Load skills by task/phase | Inject skills when plan vs execute vs research; prefix taxonomies (`spec:`) | **Gap** | Martin Richards + Hermes |
| **Autonomous skill extraction** | Reusable skill after hard tasks | Post-task skill draft to `.cursor/skills/` | **Gap** | Hermes + Martin Richards |
| **Persistent memory + search** | Cross-session memory | Thread memory, pins (**094**), workspace index | **Partial** | Hermes + LangChain |
| **User/project modeling** | Preferences in files | Manifest, pins, convention injection | **Partial** | Hermes-inspired |

### 6. Model interaction & routing (Grok-specific)

| Pattern | Description | GrokForge direction | Status | Source |
| --- | --- | --- | --- | --- |
| **Task-based model routing** | Cheaper/faster for research; strong for plan/impl | `models.planning` vs `models.execution` vs `default`; **097** (two-axis routing) | **Partial** | Reddit + **097** |
| **Model-specific harness tuning** | Prompts + tools per model | Grok 4.3 profile — not shared with Codex/Claude assumptions | **Gap** | Cursor |
| **Preserve reasoning traces** | Keep thinking across turns when helpful | Test xAI; don’t strip if quality regresses | **Gap** (verify) | Cursor (Codex) |
| **Bias toward action** | Implement unless planning-only | Execution mode + tool contracts | **Partial** | Cursor |
| **Tool schema experimentation** | Descriptions tuned for Grok 4.3 | Per-profile tool defs in harness | **Gap** | Cursor |
| **Preamble / instruction tuning** | System prompt per model family | `grok-4.3` variant; retire fast-code tone | **Gap** | Cursor |

Dual-model + profile keys: **[102](../project_tasks/post-mvp/102-dual-model-manifest-and-harness-foundation.md)** → **[103](../project_tasks/post-mvp/103-agent-harness-per-model-profiles.md)**. Canonical phase routing: **[097](../project_tasks/post-mvp/097-model-routing-planner-vs-executor.md)** (`resolveAgentTurnRouting` in `src/shared/agent-turn-routing.ts`). Roadmap: **[`harness-roadmap.md`](harness-roadmap.md)**.

### 7. Reliability & verification

| Pattern | Description | GrokForge direction | Status | Source |
| --- | --- | --- | --- | --- |
| **Verifiable goals** | Tests, linters, explicit checks | Encourage `run_command` for test/lint after edits; plan steps that name verification | **Partial** | Cursor |
| **TDD-friendly workflow** | Tests first, then impl | Prompt/plan templates; no dedicated TDD mode yet | **Gap** | Cursor |
| **Review & diff visibility** | Clear diff before apply | `propose_file_edits`, grouped diff, apply/discard, safety banners | **Yes** | Cursor + product |
| **Error classification** | Expected vs unexpected tool errors | Structured tool errors back to model; don’t let error spam rot context | **Partial** | Cursor |

### 8. Iteration & observability

| Pattern | Description | GrokForge direction | Status | Source |
| --- | --- | --- | --- | --- |
| **Instrumentation & metrics** | Success, tokens, errors, satisfaction | Turn traces (**061**), eval harness (**063**), future Keep/apply rate | **Partial** | Cursor |
| **Aggressive compression testing** | Early thresholds, needle tests | Offload needle in unit tests (**107**); manual offload follow-up in **[harness-eval-checklist.md](harness-eval-checklist.md)** | **Partial** | LangChain |
| **Anomaly detection** | Catch harness regressions | CI eval matrix (**108**) on profile/agent/contract tags; `npm run test:agent-eval` | **Partial** (**063**, **108**) | Cursor |

---

### Prioritized backlog for this harness

Updated after Martin Richards (RPI), Reddit (routing/sub-agents), and Dev.to (sandbox/observability):

| Priority | Pattern cluster | Why first | GrokForge gap / work |
| --- | --- | --- | --- |
| **High** | **RPI loop + reviewable artifacts** | Top leverage across Cursor + Martin Richards | Strengthen plan → execute; add optional `spec.md` / structured plan on disk; **098** |
| **High** | **Filesystem-centric + offloading** | Foundation for context + durability | Tool-result offload (**107**); plan files under app or workspace path |
| **High** | **Planning as distinct reviewable phase** | Already started — don’t regress | Protect **099** contract; diff-before-apply |
| **High** | **Sandbox + observable execution loop** | Safety + debuggability (Dev.to) | Docker-tier agent runs (future); expand traces (**061**) + tool activity |
| **High** | **Model-specific harness (dual-model)** | Per-model tuning is not optional | **102** + **103** (`grok-code-fast-1` vs `grok-4.3` profiles) |
| **Medium** | **Task-based model routing** | Cheap research vs strong impl (Reddit) | **097** — planning/execution/default; optional “research” intent |
| **Medium** | **Rules + dynamic skills** | Context efficiency | Phase-aware skill load; `spec:` / `code:` namespaces |
| **Medium** | **Encode your process + backflow** | Custom harness value | Document workflows in skills; re-plan UX when apply fails |
| **Medium** | **Sub-agents / handoff bundles** | Cost + less rot | Structured artifact passed between phases; sub-agent post-MVP |
| **Lower** | **Autonomous skill extraction** | Compounding over time | Post-task skill save (Hermes-style) |

**Already strong (protect while extending):** multi-root FS tools, diff review, plan/execute split (`gf-plan`, approve → execute), guarded `run_command`, tool activity in thread, model routing by intent, `.cursor/rules` + skills layout.

**Do not skip:** per-model harness profiles — routing `grok-4.3` in the manifest is necessary but not sufficient.

**GrokForge vs “full RPI harness” (honest snapshot):**

| Phase | Ideal (Martin Richards + Cursor) | GrokForge now |
| --- | --- | --- |
| **Research** | `spec:research` → `spec.md` on disk | Retrieval + search tools in-thread; no required research artifact |
| **Plan** | `spec:plan` → `plan.json`, human annotates | Plan mode + markdown `gf-plan` in chat; user approves |
| **Implement** | `code:` skills after approval | Execute turn on `execution` model + `propose_file_edits` + diff review |
| **Backflow** | Return to plan when impl diverges | Manual re-plan; not automated |
| **Execute env** | Docker sandbox, observable loop | Host `run_command` + policy; human PTY |

---

## Implementation reference (OpenCode, Hermes, Pi, T3)

**Full report (codebase inspection, 2026-05-19):** [`docs/research/agentic-coding-harnesses.md`](research/agentic-coding-harnesses.md)

That document compares **OpenCode**, **Hermes Agent**, **Pi**, and **T3 Code** with file-level detail. This section is the **action list** for GrokForge harness work — use it when changing `agent-runner`, tools, IPC, or permissions.

### What this research adds

Earlier sources gave **principles** (LangChain, Cursor, RPI). The implementation report gives **how shipping harnesses actually built**:

- Agent **profiles** as permission + tool envelopes (not prompt-only modes)
- **Turn snapshots** before each provider call
- **Session-aware tool execution** context
- **Toolsets** as curated capability bundles
- **Subagents as real child sessions**
- **Durable boundaries** instead of magical mid-flight resume
- **Permissions as data** (wildcards, allow/deny/ask)
- **Control-plane** event normalization (T3) if we ever wrap multiple runtimes

### Patterns to steal — priority for GrokForge

| Pattern | Why | Priority | GrokForge today | Primary source |
| --- | --- | --- | --- | --- |
| **Agent profiles + permission scopes** | Different behaviors via tool access + rules, not prompts alone | **High** | **Partial** — plan vs fast + edit contract; not full profile matrix like OpenCode `build`/`plan`/`explore` | OpenCode |
| **Turn snapshots** | Stable model/tools/prompt/messages for in-flight request; no mid-turn mutation bugs | **High** | **Partial** — `AgentTurnSnapshot` per provider round (**105**); trace `providerRounds` metadata | Pi |
| **Rich tool execution context** | sessionId, abort, permission callback, progress/metadata for UI | **High** | **Partial (106/110)** — **`AgentToolExecutionContext`** on all v1 tools (**106**); turn receipts + interrupted activity (**110**) | OpenCode + Hermes |
| **Toolsets / curated bundles** | Different tools per mode/agent/platform | **High** | **Partial** — fixed v1 tool list; plan mode restricts edits via contract, not tool registry | Hermes |
| **Subagents as isolated sessions** | Permissions, context, resume, inspectability | **Medium–High** | **Gap** | OpenCode + Hermes |
| **Durable boundaries + recovery** | Checkpoint/log/receipt; mark interrupted work | **High** | **Partial (110)** — `turn-receipts.jsonl` + recovery hint; activity `interrupted`; no stream resume | Pi + T3 |
| **Permissions as composable data** | Wildcard allow/deny/ask by pattern | **Medium** | **Partial** — `run_command` approval, ignore rules, scoped roots; not agent-profile rulesets | OpenCode |
| **Extensions layer** | Customize without forking core harness | **Medium** | **Partial** — `.cursor/skills`, plugins N/A in app | Pi |
| **Event normalization** | Stable UI over provider-native noise | **Medium** | **Partial** — `agent-chat` event stream; xAI-only today | T3 |

### Eight concrete mechanisms (focus when adjusting the harness)

#### 1. Agent profiles as behavioral envelopes (OpenCode)

OpenCode agents (`build`, `plan`, `general`, `explore`, …) bundle **prompt + model options + permission ruleset + tool visibility + step limits**. Plan mode **denies edits by default** with narrow exceptions — not “please don’t edit” in the prompt.

**GrokForge:** Plan mode + `gf-plan` + execution routing is directionally right. **Next:** explicit **profile** type in code (e.g. `planner` | `implementer` | `explorer` | `reviewer`) mapping to allowed tools, `run_command` policy, and manifest model intent — see OpenCode `Agent.Info` pattern in the [full report](research/agentic-coding-harnesses.md#opencode).

#### 2. Turn snapshots (Pi)

Before each provider call, snapshot: session messages, system prompt, model, tools, resources, stream options. Mutations during the turn apply to **future** snapshots only.

**GrokForge:** **Partial (105).** `buildTurnSnapshot()` in `agent-runner.ts` freezes routing, tools, active context, and messages before each sample/final stream; live `messages` mutates only for the next round. Context offload (**107**) must not mutate prior snapshots.

#### 3. Tool execution context (OpenCode + Hermes)

Tools receive: session/project id, abort signal, tool call id, agent name, message context, permission `ask()`, metadata/progress callback.

**GrokForge:** **Partial (106/110).** `buildAgentToolExecutionContext()` wires snapshot/tool ids, abort, read registry, throttled progress, and command approval (**106**). Turn receipts and `interrupted` tool activity boundaries ship in **110**. **Next:** permissions-as-data beyond command approval.

#### 4. Toolsets (Hermes)

Register tools into **toolsets**; assign bundles per CLI vs subagent vs phase (`terminal,file` vs `web` only).

**GrokForge:** **Next:** `plan` profile → read/search/index only; `execute` → + `propose_file_edits` + `run_command`; optional `explore` sub-profile — wired in tool schema exposure, not only prompts.

#### 5. Subagents as real sessions (OpenCode + Hermes)

Child session with inherited/scoped permissions, resumable, visible in UI — not a hidden nested completion.

**GrokForge:** **Gap** — aligns with Reddit/Hermes delegation; post-MVP; child could be `userData/.../agent-sessions/<id>.jsonl`.

#### 6. Durable boundaries & recovery (Pi + T3)

Don’t resume in-flight provider streams; recover from checkpoints, session log, receipts; mark tool runs `interrupted`.

**GrokForge:** **Partial (110/112)** — `turn-receipts.jsonl` per turn (`in_progress` → terminal), quit flush as `interrupted`, next-turn recovery system block; tool activity `interrupted` in UI. Child explorer sessions (**112**) persist under `agent-sessions/*.jsonl` with bounded `spawn_subagent` results to the parent.

#### 7. Permissions as data (OpenCode)

Wildcard rules: `allow` / `deny` / `ask` on tool + path patterns; merged from defaults + user + session.

**GrokForge:** **Partial** — ignore globs, secret path blocks, command policy. **Next:** manifest or per-profile permission table (e.g. `.env` → ask, plan → deny `propose_file_edits`).

#### 8. Control plane vs native harness (T3)

T3 wraps Codex/Claude/OpenCode via **ProviderAdapter** + event normalization — cockpit, not every tool.

**GrokForge:** We are a **native Grok harness** (like OpenCode/Pi), not T3. Still useful if we ever embed other agents: normalize to our `agent-chat` events.

### Harness evaluation checklist (when changing the loop)

From the [implementation report](research/agentic-coding-harnesses.md#questions-to-ask-when-evaluating-a-harness) — answer for GrokForge on each major change:

1. Internal message/event format — shared contracts in `src/shared/agent-*`?
2. Where are xAI/Grok quirks normalized? — `agent-chat-model-transport`, per-model profile (**gap**)
3. Tools: plain functions or session-aware? — **move toward session-aware**
4. Permissions: data + UI? — **partial** (command approval, diff apply)
5. Interrupt provider, shell, subagent? — cancel turn yes; parent abort propagates to child (**112**); no parallel subagents v1. Voice handoff → typed chat (**113**) does not run tools in the WebSocket layer.
6. Persisted after each turn? — chat thread + proposals + index
7. Crash mid-tool? — **define behavior** (interrupted vs retry)
8. Context pressure / compaction? — budget **039**; tool-result offload **107**; chat summarization **gap**
9. Model select/switch? — `getModelForIntent` **yes**
10. Extensions (tools, hooks, UI)? — skills/rules **partial**
11. Subagent isolation? — **gap**
12. UI: tools, diffs, approvals? — **strong** (diff review, tool activity)
13. Embeddable API? — Electron IPC, not public SDK
14. Account/state isolation? — single xAI key in main; N/A multi-account v1

### Updated priority stack (implementation-informed)

Merge with [prioritized backlog](#prioritized-backlog-for-this-harness) above — when starting harness work, prefer this order:

1. **Agent profiles** (permissions + toolsets per plan/execute/explore)
2. **Turn snapshots** + **tool execution context** (stability + polish)
3. **Grok 4.3 harness profile** (**102**) — model-specific prompts/tools
4. **RPI artifacts** on disk + plan persistence
5. **Durable boundaries** (interrupted tools, turn receipts)
6. Context **offload** + compression
7. **Subagents** as child sessions
8. Sandbox execution tier

---

### Other hosts (TODO)

*Claude Code, Codex CLI, Aider, OpenHands — shorter notes if needed; deep comparison lives in [agentic-coding-harnesses.md](research/agentic-coding-harnesses.md).*

---

For implementation detail and IPC boundaries, see [`AGENTS.md`](../AGENTS.md).
