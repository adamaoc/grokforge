# 054 — Terminal shell integration and polish

**Status:** Done

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` before changing terminal command decorations, status indicators, search UI, or toolbar controls.

## Why this story exists

Once the terminal is a real PTY with tabs and layout, there are quality-of-life features that make it feel at home in a coding-agent app: command detection, links, search, cwd awareness, exit badges, and easier handoff between chat and terminal.

This story is for polish after the core terminal works.

## Summary

Add shell/terminal polish features inspired by Cursor/Codex-style terminals without overbuilding a full IDE terminal subsystem.

## Candidate features

- Terminal search.
- Clickable links/URLs.
- Clickable file paths that open in editor.
- Command status decorations:
  - last command exit code
  - running indicator
  - elapsed time
- Copy command output.
- “Run last command again.”
- “Open current cwd in file tree” if detectable.
- Better shell title/tab label from escape sequences.
- Bell handling.
- Command suggestions from chat:
  - user can insert suggested command into terminal
  - user explicitly presses Enter/runs it

## Shell integration caution

Do not depend on heavy shell integration scripts in the first pass unless needed. Basic xterm features and prompt behavior may be enough. If adding shell integration:

- make it optional
- document supported shells
- avoid modifying user shell config files
- avoid surprising startup behavior

## File path detection

Useful behavior:

- Detect `path:line` patterns in output.
- Click opens file in editor at line if under workspace root.
- Ignore outside-root paths or ask before opening external files.

Coordinate with search/editor line-jump behavior from story **016**.

## Non-goals

- No full terminal task runner UI.
- No integrated debugger.
- No SSH/session manager.
- No persistent terminal process restore across app restart.

## Testing

Manual QA:

- run test command that outputs file paths
- click path and verify editor opens
- use terminal search
- verify URL link opens external browser only after safe handling
- verify terminal tab title updates or falls back cleanly

## Acceptance criteria

- [x] Terminal supports at least one major polish feature beyond raw PTY rendering.
- [x] File path/link interactions are root-aware and safe.
- [x] Chat-to-terminal command insertion, if implemented, requires explicit user action.
- [x] No user shell config files are modified.
- [x] Terminal remains responsive with long output.

## Completion notes

- Added xterm web link handling through the existing safe external URL IPC path.
- Added root-scoped `path:line[:column]` terminal file links that open in the editor via the existing line-jump flow.
- Added a toolbar action to copy the active terminal scrollback buffer.
- Added unit coverage for terminal file link detection, relative cwd resolution, and outside-root/URL rejection.

## Key files

- `src/renderer/src/components/terminal/*`
- `src/renderer/src/components/TerminalPanel.tsx`
- `src/renderer/src/App.tsx`
- `src/renderer/src/lib/workspace-path-check.ts`
- `src/main/terminal-session.ts`

## Completion bookkeeping

When this story ships: update its **Status** line, the progress table in [`README.md`](README.md), and run **`npm run stories:html`** at the repo root so [`stories.html`](stories.html) stays in sync.
