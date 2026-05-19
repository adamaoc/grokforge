# Agentic Coding Harness Research

Date: 2026-05-19

Projects inspected:

- `opencode`
- `hermes-agent`
- `pi`
- `t3code`

## Short Answer: What Is A Harness?

In these projects, a harness is the runtime layer that turns a raw model into a usable coding agent.

The model supplies text, reasoning, and tool-call intents. The harness supplies everything else that makes the experience feel coherent:

- Conversation/session state
- System prompt assembly
- Tool schemas and tool execution
- File, shell, search, patch, and browser capabilities
- Permission and approval gates
- Streaming and UI events
- Interrupts, retries, compaction, and context budgeting
- Provider/model switching
- Durable logs, checkpoints, diffs, and restore paths
- Extension/plugin surfaces
- Subagents, queues, and parallel work

A good harness is basically an operating environment for model-driven work. It makes tool use legible, safe enough, resumable, observable, and portable across models whose APIs all behave a little differently.

## Big Pattern Across The Projects

The projects split into three architectural camps.

| Project | Harness Style | Core Bet |
|---|---|---|
| OpenCode | Native coding-agent harness | Own the whole coding runtime: agents, tools, permissions, sessions, TUI/API, MCP, provider transforms. |
| Hermes Agent | Broad autonomous-agent harness | Make the agent live anywhere, remember across sessions, use many toolsets, delegate work, and run remotely. |
| Pi | Minimal embeddable harness | Keep the core harness explicit and extensible: agent loop, durable session tree, tools, extensions, SDK/RPC. |
| T3 Code | GUI orchestration harness over other agents | Do not implement every tool yourself; wrap Codex/Claude/OpenCode runtimes behind a provider adapter and normalize events into a web UI. |

The strongest shared lesson: "multi-model support" is not just a provider dropdown. It requires schema adaptation, prompt differences, capability filtering, model-specific reasoning controls, auth isolation, event normalization, and recovery behavior.

## OpenCode

### What It Is Doing

OpenCode is a full coding-agent harness implemented in TypeScript/Effect. It owns the agent definitions, tool registry, provider integration, permissions, session loop, plugins, MCP, TUI/API surfaces, LSP support, and subagents.

The README exposes the user-level concept clearly: two primary agents, `build` and `plan`, plus a `general` subagent. The implementation deepens that into a configurable agent system in `packages/opencode/src/agent/agent.ts`.

Key source areas:

- Agent definitions: `packages/opencode/src/agent/agent.ts`
- Tool resolution: `packages/opencode/src/session/tools.ts`
- Tool registry: `packages/opencode/src/tool/registry.ts`
- Built-in tools: `packages/opencode/src/tool/*`
- Permissions: `packages/opencode/src/permission/*`
- Providers: `packages/opencode/src/provider/*`
- Plugins: `packages/opencode/src/plugin/*`
- MCP config/runtime: `packages/opencode/src/config/mcp.ts`, `packages/opencode/src/mcp/*`
- Sessions: `packages/opencode/src/session/*`

### Harness Shape

OpenCode's harness is agent-centric. An `Agent.Info` describes:

- Name and description
- Primary/subagent/all mode
- Optional model override
- Prompt and model options
- Step limit
- Permission ruleset

Built-in agents are not just labels. They are permission profiles:

- `build`: default development agent, allows normal work and question/plan entry.
- `plan`: read-oriented planning mode; edit tools denied by default, with narrow plan-file exceptions.
- `general`: subagent for complex searches and multistep tasks.
- `explore`: read/search/bash/web-focused codebase exploration subagent.
- `scout`: experimental docs/dependency-source specialist.
- Hidden agents for compaction/title/summary style internal work.

This is a very direct answer to "how do you make many models feel good": you do not give every model the same behavioral contract. You route requests through agent profiles with different tools, prompts, and permissions.

### Tool System

OpenCode has a first-class tool registry. Built-ins include:

- `shell`
- `read`
- `glob`
- `grep`
- `edit`
- `write`
- `task`
- `task_status`
- `fetch` / web fetch
- `todo`
- `search`
- `repo_clone`
- `repo_overview`
- `skill`
- `patch`
- `question`
- `lsp`
- `plan`

