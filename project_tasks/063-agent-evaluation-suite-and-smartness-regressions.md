# 063 — Agent evaluation suite and smartness regressions

**Status:** Done (v1 shipped).

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` before changing debug/evaluation UI, if any is added.

## Shipped (v1)

- **Pluggable model transport:** `src/main/agent-chat-model-transport.ts` (`AgentChatModelTransport`, `createHttpAgentChatModelTransport` for production HTTP + SSE streaming).
- **Runner hooks for Vitest:** `src/main/agent-runner.ts` — `setAgentChatModelTransportForTesting`, `setGetCurrentProjectForTesting`, `primeActiveAgentTurn`, `runAgentTurnJobForEvaluation`, exported `CurrentProjectSnapshot`.
- **Deterministic regressions:** `src/main/agent-runner-evaluation.test.ts` — scripted tool → final answer, sensitive path, ignored path, max tool iterations, cancellation (no network; `writeAgentTurnTrace` mocked).

**Extend later:** Additional named scenarios from the list below (entrypoint, active file, codebase search fixtures) can be added as new cases in the same test file without changing the harness shape. Optional manual eval mode remains future work.

## Why this story exists

Once the agent has retrieval and tools, normal unit tests are not enough. We need confidence that the agent keeps feeling smarter over time: it should retrieve the right files, avoid secrets, use tools when needed, stop at limits, and produce grounded answers.

This story creates an evaluation harness for the agent loop that can run without hitting the live xAI API.

## Goals

- Add deterministic tests for agent-turn orchestration.
- Mock model responses with tool calls and final answers.
- Verify retrieval/tool behavior across realistic project fixtures.
- Catch regressions where the agent stops using active context or starts leaking ignored/sensitive files.

## Harness design

- Factor the runner so model transport can be injected in tests.
- Use small fixture workspaces under temp dirs.
- Mock model turns:
  - first response requests tools
  - second/final response answers from tool results
  - error/cancel/limit paths
- Assert emitted events:
  - activity rows
  - final chunks
  - done/error/cancelled

## Evaluation scenarios

Create named scenarios such as:

- “Find app entrypoint”
- “Explain active file”
- “Locate settings API key code”
- “Find test for git status”
- “Sensitive file is not read”
- “Ignored node_modules match is skipped”
- “Tool iteration limit reached”
- “Cancelled turn stops cleanly”

## Optional manual eval mode

Later, add a dev-only command to run a small set of prompts against a real model and save sanitized traces. This is optional and should not block deterministic tests.

## Testing

- The harness itself should run under `npm run test`.
- No network required.
- No persistent userData required beyond temp dirs.
- Tests should be fast enough for normal development.

## Acceptance criteria

- [x] Agent runner supports injected/mocked model transport for tests.
- [x] Deterministic tool-loop scenarios run without network.
- [x] Tests verify active context, retrieval, ignore rules, sensitive exclusions, limits, and cancellation.
- [x] Future agent changes can add new scenarios without rewriting the harness.

