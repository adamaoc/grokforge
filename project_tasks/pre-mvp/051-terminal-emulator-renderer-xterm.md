# 051 — Terminal emulator renderer with xterm.js

**Status:** Done — renderer terminal now uses `@xterm/xterm` with `@xterm/addon-fit`, direct keyboard input to the PTY session API from **050**, ANSI/VT rendering, clear scrollback, kill/restart controls, focus-on-click, and fit-based resize.

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` for terminal panel chrome, tabs, focus states, dense controls, and dark zinc surfaces.

## Why this story exists

A real PTY backend still needs a real terminal frontend. Rendering terminal output in a `<pre>` cannot handle ANSI colors, cursor movement, alternate screen, prompts, full-screen terminal apps, selection, copy/paste, or resize measurement.

This story replaces the command-runner UI with a terminal emulator component.

## Summary

Use xterm.js (or a comparable browser terminal emulator) in the renderer and connect it to the PTY session API from **050**.

## Goals

- Render ANSI/VT output correctly.
- Send keystrokes directly to the PTY.
- Support paste.
- Support terminal selection/copy.
- Fit terminal dimensions to container.
- Support resizing via addon.
- Preserve GrokForge visual language.
- Keep focus behavior natural: clicking terminal focuses it, keyboard input goes to shell.

## Likely dependencies

- `@xterm/xterm`
- `@xterm/addon-fit`
- maybe `@xterm/addon-web-links`

Confirm package names/current versions during implementation.

## UI behavior

- Terminal panel should feel like a real embedded terminal:
  - monospace terminal canvas
  - prompt from actual shell
  - no separate “Command” input
  - no separate timeout field
  - clear button clears terminal scrollback, not process
  - kill/restart controls operate session
- Preserve root/cwd display in compact header.
- Show connection/session state:
  - starting
  - running
  - exited
  - error

## Layout

Current terminal panel is fixed `h-52`. That is too small for a real terminal.

Initial acceptable layout:

- terminal opens in bottom panel
- taller default than current, e.g. 30-40% of editor area
- user can close it

Better layout is handled in **052**.

## Copy/paste

- Native copy from selection.
- Paste from clipboard with standard shortcuts.
- Consider bracketed paste support from xterm default behavior.

## Theming

Use GrokForge dark theme:

- background `#0a0a0a` or zinc-950
- foreground zinc-200/300
- cursor uses current accent
- selection visible but subdued
- ANSI colors readable on dark background

## Non-goals

- No multi-terminal tabs here; see **052**.
- No command history UI outside shell history.
- No model/tool integration.
- No terminal search yet unless xterm addon is trivial and low risk.

## Testing

Manual QA:

- shell prompt renders
- `ls --color` renders colors
- `npm run test` streams output
- `node` REPL accepts input
- Ctrl+C interrupts running command
- selection/copy works
- paste works
- resize panel and verify terminal reflows

Automated later:

- UI E2E under **037** can assert terminal starts and accepts `echo`.

## Acceptance criteria

- [x] Renderer uses a real terminal emulator, not `<pre>` output.
- [x] User can type directly into the shell.
- [x] ANSI colors/control sequences render correctly.
- [x] Terminal resizes with its container.
- [x] Clear/kill/restart controls behave predictably.
- [x] Existing one-shot `run-command` panel/input is removed or no longer the primary terminal UI.

## Key files

- `src/renderer/src/components/TerminalPanel.tsx`
- `src/renderer/src/components/terminal/TerminalEmulator.tsx` (new)
- `src/shared/terminal-session-contract.ts`
- `src/preload/preload.ts`
- `package.json`

## Completion bookkeeping

When this story ships: update its **Status** line, the progress table in [`README.md`](README.md), and run **`npm run stories:html`** at the repo root so [`stories.html`](stories.html) stays in sync.