The registry also loads project/user/plugin tools from `{tool,tools}/*.{js,ts}` and plugin hooks. Tool definitions are converted to provider-specific JSON schema through provider transforms before they are exposed to the model.

The tool execution wrapper in `session/tools.ts` is important. It builds a per-tool context containing:

- Session ID
- Abort signal
- Message ID and tool call ID
- Current agent name
- Full message context
- Metadata callback for live UI state
- Permission `ask()` bridge

That means tools are not just functions. They are session-aware, abort-aware, UI-aware, permission-aware operations.

### Permissions And Safety

OpenCode uses wildcard permission rules: allow, deny, ask. Rules are evaluated by permission name and pattern. Agents merge defaults, user config, and per-session permissions.

The key ergonomic choice is that permission is attached to agents and tools, not bolted on as a single global switch. For example:

- Plan mode denies edit tools.
- External directory access defaults to ask.
- `.env` reads ask, while `.env.example` reads allow.
- Subagent permissions are derived from parent and child agent profiles.

### Subagents

OpenCode's `task` tool creates or resumes a child session, assigns the chosen subagent type, derives permissions, chooses the subagent model, runs the prompt, and returns a structured result. Experimental background subagents add asynchronous polling via `task_status`.

This makes subagents real sessions, not hidden function calls. That is a strong harness design because it gives the system resumability, permission isolation, and UI inspectability.

### Provider/Model Handling

OpenCode uses the Vercel AI SDK provider ecosystem plus custom provider logic. It has provider transforms that adapt schemas and model behavior. It also ships auth plugins for Codex, GitHub Copilot, GitLab, Cloudflare, Azure, DigitalOcean, and others.

Provider support is therefore part native, part plugin. The harness tries to normalize:

- Model catalog discovery
- Auth sources
- Schema compatibility
- Model-specific options
- Provider-specific message/request transforms

### What Makes It Feel Good

- Agents are explicit modes with different safety/tool envelopes.
- Tool calls are deeply integrated into session state and UI metadata.
- MCP and plugin tools use the same execution surface as built-ins.
- Permissions are local and composable.
- LSP diagnostics feed back after edits.
- Subagents are modeled as actual sessions.
- The API spec exposes sessions, permissions, providers, MCP, VCS diff/patch, PTY, and LSP, making the harness usable outside the TUI.

## Hermes Agent

### What It Is Doing

Hermes is the broadest harness in this folder. It is not only a coding agent. It is a long-running autonomous assistant with coding capabilities, persistent memory, skills, messaging-platform gateways, cron jobs, remote terminal backends, MCP, browser/computer-use tooling, and research trajectory export.

Key source areas:

- Agent loop: `run_agent.py`, extracted pieces in `agent/conversation_loop.py`
- Tool registry: `tools/registry.py`
- Tool execution: `agent/tool_executor.py`
- Tool implementations: `tools/*`
- Environment backends: `tools/environments/*`
- Providers: `providers/*`, `plugins/model-providers/*`
- Docs: `website/docs/developer-guide/*`, `website/docs/user-guide/features/*`
- TUI bridge: `ui-tui/*`, `tui_gateway/*`

### Harness Shape

Hermes' harness centers on `AIAgent`, a large Python orchestration engine. The docs describe its responsibilities as:

- Build system prompt
- Resolve provider/API mode
- Make interruptible model calls
- Execute tools sequentially or concurrently
- Maintain conversation history
- Compress context
- Retry and fail over models
- Track iteration budgets
- Flush memory before context loss
- Persist sessions

The main agent loop supports three API modes:

- `chat_completions`
- `codex_responses`
- `anthropic_messages`

All three converge to an internal OpenAI-style message format. That is a classic harness move: normalize wildly different provider APIs into one internal protocol.

### Tool System

Hermes has the largest tool surface. Its docs describe 70+ tools across about 28 toolsets.

High-level categories include:

- Web search and extraction
- X/Twitter search
- Terminal and file tools
- Browser automation
- Vision, image generation, video, TTS
- Todo, clarify, code execution
- Delegation/subagents
- Memory and session search
- Cron jobs and message delivery
- Home Assistant and other integrations
- MCP tools
- RL/training support

The tool registry is self-registering. Each Python module calls `registry.register(...)` at import time with:

- Tool name
- Toolset
- JSON schema
- Handler
- Availability check
- Required env vars
- Async flag
- Description and display metadata

