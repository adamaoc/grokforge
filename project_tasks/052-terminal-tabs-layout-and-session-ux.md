# 052 — Terminal tabs, layout, and session UX

**Status:** Done — terminal panel now supports multiple root-aware xterm sessions, tab switching/closing, new-session root selection, explicit kill/restart/clear controls, hide/show without killing live sessions, and a resizable vertical split integrated into the main workspace shell.

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` before changing terminal tabs, panel sizing, root selectors, or toolbar controls.

## Why this story exists

Cursor/Codex-style terminals are not just a single shell. Users expect multiple terminal sessions, clear root/cwd ownership, restart/kill controls, and a resizable panel that can stay open while editing/chatting.

This story builds the terminal UX around the PTY/emulator foundation from **050** and **051**.

## Summary

Add multi-session terminal tabs, root-aware session creation, and a resizable terminal panel integrated into the main shell layout.

## Goals

- Multiple terminal sessions per project.
- Terminal tabs with labels.
- New terminal button.
- Root selector for new sessions.
- Rename terminal tab or auto-label by shell/root.
- Close tab with confirmation if process is still running.
- Restart/kick terminal session.
- Preserve sessions while panel is hidden, unless explicitly killed.
- Resizable terminal height.

## Layout

Current terminal is a fixed `h-52` panel. Replace with a vertical split:

- main editor/chat area above
- terminal panel below
- draggable resize handle
- terminal panel remembers height

Coordinate with story **024**, which already noted vertical terminal resizing as a follow-up.

## Session tabs

Each tab should show:

- shell/root label
- running/exited indicator
- close button

Controls:

- `+` new terminal
- trash/clear scrollback
- kill/restart
- close panel

Keep toolbar dense and restrained.

## Root/cwd behavior

- New terminal defaults to active root.
- If no active root, use first project root.
- User can pick another root before creating session.
- Display cwd or root label clearly.
- If active root changes, existing terminal sessions do not silently move; they remain attached to their original cwd.

## Persistence

First version:

- sessions live only for current app process/project session
- switching projects kills sessions

Later:

- optional restore terminal layout, not shell process

## Non-goals

- No terminal multiplexing beyond tabs.
- No split terminals in one panel yet.
- No persistent process restore across app restart.
- No shell integration markers or command timeline yet.

## Testing

Manual QA:

- open terminal panel
- create two terminals for different roots
- switch tabs
- hide/show panel and verify sessions still run
- close running session and confirm behavior
- resize terminal panel
- switch projects and verify sessions cleaned up

## Acceptance criteria

- [x] User can create multiple terminal sessions.
- [x] Each session has a tab and clear root/cwd identity.
- [x] Terminal panel height is resizable.
- [x] Hiding/showing the panel does not accidentally kill sessions.
- [x] Closing/killing sessions is explicit and understandable.
- [x] Project switch cleans up sessions.

## Key files

- `src/renderer/src/App.tsx`
- `src/renderer/src/components/TerminalPanel.tsx`
- `src/renderer/src/components/terminal/*`
- `src/main/terminal-session.ts`
- `src/shared/terminal-session-contract.ts`

## Completion bookkeeping

When this story ships: update its **Status** line, the progress table in [`README.md`](README.md), and run **`npm run stories:html`** at the repo root so [`stories.html`](stories.html) stays in sync.
