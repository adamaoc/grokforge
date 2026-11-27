# External coding agents (ACP)

**Status:** spike (2026-11). Grok Build and Claude Code run chat turns end to end; the
built-in Grok API harness remains as the `grok-api` provider.

GrokForge no longer has to be the agent. It drives a coding agent the user already has
installed and signed in to, so turns bill against their existing subscription (SuperGrok /
X Premium+, Claude Pro / Max) instead of pay-per-token API calls. GrokForge stays the
workspace around the agent: project roots, review gates, editor, git, terminal, voice.

## Providers

| Provider | How GrokForge starts it | Sign-in |
| --- | --- | --- |
| `grok-build` | `grok agent stdio` (native ACP) | `grok login` |
| `claude-code` | Electron's Node runs `@agentclientprotocol/claude-agent-acp` (npm dependency) with `CLAUDE_CODE_EXECUTABLE` = the user's `claude` | `claude` → `/login` |
| `grok-api` | Built-in harness in `src/harness/` | xAI API key |

GrokForge never handles agent credentials; each CLI does its own sign-in. Binaries are
found on `PATH` plus common install dirs (`~/.local/bin`, `~/.grok/bin`,
`~/.claude/local`, `/opt/homebrew/bin`, …) because Dock-launched macOS apps don't inherit
the shell `PATH`. Overrides: `GROKFORGE_GROK_PATH`, `GROKFORGE_CLAUDE_PATH`.

The choice is app-wide (`userData/agent-provider.json`, Settings → **Coding agent**).
With no choice saved, the first available of Grok Build → Claude Code → Grok API wins.

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
| `src/main/acp/chat-turn.ts` | Electron glue called from `src/main/agent/runner.ts` |
| `src/shared/agent/provider-contract.ts` | Provider DTOs shared with preload / renderer |

## How a turn maps onto the existing UI

| ACP from agent | GrokForge event / UI |
| --- | --- |
| `agent_message_chunk` | `final_chunk` (streamed markdown) |
| `agent_thought_chunk` | "Thinking" activity row |
| `tool_call` / `tool_call_update` | activity rows (status, path or command) |
| `plan` | "Plan · n/m done" activity row |
| `session/request_permission` | approval card (`command_approval_required`), with diffs for edits |
| `fs/read_text_file`, `fs/write_text_file` | served by GrokForge, limited to project roots (writes also respect manifest ignore rules) |

GrokForge advertises `fs` but not `terminal`: agents run commands in their own process;
the PTY terminal stays human-only.

### Review model

| GrokForge setting | Agent session mode | Permissions |
| --- | --- | --- |
| Work + **Trust** | `default` (ask first) | Every edit shows a diff card (Allow edit / Reject); commands ask |
| Work + **Velocity** | `acceptEdits` | Edits auto-allowed; commands and deletes still ask |
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

## Known gaps / next steps

- **Grok Build signed-in flow is untested** here (no SuperGrok account in the dev
  container). Mode ids for Grok's plan / accept-edits modes are guessed generically.
- **Snippet diffs:** Claude's Edit tool sends old/new *snippets*, so diff-card line
  numbers are relative to the snippet. Locate the snippet in the file to show real lines.
- **Post-turn review:** edits an agent makes without asking (Velocity, or its own
  allow-lists) are not collected into a reviewable/undoable batch yet. A git snapshot
  before each turn would make every agent's changes reviewable and revertible.
- **Sign-in from the app:** ACP `authenticate` is not wired; users run `grok login` /
  `claude /login` in a terminal.
- **Packaging:** the Claude adapter runs from `node_modules` via `ELECTRON_RUN_AS_NODE`;
  `electron-builder` excludes the SDK's bundled native Claude binary (~380 MB) since the
  user's own `claude` is used. A packaged build has not been tested.
- **Per-project provider choice** and model pickers (Claude `configOptions`, Grok
  `modelState`) are not exposed yet.
- Legacy plan cards (`gf-plan`), proposal batches, and model-intent chips only apply to the
  `grok-api` provider.