The registry scans files using AST to find top-level `registry.register()` calls, imports those modules, then layers in MCP and plugin tools.

### Toolsets

Hermes exposes toolsets as a first-class concept. This is one of its best harness ideas. Toolsets let it adapt capability bundles by platform and task:

- CLI can expose rich local tooling.
- Messaging platforms can expose safer subsets.
- Subagents can be given only `terminal,file` or only `web`.
- MCP servers become dynamic toolsets.

This matters because "all tools all the time" makes models worse. Hermes instead gives the model a curated capability surface.

### Terminal And Environment Backends

Hermes has a serious execution-environment layer. The terminal tool supports:

- Local
- Docker
- SSH
- Singularity/Apptainer
- Modal
- Daytona
- Vercel Sandbox

The shared environment model spawns commands through backend abstractions, supports activity callbacks, interruption, persisted working-directory behavior, and sandbox storage.

This is a major differentiator. Hermes treats the workspace runtime as mobile: the agent can live on a VPS, container, cloud sandbox, GPU cluster, or messaging gateway.

### Subagents And Parallelism

Hermes has a `delegate_task` tool that spawns isolated child `AIAgent` instances. Children get fresh context, selected toolsets, their own terminal sessions, and final summaries returned to the parent.

The delegation design is explicit about context isolation: the child knows nothing except the `goal` and `context` passed by the parent. Batch delegation runs in parallel with a configurable concurrency limit. Nested delegation can be enabled for orchestrator children with depth limits.

This is a good harness pattern: subagents should be cheap context forks with bounded tool access and bounded recursion.

### Memory, Skills, And Learning Loop

Hermes is unusually opinionated about long-term learning:

- `MEMORY.md` and `USER.md` are bounded curated memory files.
- Session search uses SQLite FTS5 for cross-session recall.
- Skills are progressive-disclosure knowledge documents.
- The agent can create and improve skills.
- External memory providers can add deeper storage.

The memory system uses a frozen snapshot in the system prompt for prompt-cache stability. Live memory writes persist immediately but do not mutate the in-flight prompt. That is a subtle but important harness design: keep the prompt prefix stable even while the runtime state changes.

### Provider/Model Handling

Hermes has provider profiles with declarative fields and override hooks:

- Base URL
- API mode
- Env vars
- Model catalog/fallback models
- Message preparation
- Extra request body construction
- Live model fetching

Provider profiles are loaded from bundled and user model-provider plugins. The shared resolver is used by CLI, gateway, cron, ACP, and auxiliary calls.

Hermes also has fallback provider chains and auxiliary model routing for vision, compression, web extraction, memory flushes, and other side tasks.

### What Makes It Feel Good

- Huge tool surface is organized into toolsets.
- The agent can run anywhere, not just the local terminal.
- Messaging gateway makes the same harness work over many platforms.
- Strong interrupt/progress callback surfaces.
- Persistent memory and session search make cross-session work coherent.
- Delegation is visible, bounded, and toolset-scoped.
- Provider profiles keep model/provider quirks centralized.
- Cron turns natural-language tasks into scheduled agent runs.

## Pi

### What It Is Doing

Pi is the most explicit about being a harness. Its README calls it a "minimal terminal coding harness." It has a low-level `pi-agent-core`, a user-facing `pi-coding-agent`, a unified `pi-ai` provider layer, TUI primitives, web UI components, SDK, and RPC mode.

Key source areas:

- Harness docs: `packages/agent/docs/agent-harness.md`
- Durable harness notes: `packages/agent/docs/durable-harness.md`
- Core harness: `packages/agent/src/harness/agent-harness.ts`
- Low-level loop: `packages/agent/src/agent-loop.ts`
- User-facing session wrapper: `packages/coding-agent/src/core/agent-session.ts`
- Built-in tools: `packages/coding-agent/src/core/tools/*`
- Extension system: `packages/coding-agent/src/core/extensions/*`
- SDK/RPC docs: `packages/coding-agent/docs/sdk.md`, `packages/coding-agent/docs/rpc.md`

### Harness Shape

Pi's `AgentHarness` is the cleanest conceptual model in the repo. The docs define it as the orchestration layer above the low-level agent loop. It owns:

- Session persistence
- Runtime configuration
- Resource resolution
- Operation locking
- Extension-facing mutation semantics
- Turn snapshots
- Pending session writes
- Save points
- Queue handling

