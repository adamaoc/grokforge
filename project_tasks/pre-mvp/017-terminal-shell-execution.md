# 017 — Terminal / shell execution (trusted command runner, per-root cwd)

**Status note:** Story **017** shipped the original **one-shot guarded command runner** (including renderer IPC). Stories **050–053** added **human PTY terminals**; story **055** removed the **human** `run-command` IPC path. **Today:** humans use **`terminal-session-*`** only; the same spawn + policy stack in **`src/main/run-command.ts`** is **main-only** for the agent **`run_command`** tool after in-chat approval (**059**). This is **not** a sandbox or shell jail.

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` for terminal panel chrome (zinc background, monospace, scroll).

## Summary

Add optional command runner: execute shell commands with `cwd` set to a chosen root’s `path`, stream stdout/stderr to UI, enforce catastrophic denylist / confirmation policy and timeouts. This is trusted developer tooling, not a containment boundary.

## Scope

- **Historical:** Renderer `run-command` IPC + stream events (removed in **055**).
- Main: `child_process.spawn` with env sanitization; catastrophic / soft-risk policy (**`run-command-policy.ts`**).
- **Current human UX:** PTY + xterm via **`terminal-session-*`** (**050–052**), not this story’s original minimal runner view.

## Acceptance criteria

- [x] Default deny for `rm -rf /` style patterns or run only on explicit user confirmation—document policy.
- [x] Commands start in the selected root cwd, with documentation that shell syntax can still leave that cwd and this is not a sandbox.
- [x] Long output truncates with “show more” or hard cap + message.

## Key files

- `src/main/run-command.ts`, `src/main/run-command-policy.ts`, `src/shared/run-command-contract.ts`
- Agent wiring: `src/main/agent-runner.ts` (approved **`run_command`** tool)
- Human terminal: `src/main/terminal-session.ts`, `src/renderer/src/components/TerminalPanel.tsx`

## Completion bookkeeping

When this story ships: update its **Status** line, the progress table in [`README.md`](README.md), and run **`npm run stories:html`** at the repo root so [`stories.html`](stories.html) stays in sync.
