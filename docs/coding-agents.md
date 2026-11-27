# External coding agents (ACP)

**Status:** Grok Build and Claude Code run chat turns end to end. The original built-in
Grok API agent loop has been removed (see `docs/i-am-a-harness.md` for its history).

GrokForge is not the agent. It drives a coding agent the user already has
installed and signed in to, so turns bill against their existing subscription (SuperGrok /
X Premium+, Claude Pro / Max) instead of pay-per-token API calls. GrokForge stays the
workspace around the agent: project roots, review gates, editor, git, terminal, voice.

## Providers

| Provider | How GrokForge starts it | Sign-in |
| --- | --- | --- |
| `grok-build` | `grok agent stdio` (native ACP) | `grok login` |
| `claude-code` | Electron's Node runs `@agentclientprotocol/claude-agent-acp` (npm dependency) with `CLAUDE_CODE_EXECUTABLE` = the user's `claude` | `claude` → `/login` |

GrokForge never handles agent credentials; each CLI does its own sign-in. Binaries are
found on `PATH` plus common install dirs (`~/.local/bin`, `~/.grok/bin`,
`~/.claude/local`, `/opt/homebrew/bin`, …) because Dock-launched macOS apps don't inherit
the shell `PATH`. Overrides: `GROKFORGE_GROK_PATH`, `GROKFORGE_CLAUDE_PATH`.

The choice is app-wide (`userData/agent-provider.json`, Settings → **Coding agent**).
With no choice saved, the first detected of Grok Build → Claude Code wins. The composer's
agent chip switches agents in place.

## Code map

| File | Role |
| --- | --- |
| `src/main/acp/json-rpc.ts` | Bidirectional newline-delimited JSON-RPC peer (the ACP stdio transport) |
| `src/main/acp/protocol.ts` | The ACP v1 types GrokForge uses |
| `src/main/acp/connection.ts` | Spawns an agent, `initialize`, `session/new`, `session/prompt`, routes agent → client calls |
| `src/main/acp/providers.ts` | CLI detection and launch specs |
| `src/main/acp/provider-registry.ts` | Selected provider (persisted) and detection cache |
| `src/main/acp/session-manager.ts` | One live agent session per project, reused across turns |
| `src/main/acp/turn.ts` | One chat turn: ACP updates → existing `AgentChatEventPayload` events |
| `src/main/acp/chat-turn.ts` | Electron glue called from `src/main/agent/runner.ts`; takes checkpoints |
| `src/main/checkpoints/shadow-repo.ts` | Shadow git repo per root: snapshot, diff, revert |
| `src/main/checkpoints/register-ipc.ts` | File diff + revert IPC for the changes card |
| `src/shared/agent/checkpoint-contract.ts` | Turn-changes DTOs |
| `src/shared/agent/provider-contract.ts` | Provider DTOs shared with preload / renderer |

## How a turn maps onto the existing UI

| ACP from agent | GrokForge event / UI |
| --- | --- |
| `agent_message_chunk` | `final_chunk` (streamed markdown) |
| `agent_thought_chunk` | "Thinking" activity row |
| `tool_call` / `tool_call_update` | activity rows (status, path or command) |
| `plan` | "Plan · n/m done" activity row |
| `session/request_permission` | approval card (`approval_required`), with diffs for edits |
| `fs/read_text_file`, `fs/write_text_file` | served by GrokForge, limited to project roots (writes also respect manifest ignore rules) |

GrokForge advertises `fs` but not `terminal`: agents run commands in their own process;
the PTY terminal stays human-only.

### Review model

| GrokForge setting | Agent session mode | Permissions |
| --- | --- | --- |
| Work + **Review edits** | `default` (ask first) | Every edit shows a diff card (Allow edit / Allow all edits this turn / Reject); commands ask |
| Work + **Auto-accept** | `acceptEdits` | Edits auto-allowed; commands and deletes still ask |
| **Plan** | `plan` | Agent plans; when the agent has no plan mode, a plan-only instruction is added |

Reads, searches, and "think" steps are always auto-allowed.

### Sessions

The agent keeps its own conversation memory, so GrokForge reuses one session per project
until the provider or working root changes, the process dies, or the chat thread starts
over. When a new session picks up an existing thread, the last few messages are passed as
context. Extra project roots are sent as `additionalDirectories`.

## Testing

- Unit: `src/main/acp/__tests__/` (JSON-RPC peer, turn mapping against an in-process fake agent).
- Electron UI: `e2e-ui/acp-agent.spec.ts` with `e2e-ui/fixtures/mock-acp-agent.mjs` via
  `GROKFORGE_ACP_AGENT_OVERRIDE` (a Node script used for both ACP providers).
- Manually verified against real CLIs: `claude` 2.1.332 (signed in; edit review + apply)
  and `grok` 1.0.92 (handshake; signed-out path shows the `grok login` guidance).

## Checkpoints and undo

Before each turn, every project root is snapshotted into a shadow git repository at
`userData/workspace-projects/<projectId>/checkpoints/<rootId>.git`. GIT_DIR lives there;
the work tree is the root, so the user's own `.git` is never touched. The root's
`.gitignore` files apply, plus manifest ignores and heavy defaults (`node_modules/`,
`dist/`, …). After the turn (including failed or cancelled turns) GrokForge diffs against
the snapshot and sends `turn_changes`. The reply's changes card shows each file's diff
and can revert one file or undo the whole turn. Because it diffs the disk, it also
catches changes made by agent shell commands.

## Known gaps / next steps

- **Grok Build signed-in flow is untested** here (no SuperGrok account in the dev
  container). Mode ids for Grok's plan / accept-edits modes are matched generically.
- **Sign-in from the app:** ACP `authenticate` is not wired; users run `grok login` /
  `claude /login` in a terminal (a failed turn offers "Open terminal to sign in").
- **Packaging:** the Claude adapter runs from `node_modules` via `ELECTRON_RUN_AS_NODE`;
  `electron-builder` excludes the SDK's bundled native Claude binary (~380 MB) since the
  user's own `claude` is used. A packaged build has not been tested.
- **Per-project agent choice** and model pickers (Claude `configOptions`, Grok
  `modelState`) are not exposed yet.
- **Checkpoint storage** grows with every turn that changes files; there is no pruning yet.
- **Step history** (the activity list) is session-only; the changes card persists.