The important abstraction is the turn snapshot. For each LLM turn, Pi snapshots:

- Persisted session messages
- Resources
- System prompt
- Model
- Thinking level
- Tools
- Active tools
- Stream options
- Session ID

Changes made during a turn update future snapshots, not the current provider request. This is one of the clearest harness designs here.

### Tool System

Pi intentionally ships a small default coding toolset:

- `read`
- `bash`
- `edit`
- `write`

It also has read-only helpers:

- `grep`
- `find`
- `ls`

The design is conservative. Pi skips built-in subagents and plan mode by default. Instead, it expects users or packages to add those behaviors through extensions, skills, prompt templates, or SDK integrations.

### Extensions

Pi's extension system is very powerful for a small harness. Extensions can:

- Register custom tools
- Subscribe to lifecycle events
- Block or modify tool calls
- Inject context
- Customize compaction
- Prompt users via UI
- Render custom TUI components
- Register custom commands and shortcuts
- Append durable session entries
- Customize tool/message rendering

Extensions run from global or project-local folders and can hot-reload with `/reload`. They are TypeScript modules loaded with `jiti`.

This is Pi's strongest design bet: keep the default harness small, but make it easy to specialize without forking.

### Session Model

Pi sessions are JSONL files. Entries form a tree via `id` / `parentId`, enabling in-place branching. Session entries include normal LLM messages plus Pi-specific entries like:

- Bash execution messages
- Custom extension messages
- Branch summaries
- Compaction summaries

The durable harness notes argue that the session log should be the durable source of truth for both transcript and harness state. Non-serializable runtime dependencies, such as tool implementations and auth providers, must be recreated by the host app on resume.

### Event Model

Pi's low-level agent core emits a detailed event stream:

- `agent_start`
- `turn_start`
- `message_start`
- `message_update`
- `message_end`
- `tool_execution_start`
- `tool_execution_update`
- `tool_execution_end`
- `turn_end`
- `agent_end`

Tool execution supports parallel and sequential modes. In parallel mode, tool completion events can arrive in completion order, while persisted tool-result messages remain in assistant source order.

This is exactly the kind of detail that makes UIs feel good: stream progress live, but keep transcript ordering deterministic.

### Queueing

Pi has explicit steering and follow-up queues:

- Steering is delivered after the current assistant turn finishes tool calls, before the next model call.
- Follow-up is delivered only after the agent finishes all work.
- Queue mode can be `one-at-a-time` or `all`.

This is another harness feature that users feel immediately. It solves the "I want to redirect the agent while it is working" problem without corrupting the current tool turn.

### Provider/Model Handling

Pi separates provider support into `pi-ai`, a unified multi-provider API. It supports provider/model catalogs, thinking-level mapping, cost calculation, stream functions, API key resolution, OAuth/subscription paths through the coding-agent layer, and custom providers.

The user-facing README lists subscription paths for Anthropic Claude, OpenAI ChatGPT/Codex, and GitHub Copilot, plus API-key paths for many providers such as Anthropic, OpenAI, Azure, Gemini, Bedrock, Mistral, Groq, xAI, OpenRouter, Vercel AI Gateway, Hugging Face, Fireworks, Together, Kimi, MiniMax, Xiaomi, and more.

### What Makes It Feel Good

- The harness lifecycle is explicit and testable.
- Turn snapshots prevent mid-request mutation bugs.
- Save points make future context/model/tool changes deterministic.
- Minimal default tools reduce model confusion.
- Extensions are broad enough to build your own workflow.
- SDK and RPC make it embeddable.
- Session tree enables branching and compaction without losing history.
- Tool and message events are deterministic enough for polished UIs.

## T3 Code

### What It Is Doing

T3 Code is different from the other three. It is a web/desktop GUI and orchestration harness around existing coding-agent providers. It currently supports Codex, Claude, and OpenCode. It does not try to own every tool implementation. Instead, it wraps provider-native runtimes and normalizes their events into a common server-side orchestration model.

Key source areas:

