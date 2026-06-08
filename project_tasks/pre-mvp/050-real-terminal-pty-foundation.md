# 050 — Real terminal PTY foundation

**Status:** Done — added a `node-pty` backed main-process terminal session service, shared IPC contract, preload bridge, lifecycle cleanup, fake-PTY unit tests, and a thin renderer panel that can start sessions, stream output, send stdin, resize, send Ctrl+C, and kill on close. Rich terminal emulation/tabs remain scoped to **051–052**.

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` before changing terminal chrome, panels, tabs, status rows, or command approval UI.

## Why this story exists

The current “terminal” is really a command runner:

- user types one command into an input
- main runs it with `child_process.spawn(..., shell: true)`
- stdout/stderr stream into a `<pre>`
- the process ends and the result is shown

That was enough for story **017**, but it is not a traditional terminal. A Cursor/Codex-style terminal needs a long-lived shell process connected to a pseudo-terminal (PTY), with interactive stdin/stdout, terminal escape sequence rendering, resizing, Ctrl+C, and session lifecycle.

This story creates the backend foundation for a real embedded terminal.

## Current state

- `run-command` IPC executes one command and resolves when it exits.
- No persistent terminal session.
- No stdin after process start.
- No shell prompt controlled by a PTY.
- No terminal resize.
- No interactive commands like `npm create`, `git commit`, `python`, `node`, `ssh`, `vim`, or prompts.
- Output is plain text, not terminal-emulated.

## Summary

Add a PTY-backed terminal session service in the main process. Keep `run-command` for trusted one-shot command/tool execution, but introduce a separate terminal-session API for interactive human terminal use.

## Goals

- Create long-lived terminal sessions per workspace root.
- Use a real PTY library suitable for Electron/Node.
- Stream terminal output as bytes/text events.
- Accept user input after session start.
- Support resize events from renderer.
- Support process termination.
- Preserve root-scoped starting cwd.
- Keep terminal sessions main-process-owned.

## Dependency decision

Likely dependency:

- `node-pty`

Considerations:

- native module packaging with Electron
- rebuild requirements
- macOS/Windows/Linux support
- electron-vite packaging
- CI build implications

If `node-pty` is too heavy initially, document why and choose an alternative, but do not pretend `child_process.spawn` is enough for a full terminal.

## Proposed IPC

New shared contract, e.g. `src/shared/terminal-session-contract.ts`:

```ts
type TerminalSessionStartRequest = {
  rootId: string
  cols: number
  rows: number
  shell?: string
}

type TerminalSessionStarted = {
  sessionId: string
  rootId: string
  cwd: string
  shell: string
}

type TerminalSessionData = {
  sessionId: string
  data: string
}

type TerminalSessionExit = {
  sessionId: string
  exitCode: number | null
  signal?: string | null
}
```

IPC:

- `terminal-session-start`
- `terminal-session-input`
- `terminal-session-resize`
- `terminal-session-kill`
- events:
  - `terminal-session-started`
  - `terminal-session-data`
  - `terminal-session-exit`
  - `terminal-session-error`

## Session lifecycle

- A session starts in selected root cwd.
- If root path disappears, fail clearly.
- Session remains alive while terminal panel is open.
- Closing a terminal tab prompts or kills depending on UX choice in **052**.
- Project switch kills all sessions for the old project.
- App quit kills sessions.

## Environment

Use a more terminal-appropriate environment than `run-command`, while still avoiding app secrets:

- include `PATH`, `HOME`, `SHELL`, locale vars
- do not inject xAI keys or app secrets
- consider setting `TERM=xterm-256color`
- consider setting a GrokForge marker env var, e.g. `GROKFORGE_TERMINAL=1`

## Security posture

This is human-driven trusted developer tooling, not a sandbox. Keep docs honest:

- starts in selected root
- not jailed to root
- user can run arbitrary shell commands
- model/autonomous commands should use the separate guarded tool path, not an unrestricted PTY

## Non-goals

- Do not replace `run-command` yet.
- Do not let the model write arbitrary PTY input.
- Do not build terminal UI tabs here; see **052**.
- Do not implement command palette integration here.

## Testing

Unit tests where practical:

- session registry starts/stops sessions
- invalid root rejected
- resize validates cols/rows
- input to unknown session rejected

Manual QA:

- start shell in root
- run `pwd`
- run interactive `node`
- Ctrl+C long-running process
- resize terminal and verify layout updates
- close project and verify process exits

## Acceptance criteria

- [x] Main process has a PTY-backed terminal session service.
- [x] Renderer can start a session, receive output, send input, resize, and kill it.
- [x] Sessions start in selected workspace root cwd.
- [x] Project switch/app quit cleans up live sessions.
- [x] `run-command` remains available for one-shot guarded command execution.
- [x] Docs distinguish human terminal sessions from model/tool command execution.

## Key files

- `src/main/terminal-session.ts` (new)
- `src/shared/terminal-session-contract.ts` (new)
- `src/main/main.ts`
- `src/preload/preload.ts`
- `package.json`
- `AGENTS.md`

## Completion bookkeeping

When this story ships: update its **Status** line, the progress table in [`README.md`](README.md), and run **`npm run stories:html`** at the repo root so [`stories.html`](stories.html) stays in sync.
