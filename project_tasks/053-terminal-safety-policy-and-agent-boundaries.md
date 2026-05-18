# 053 — Terminal safety policy and agent boundaries

**Status:** Done — human PTY terminals remain trusted user-only tooling, model commands stay on the guarded `run_command` approval path, terminal UI now shows a non-blocking trust/sandbox note, stale sandbox wording in story **017** is corrected, story **036** closure is aligned, and tests assert PTY terminal APIs are not exposed as agent tools.

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` before changing command approval UI, terminal warnings, or model/tool activity displays.

## Why this story exists

A real human terminal is intentionally powerful. Users should be able to run normal shell workflows. But GrokForge also has an agent, and future story **034** will let the model request tools. We must keep a clean boundary between:

- human-driven interactive terminal sessions
- model-requested command tools
- one-shot guarded command runner behavior

If this boundary is blurry, the app can become unsafe or confusing.

## Summary

Clarify and enforce terminal safety semantics after introducing PTY sessions. Keep interactive terminals for trusted human use, and keep model/tool commands on a separate guarded path with explicit approvals.

## Current policy

`run-command` currently:

- starts in selected root cwd
- uses sanitized env
- blocks catastrophic patterns
- requires confirmation for softer destructive risks
- caps output
- times out

PTY terminal sessions will differ:

- no per-command static policy can reliably inspect all user input
- no timeout by default
- interactive programs need stdin
- user is explicitly driving the terminal

## Goals

- Update `AGENTS.md`, README, and task docs to distinguish terminal modes.
- Keep `run-command` or successor for model/tool one-shot commands.
- Do not let the model directly type into the human PTY by default.
- Add clear UI copy that a terminal is trusted developer tooling, not a sandbox.
- Decide whether any warning appears on first terminal open.

## Recommended boundary

Human terminal:

- PTY-backed
- user input only
- no command policy prompt per shell line
- root cwd starting point only
- no sandbox claim

Agent command tool:

- not a PTY
- structured request
- policy checks
- approval flow
- output cap
- timeout
- result summarized back to model

One-shot run command:

- may remain for UI/agent tooling or be folded into agent command tool later

## UX requirements

- First terminal open may show a small non-blocking note:
  - “Terminal starts in the selected root. It is trusted developer tooling, not a sandbox.”
- Model/tool command approvals should not reuse the human terminal UI without clear labeling.
- If future agent output suggests commands, offer “Run in terminal” only after user action.

## Docs to update

- `AGENTS.md`
- `README.md`
- `project_tasks/017-terminal-shell-execution.md`
- `project_tasks/036-terminal-policy-doc-and-behavior-alignment.md`
- new terminal-session stories when shipped

## Testing

- Verify model/tool IPC cannot write to PTY session without explicit user action.
- Verify project switch kills PTY sessions.
- Verify command-tool policy tests still pass.

## Acceptance criteria

- [x] Human PTY terminal and agent command execution are separate concepts in code and docs.
- [x] Model cannot silently type into a human terminal session.
- [x] Terminal UI copy accurately describes trusted-developer tooling.
- [x] Existing `run-command-policy` tests remain meaningful for model/tool command path.
- [x] Story **036** is updated or resolved consistently with this terminal architecture.

## Key files

- `AGENTS.md`
- `README.md`
- `src/main/run-command.ts`
- `src/main/run-command-policy.ts`
- `src/main/terminal-session.ts`
- `src/renderer/src/components/TerminalPanel.tsx`
- `project_tasks/036-terminal-policy-doc-and-behavior-alignment.md`

## Completion bookkeeping

When this story ships: update its **Status** line, the progress table in [`README.md`](README.md), and run **`npm run stories:html`** at the repo root so [`stories.html`](stories.html) stays in sync.