- Architecture docs: `.docs/architecture.md`
- Provider docs: `.docs/provider-architecture.md`, `docs/providers/*`
- Provider adapter contract: `apps/server/src/provider/Services/ProviderAdapter.ts`
- Provider service: `apps/server/src/provider/Layers/ProviderService.ts`
- Provider adapters: `apps/server/src/provider/Layers/*Adapter.ts`
- Orchestration: `apps/server/src/orchestration/*`
- Contracts: `packages/contracts/src/*`
- Runtime modes: `.docs/runtime-modes.md`

### Harness Shape

T3 has a Node.js WebSocket server that serves a React app and coordinates providers, terminal sessions, git/checkpoints, and filesystem operations. The browser talks to the server through typed WebSocket requests and receives ordered typed pushes.

The core layers are:

- `ProviderService`: cross-provider routing and session lifecycle
- `ProviderAdapter`: provider-specific runtime contract
- `ProviderRuntimeIngestion`: converts provider-native events into orchestration commands
- `ProviderCommandReactor`: dispatches provider calls from orchestration intent
- `CheckpointReactor`: captures git checkpoints and turn diffs
- `OrchestrationEngine`: turns commands into persisted domain events and read models
- `RuntimeReceiptBus`: emits completion receipts so tests/UI can wait for quiescence

### Provider Adapter Contract

The `ProviderAdapter` interface is the key harness boundary. Each provider implements:

- `startSession`
- `sendTurn`
- `interruptTurn`
- `respondToRequest`
- `respondToUserInput`
- `stopSession`
- `listSessions`
- `hasSession`
- `readThread`
- `rollbackThread`
- `stopAll`
- `streamEvents`

This is a clean abstraction for wrapping agents that already have their own tools and internal loops. T3's harness asks: "Can I make Codex, Claude, and OpenCode look like the same provider runtime to my UI?"

### Event Normalization

T3 converts provider-native events into canonical runtime/orchestration events. For OpenCode, the adapter maps:

- Tool names to lifecycle item types like command execution, file change, web search, MCP tool call, image view, collab-agent call, or dynamic tool call.
- Permissions to request types like command approval, file-read approval, file-change approval.
- Provider questions and approvals into shared request/response flows.

Codex events receive similar normalization for canonical item types, request types, token usage, and turn status.

### Runtime Modes

T3 exposes a global runtime mode switch:

- `Full access`: `approvalPolicy: never`, `sandboxMode: danger-full-access`
- `Supervised`: `approvalPolicy: on-request`, `sandboxMode: workspace-write`, with in-app approvals

Because T3 wraps providers, its safety model is partly configuration of provider runtimes and partly normalization of provider approval requests into the T3 UI.

### Checkpointing And Diffs

T3's harness is especially focused on turning provider activity into stable app state:

- Threads hold messages, activities, checkpoints, and session state.
- Checkpoints are workspace snapshots.
- Turn diffs summarize file changes for one turn.
- Receipts signal when async milestone work has quiesced.

That gives the GUI a more app-like workflow: show changed files, restore checkpoints, follow turn lifecycle, and keep provider-native noise out of the user's mental model.

### Provider Account Isolation

The provider docs show a lot of care around multi-account setups:

- Codex can use shared `CODEX_HOME` with a separate shadow auth home for work/personal accounts.
- Claude uses separate homes because Claude Code stores account/local state across multiple files.
- Environment variables can be attached to provider instances, with sensitive values stored as server secrets.

This is an underappreciated part of harness design. Multi-model and multi-account UX is mostly state isolation, not just auth.

### What Makes It Feel Good

- A single web GUI can drive multiple provider CLIs/runtimes.
- Provider-native events are normalized into stable UI concepts.
- Ordered WebSocket pushes avoid out-of-order UI state.
- Queue-backed workers make async flows deterministic.
- Checkpoints and diffs make coding-agent work inspectable and reversible.
- Runtime modes expose safety as a simple user-facing choice.
- Provider instances make multi-account setups understandable.

## Tool Availability Matrix

