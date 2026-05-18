# 059 — Agent command tool approvals

**Status:** Done — model-requested `run_command` now requires inline user approval, uses the existing one-shot command policy path, returns rejection/results to the model, and stays separate from the human terminal.

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` before changing agent activity rows, approval dialogs, terminal warnings, or command result UI.

## Why this story exists

Story **034** intentionally excluded autonomous command execution. That was the right V1 boundary. The agent can read/search, but it cannot verify behavior with `npm test`, inspect git through commands, or run safe diagnostics without asking the user to do it manually.

This story adds a guarded model-requested command tool while keeping a bright line between agent command execution and the human PTY terminal work planned in stories **050–055**.

## Goals

- Let the agent request one-shot commands through the existing guarded spawn path (`run-command-policy`, `runCommandInRootForAgent`).
- Require user approval before any model-requested command runs in V1.
- Show command, root, timeout, and policy classification before approval.
- Stream/summarize command output as tool activity without flooding chat.
- Keep the model unable to type into the human PTY terminal.

## Tool behavior

Add a new agent tool, likely `run_command`, but gate it behind approval:

- The model proposes `{ rootId, command, timeoutMs, purpose }`.
- Main evaluates policy with existing `run-command-policy`.
- Renderer receives an approval-needed event.
- User can approve, reject, or copy/insert into terminal later.
- If approved, main runs the command through the one-shot command runner.
- The command output is capped and returned to the model as a tool result.

V1 default should be conservative:

- ask before every model-requested command
- hard-denied commands remain impossible
- soft-risk commands show the policy reason prominently
- network/install commands should require explicit approval even if not caught by the current soft-risk rules

## UX requirements

- Approval dialog or inline card must show:
  - command
  - selected root label/path
  - purpose from the model
  - timeout
  - policy result/reason
- Activity transcript should show:
  - awaiting approval
  - running
  - exit code
  - truncated/timed-out state
- Rejection should return a clear tool result to the model so it can continue without pretending it ran.

## Boundaries

- Do not implement a PTY terminal here.
- Do not allow the model to type into an existing human terminal session.
- Do not auto-run commands by default.
- Do not claim command execution is sandboxed; it starts in a root cwd with guardrails.

## Testing

- Policy tests for hard-denied, soft-risk, harmless, and network/install examples.
- Agent runner tests for approval-required, approved, rejected, timed-out, and truncated command paths.
- UI/manual tests for approval card clarity and cancellation.

## Acceptance criteria

- [x] Model-requested commands require explicit approval by default.
- [x] Approved commands use the existing guarded one-shot command path.
- [x] Rejected commands return a tool result to the model.
- [x] Human terminal and agent command tool remain separate concepts.
- [x] Activity UI makes command state and risk understandable.

## Implementation notes

- Added `run_command` to the agent tool list with `{ rootId, command, timeoutMs, purpose }`.
- Main process evaluates hard-deny, soft-risk, and network/install risk before asking the renderer for approval.
- Inline chat approval cards show command, root, purpose, timeout, policy/risk reason, and Approve/Reject/Copy actions.
- Approved commands run through the existing guarded one-shot command runner, not the human terminal path.
- Rejected commands return a tool result telling the model the user declined the command.
- Agent command execution captures capped stdout/stderr for the model while preserving the existing terminal command UI stream path for human-triggered commands.
- Verification: `npm run typecheck`, `npm run test -- --run`, focused command-policy/agent-command tests, and `npm run build` passed.