| Capability | OpenCode | Hermes Agent | Pi | T3 Code |
|---|---:|---:|---:|---:|
| File read/write/edit | Yes | Yes | Yes | Via provider runtimes + server filesystem features |
| Shell/terminal | Yes | Yes, with many backends | Yes | Via provider runtimes and app terminal services |
| Search/grep/glob | Yes | Yes | Yes | Via provider runtimes / server features |
| Patch/diff | Yes | Yes | Edit/write/branch session; not patch-first by default | Strong checkpoint/diff layer |
| LSP diagnostics | Experimental built-in tool | LSP subsystem | Not primary default | Not core provider boundary |
| Web search/fetch | Yes | Yes | Extension/provider dependent | Via provider runtimes |
| Browser automation | Not primary in inspected built-ins | Yes | Extension/web-ui possible | Provider dependent |
| MCP | Yes | Yes | Not central in inspected docs | Via OpenCode/Codex providers where applicable |
| Skills | Yes | Yes, central learning loop | Yes | Provider dependent |
| Persistent memory | Session/instructions/skills; less central | Central feature | Session/extension state, not memory-first | App state/checkpoints; provider history |
| Subagents | Yes | Yes | Not built-in by default | Provider dependent |
| Plugins/extensions | Yes | Yes | Yes, very central | Provider drivers/adapters/settings |
| RPC/API embedding | Yes | Yes | Yes | Yes, WebSocket app/server |
| Multi-provider native model API | Yes | Yes | Yes | Wraps provider CLIs/runtimes |
| Checkpoints/rollback | Session/VCS/diff surfaces | Checkpoint manager + rollback docs | Session tree/fork/compact | Central checkpoint/diff model |

## Design Patterns Worth Stealing

### 1. Separate Provider Normalization From Tool Execution

All four projects need to bridge model APIs, but they draw the line differently.

- OpenCode transforms schemas and provider behavior before exposing tools.
- Hermes resolves provider runtime mode before the agent loop.
- Pi uses `pi-ai` and turn snapshots.
- T3 wraps entire provider runtimes behind adapters.

The reusable idea: choose one internal event/message/tool shape, and force provider quirks to the boundary.

### 2. Snapshot A Turn

Pi documents this best. A turn should have a stable snapshot of model, tools, resources, system prompt, stream options, and session messages. Updates made during the turn should affect the next safe point, not mutate the in-flight provider request.

OpenCode and Hermes also reflect this through session/tool contexts and frozen prompt/memory patterns.

### 3. Make Tools Session-Aware

The best tool systems pass more than args:

- Session ID
- Call ID
- Abort signal
- Permission callback
- Metadata/progress callback
- Current model/agent info
- Message context

That is what lets tools render nicely, ask for approval, truncate safely, and clean up when interrupted.

### 4. Treat Permissions As Data

OpenCode's wildcard permission rules, Hermes' approval/toolset system, Pi's extension preflight hooks, and T3's runtime modes all point to the same lesson: approval policy should be data that can be inspected, overridden, and projected into UI.

### 5. Keep Tool Surfaces Curated

Hermes has many tools, but toolsets keep them manageable. Pi has few tools by default and expects extensions. OpenCode has agent-specific tool permissions. T3 relies on provider-native toolsets and normalizes events.

Every project avoids a naive "dump every possible function into the model" approach.

### 6. Make Work Interruptible

Good harnesses need interruption at multiple levels:

- Provider request
- Tool execution
- Shell process
- Subagent
- UI queue

Hermes and Pi are especially explicit about this. OpenCode passes abort signals into tools. T3 exposes `interruptTurn`.

### 7. Make Streaming Observable But Persistence Deterministic

Pi's parallel tool mode is a good example: stream completion events as they happen, but persist tool result messages in assistant source order.

T3 has the same principle at the app level: ordered pushes and queue-backed workers make UI state stable even while provider runtime events arrive asynchronously.

### 8. Use Durable Boundaries, Not Magical Resumption

Pi's durable harness docs say provider streams are not resumable. Recovery should restart from durable boundaries or mark operations interrupted.

T3 similarly uses checkpoints, domain events, projections, and receipts. Hermes persists sessions in SQLite and uses lineage across compression. This is more realistic than trying to resume arbitrary in-flight model/tool work.

### 9. Make Subagents Real

OpenCode and Hermes model subagents as isolated sessions/agents with scoped context and tools. That is better than hiding them as ad hoc helper calls because it makes permissions, costs, results, and interruption manageable.

### 10. Account/Provider State Isolation Matters

T3's provider docs are a reminder that model UX includes account state. If two providers share a local home, users may expect old threads to continue. If they use separate homes, the harness should treat them as different environments.

## Most Interesting Contrasts

### OpenCode vs Pi

OpenCode ships a more complete opinionated coding-agent harness out of the box. Pi ships a smaller core and puts more weight on extensions, SDK, and packageability.

If you want a product-like default, OpenCode's approach is stronger. If you want a library-like harness for experimentation, Pi's approach is cleaner.

### Hermes vs OpenCode

OpenCode is coding-first. Hermes is autonomy-first. Hermes has more platform, memory, scheduling, and remote-environment surface area. OpenCode's TypeScript/Effect architecture appears more modular around typed services and config, while Hermes has a large pragmatic Python agent loop with many adapters around it.

### T3 vs The Others

T3 is not trying to be the smartest agent. It is trying to be the best control plane over agents. Its harness value is in normalization, UI, checkpoints, provider accounts, approvals, and event-sourced state.

This is a powerful path if you believe Codex/Claude/OpenCode will keep improving and you want to build the cockpit around them.

## Practical Definition For Your Research

For agentic coding, a harness is:

> The deterministic runtime around a nondeterministic model that owns tools, state, safety, provider adaptation, context, UI events, and recovery.

The model is the engine. The harness is the car, dashboard, brakes, road rules, maintenance log, garage, and sometimes the traffic controller.

## Questions To Ask When Evaluating A Harness

1. What is the internal message/event format?
2. Where are provider quirks normalized?
3. Are tools plain functions or session-aware operations?
4. How are permissions represented and surfaced to the user?
5. Can the user interrupt provider calls, shell commands, and subagents?
6. What gets persisted after each turn?
7. What happens if the process crashes mid-tool call?
8. How does the harness manage context pressure and compaction?
9. How are models selected, scoped, and switched?
10. Can extensions add tools, prompts, UI, hooks, and durable state?
11. How are subagents isolated?
12. Does the UI show tool calls, diffs, costs, approvals, and checkpoints clearly?
13. Can the harness be embedded through SDK/RPC/API?
14. Is account/auth state isolated well enough for real work and teams?

## Source Notes

This report is based on local repository inspection, especially these files:

- `opencode/README.md`
- `opencode/packages/opencode/src/agent/agent.ts`
- `opencode/packages/opencode/src/session/tools.ts`
- `opencode/packages/opencode/src/tool/registry.ts`
- `opencode/packages/opencode/src/tool/task.ts`
- `opencode/packages/opencode/src/provider/provider.ts`
- `opencode/packages/opencode/src/plugin/index.ts`
- `hermes-agent/README.md`
- `hermes-agent/website/docs/developer-guide/architecture.md`
- `hermes-agent/website/docs/developer-guide/agent-loop.md`
- `hermes-agent/website/docs/developer-guide/tools-runtime.md`
- `hermes-agent/website/docs/developer-guide/provider-runtime.md`
- `hermes-agent/website/docs/user-guide/features/tools.md`
- `hermes-agent/website/docs/user-guide/features/delegation.md`
- `hermes-agent/website/docs/user-guide/features/memory.md`
- `hermes-agent/tools/registry.py`
- `hermes-agent/agent/tool_executor.py`
- `hermes-agent/tools/environments/base.py`
- `pi/README.md`
- `pi/packages/agent/docs/agent-harness.md`
- `pi/packages/agent/docs/durable-harness.md`
- `pi/packages/agent/README.md`
- `pi/packages/agent/src/harness/agent-harness.ts`
- `pi/packages/coding-agent/README.md`
- `pi/packages/coding-agent/docs/extensions.md`
- `pi/packages/coding-agent/docs/sdk.md`
- `pi/packages/coding-agent/docs/rpc.md`
- `pi/packages/coding-agent/docs/session-format.md`
- `pi/packages/coding-agent/src/core/tools/index.ts`
- `t3code/README.md`
- `t3code/.docs/architecture.md`
- `t3code/.docs/provider-architecture.md`
- `t3code/.docs/runtime-modes.md`
- `t3code/.docs/encyclopedia.md`
- `t3code/apps/server/src/provider/Services/ProviderAdapter.ts`
- `t3code/apps/server/src/provider/Layers/ProviderService.ts`
- `t3code/apps/server/src/provider/Layers/OpenCodeAdapter.ts`
- `t3code/apps/server/src/provider/Layers/CodexAdapter.ts`
- `t3code/docs/providers/codex.md`
- `t3code/docs/providers/claude.md`
